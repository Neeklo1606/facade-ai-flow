/**
 * Папка смет на сервисе (ADR-077): POST — загрузить файлы смет (несколько сразу), POST
 * `?reparse=<id>` — разобрать заново, GET `?file=<id>` — скачать исходный файл.
 *
 * Права проверяются здесь (ADR-012): загружают, разбирают и скачивают те, кто работает со
 * сметами (`addEstimateVersion`). Бригадир получает 403. Файл хранится на томе сервера,
 * разбор идёт на сервере тем же доменом, что во вкладке; запись — через порт от имени
 * пользователя сессии, поэтому дубли, версии и журнал те же, что в демо.
 */
import { createGasOpsDemo } from "@/adapters/gas-ops/demo";
import { retrying, type GasStore } from "@/adapters/gas-ops/store";
import type { EstimateStorage } from "@/adapters/gas-ops/estimate-storage";
import {
  MAX_ESTIMATE_FILE_BYTES,
  excelKind,
  outcomeText,
  type IntakeOutcome,
} from "@/domain/gas-ops/estimate-intake";
import type { ParsedWorkbook } from "@/domain/gas-ops/estimate-labels";
import { GasOpsError } from "@/ports/gas-ops";
import { GAS_METHOD_ROLES, actingAs } from "./gas-ops-server";

/** Сколько файлов за один запрос: папка Оксаны — до десятка смет */
export const MAX_FILES_PER_UPLOAD = 20;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export interface EstimateFilesDeps {
  store: GasStore | null;
  storage: EstimateStorage;
  userId: string | null;
  /** Разбор байтов: на сервере — SheetJS и домен; в тестах можно подменить */
  parse: (
    bytes: Uint8Array,
  ) => Promise<{ ok: true; parsed: ParsedWorkbook } | { ok: false; message: string }>;
}

export interface UploadResult {
  name: string;
  ok: boolean;
  text: string;
  outcome: IntakeOutcome | null;
}

/** Разбор байтов сметы на сервере */
export async function parseEstimateBytes(
  bytes: Uint8Array,
): Promise<{ ok: true; parsed: ParsedWorkbook } | { ok: false; message: string }> {
  const [{ sheetsOfXls, sheetsOfXlsx, EstimateFileError }, { parseEstimateWorkbook }] =
    await Promise.all([
      import("@/adapters/gas-ops/estimate-file"),
      import("@/domain/gas-ops/estimate-parse"),
    ]);
  const kind = excelKind(bytes.subarray(0, 4));
  if (!kind) return { ok: false, message: "Нужен файл сметы Excel: .xlsx или .xls" };
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  try {
    const sheets = kind === "xls" ? await sheetsOfXls(buffer) : await sheetsOfXlsx(buffer);
    return { ok: true, parsed: parseEstimateWorkbook(sheets) };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof EstimateFileError ? error.message : "Файл не читается как Excel",
    };
  }
}

async function access(
  deps: EstimateFilesDeps,
): Promise<{ ok: true; store: GasStore; userId: string } | { ok: false; res: Response }> {
  if (!deps.store) {
    return { ok: false, res: json(501, { reason: "Рабочая база не подключена" }) };
  }
  if (!deps.userId) return { ok: false, res: json(401, { reason: "Войдите, чтобы продолжить" }) };
  const user = (await deps.store.read()).users.find((u) => u.id === deps.userId);
  if (!user) return { ok: false, res: json(403, { reason: "Вас нет среди пользователей" }) };
  if (!GAS_METHOD_ROLES.addEstimateVersion.includes(user.role)) {
    return { ok: false, res: json(403, { reason: "Сметы загружают менеджер и руководитель" }) };
  }
  return { ok: true, store: deps.store, userId: user.id };
}

export async function estimateFilesResponse(
  request: Request,
  deps: EstimateFilesDeps,
): Promise<Response> {
  const gate = await access(deps);
  if (!gate.ok) return gate.res;
  const port = retrying(createGasOpsDemo(actingAs(gate.store, gate.userId), null));
  const url = new URL(request.url);

  if (request.method === "GET") {
    const id = url.searchParams.get("file");
    const file = (await gate.store.read()).estimateFiles?.find((f) => f.id === id);
    if (!file?.storagePath) return json(404, { reason: "Файла нет в хранилище" });
    const bytes = await deps.storage.read(file.storagePath);
    if (!bytes) return json(404, { reason: "Файла нет в хранилище" });
    return new Response(new Blob([bytes as Uint8Array<ArrayBuffer>]), {
      status: 200,
      headers: {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "cache-control": "no-store",
      },
    });
  }

  if (request.method !== "POST") return json(405, { reason: "Метод не поддерживается" });

  const reparse = url.searchParams.get("reparse");
  if (reparse) {
    const file = (await gate.store.read()).estimateFiles?.find((f) => f.id === reparse);
    if (!file) return json(404, { reason: "Файл сметы не найден" });
    const bytes = file.storagePath ? await deps.storage.read(file.storagePath) : null;
    if (!bytes) return json(404, { reason: "Исходного файла нет в хранилище" });
    const parsed = await deps.parse(bytes);
    try {
      const outcome = await port.reparseEstimateFile({
        fileId: file.id,
        parsed: parsed.ok ? parsed.parsed : null,
        error: parsed.ok ? null : parsed.message,
      });
      return json(200, {
        results: [{ name: file.name, ok: true, text: outcomeText(outcome), outcome }],
      });
    } catch (error) {
      if (error instanceof GasOpsError)
        return json(422, { reason: error.message, code: error.code });
      throw error;
    }
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json(400, { reason: "Нужна форма с файлами" });
  }
  const files = form
    .getAll("files")
    .filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f);
  if (files.length === 0) return json(400, { reason: "Файлов нет" });
  if (files.length > MAX_FILES_PER_UPLOAD) {
    return json(413, { reason: `За один раз до ${MAX_FILES_PER_UPLOAD} файлов` });
  }
  const results: UploadResult[] = [];
  for (const file of files) {
    const name = file.name || "смета.xlsx";
    if (file.size > MAX_ESTIMATE_FILE_BYTES) {
      results.push({ name, ok: false, text: "Не распознана: файл больше 20 МБ", outcome: null });
      continue;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = excelKind(bytes.subarray(0, 4));
    if (!kind) {
      results.push({
        name,
        ok: false,
        text: "Не распознана: нужен файл Excel .xlsx или .xls",
        outcome: null,
      });
      continue;
    }
    const { sha256Hex } = await import("@/adapters/gas-ops/estimate-storage");
    const sha256 = sha256Hex(bytes);
    const known = (await gate.store.read()).estimateFiles?.some((f) => f.sha256 === sha256);
    const storagePath = known ? null : await deps.storage.save(sha256, kind, bytes);
    const parsed = known ? null : await deps.parse(bytes);
    try {
      const outcome = await port.intakeEstimateFile({
        sha256,
        name,
        size: bytes.byteLength,
        storagePath,
        parsed: parsed?.ok ? parsed.parsed : null,
        error: parsed && !parsed.ok ? parsed.message : null,
      });
      results.push({ name, ok: true, text: outcomeText(outcome), outcome });
    } catch (error) {
      if (error instanceof GasOpsError) {
        results.push({ name, ok: false, text: error.message, outcome: null });
        continue;
      }
      throw error;
    }
  }
  return json(200, { results });
}

/** Вход маршрута: хранилище, база и сессия сервера */
export async function estimateFilesRequest(request: Request): Promise<Response> {
  const [{ createEstimateStorage }, { gasServerStore }, { sessionActorId }] = await Promise.all([
    import("@/adapters/gas-ops/estimate-storage"),
    import("./gas-server-store"),
    import("./session"),
  ]);
  return estimateFilesResponse(request, {
    store: await gasServerStore(),
    storage: createEstimateStorage(),
    userId: await sessionActorId(),
    parse: parseEstimateBytes,
  });
}
