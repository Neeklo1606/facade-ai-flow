import {
  buildCustomerWorkbook,
  customerFileName,
  XLSX_MIME,
  type ExportPayload,
} from "@/adapters/gas-ops/xlsx";
import type { Brigade, Employee, Group, TimeEntry, WorkObject } from "@/domain/gas-ops/model";
import {
  analyticRows,
  customerFormatRows,
  gasReportFileNameAscii,
  type ReportInput,
} from "@/domain/gas-ops/report";
import type { PeriodVersion } from "@/domain/gas-ops/week";
import type { GasStore } from "@/adapters/gas-ops/store";
import { gasExportInput } from "@/contracts/gas-api";
import type { z } from "zod";
import { GAS_MONEY_ROLES, GasAccessError } from "./gas-ops-server";

/**
 * Content-Disposition с именем по RFC 6266 и RFC 5987: `filename*` в UTF-8 для браузеров
 * и `filename` латиницей для старых клиентов. Без кириллицы в `filename` заголовок
 * остаётся валидным ASCII.
 */
export function contentDisposition(name: string, ascii: string): string {
  // encodeURIComponent оставляет ' ( ) *, а в attr-char RFC 5987 их нет
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  const safe = ascii.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `attachment; filename="${safe}"; filename*=UTF-8''${encoded}`;
}

/**
 * Запрос выгрузки (ADR-061, 11): какая неделя и какая версия, плюс данные недели. Строки
 * отчёта сервер считает сам доменными функциями: файл не собирается из того, что прислал
 * экран. В демо данные живут во вкладке, поэтому приходят телом; на сервере их читает
 * хранилище (`gasExportFromStore` ниже), а тело — только неделя, вид и версия (T7).
 */
export interface GasExportRequest {
  /** «approved» — только принятые записи; «draft» — все, кроме отклонённых, с меткой */
  kind: "approved" | "draft";
  /** Номер закрытой версии: файл строится из её копии записей */
  version?: number | null;
  week: { from: string; to: string; days: string[] };
  data: {
    entries: TimeEntry[];
    groups: Group[];
    brigades: Brigade[];
    employees: Employee[];
    objects: WorkObject[];
    frames: ReportInput["frames"];
    periods: PeriodVersion[];
  };
}

export class ExportRequestError extends Error {
  constructor(
    readonly status: 400 | 404,
    message: string,
  ) {
    super(message);
  }
}

/** Данные файла из запроса: набор записей по виду и версии, строки по правилам домена */
export function exportPayloadOf(request: GasExportRequest): ExportPayload {
  const { kind, week, data } = request;
  if (kind !== "approved" && kind !== "draft")
    throw new ExportRequestError(400, "Неизвестный вид выгрузки");
  if (!week?.from || !Array.isArray(week.days) || !Array.isArray(data?.entries))
    throw new ExportRequestError(400, "В запросе нет недели или записей");
  let entries = data.entries;
  if (request.version != null) {
    const version = (data.periods ?? []).find(
      (v) => v.weekFrom === week.from && v.version === request.version,
    );
    if (!version) throw new ExportRequestError(404, `Версии v${request.version} у недели нет`);
    entries = version.entries;
  }
  const mode = kind === "approved" ? "confirmed" : "preliminary";
  const base = {
    entries,
    groups: data.groups,
    brigades: data.brigades,
    employees: data.employees,
    objects: data.objects,
    days: week.days,
    mode,
  } as const;
  return {
    rows: customerFormatRows({ ...base, frames: data.frames ?? [] }),
    analytic: analyticRows(base),
    days: week.days,
    week: { from: week.from, to: week.to },
    mode,
    label:
      request.version != null
        ? { version: request.version }
        : kind === "draft"
          ? { draft: true }
          : null,
    pendingIds:
      kind === "draft" ? entries.filter((e) => e.status !== "confirmed").map((e) => e.id) : [],
  };
}

/**
 * Ответ серверного маршрута выгрузки: файл собирается здесь, библиотека Excel тяжёлая.
 * Тело с `weekFrom` — запрос рабочего контура: записи читает хранилище (T7)
 */
export async function gasExportResponse(
  request: Request,
  stored?: { store: GasStore | null; userId: () => Promise<string | null> },
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("Не разобрано тело запроса", { status: 400 });
  }
  if (stored && body && typeof body === "object" && "weekFrom" in body) {
    return storedResponse(body, stored);
  }
  /*
   * С рабочей базой данные из тела не принимаются (ADR-069): экран присылает неделю целиком,
   * а файл с суммами собирается только из хранилища, с проверкой роли сессии и контрольной
   * суммой. Иначе любой мог бы получить файл заказчика с подставленными цифрами без входа
   */
  if (stored?.store && body && typeof body === "object") {
    const sent = body as Partial<GasExportRequest>;
    return storedResponse(
      { kind: sent.kind, weekFrom: sent.week?.from, version: sent.version ?? null },
      stored,
    );
  }
  let payload: ExportPayload;
  try {
    payload = exportPayloadOf(body as GasExportRequest);
  } catch (error) {
    if (error instanceof ExportRequestError)
      return new Response(error.message, { status: error.status });
    return new Response("Не разобрано тело запроса", { status: 400 });
  }
  const file = await buildCustomerWorkbook(payload);
  return new Response(file as unknown as BodyInit, {
    headers: {
      "content-type": XLSX_MIME,
      "content-disposition": contentDisposition(
        customerFileName(payload.week, payload.label),
        gasReportFileNameAscii(payload.week, payload.label),
      ),
      "cache-control": "no-store",
    },
  });
}

/* ---------------------------------------------------------------- Из хранилища (T7) */

async function storedResponse(
  body: object,
  stored: { store: GasStore | null; userId: () => Promise<string | null> },
): Promise<Response> {
  if (!stored.store)
    return new Response("Рабочая база учёта времени не подключена", { status: 501 });
  try {
    const result = await gasExportFromStore({
      store: stored.store,
      userId: await stored.userId(),
      request: body as z.input<typeof gasExportInput>,
    });
    return new Response(result.file as unknown as BodyInit, {
      headers: {
        "content-type": XLSX_MIME,
        "content-disposition": contentDisposition(result.fileName, result.asciiName),
        "x-checksum-sha256": result.checksum,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof ExportRequestError || error instanceof GasAccessError) {
      return new Response(error.message, { status: error.status });
    }
    throw error;
  }
}

export interface GasStoredExport {
  file: Uint8Array;
  fileName: string;
  asciiName: string;
  /** sha256 файла: контрольная сумма версии выгрузки (HANDOFF v1.1, раздел 7) */
  checksum: string;
}

/**
 * Выгрузка недели на сервере из хранилища (ADR-061, 14): тело запроса — только неделя,
 * вид и версия, записи читает сервер. Файл с суммами доступен ролям с деньгами
 */
export async function gasExportFromStore(input: {
  store: GasStore;
  userId: string | null;
  request: z.input<typeof gasExportInput>;
}): Promise<GasStoredExport> {
  const parsed = gasExportInput.safeParse(input.request);
  if (!parsed.success) throw new ExportRequestError(400, "Неверный запрос выгрузки");
  const { kind, weekFrom, version } = parsed.data;
  const snapshot = await input.store.read();
  const user = snapshot.users.find((u) => u.id === input.userId);
  if (!user) throw new GasAccessError(401, "Войдите, чтобы продолжить.");
  if (!GAS_MONEY_ROLES.includes(user.role)) {
    throw new GasAccessError(403, "Выгрузка с суммами недоступна вашей роли.");
  }
  if (snapshot.week.from !== weekFrom) {
    throw new ExportRequestError(404, `Недели с ${weekFrom} в хранилище нет`);
  }
  const payload = exportPayloadOf({
    kind,
    version,
    week: snapshot.week,
    data: {
      entries: snapshot.entries,
      groups: snapshot.groups,
      brigades: snapshot.brigades,
      employees: snapshot.employees,
      objects: snapshot.objects,
      frames: snapshot.frames,
      periods: snapshot.periods,
    },
  });
  const file = new Uint8Array(await buildCustomerWorkbook(payload));
  const digest = await crypto.subtle.digest("SHA-256", file);
  return {
    file,
    fileName: customerFileName(payload.week, payload.label),
    asciiName: gasReportFileNameAscii(payload.week, payload.label),
    checksum: [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join(""),
  };
}
