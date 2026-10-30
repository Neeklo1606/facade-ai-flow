import {
  buildActDocx,
  buildPackageZip,
  buildRegistryXlsx,
  DOCX_MIME,
  ZIP_MIME,
  type RegistryPayload,
} from "@/adapters/gas-ops/exec-docs-files";
import { XLSX_MIME } from "@/adapters/gas-ops/xlsx";
import type { ActPrint } from "@/domain/gas-ops/exec-docs";
import { contentDisposition } from "./gas-export";

/**
 * Файлы исполнительной документации (ADR-058). Содержимое приходит телом: в прототипе
 * документы живут во вкладке. С базой тело станет номером документа, экран не изменится
 */
type Payload =
  | { kind: "act"; act: ActPrint }
  | { kind: "registry"; registry: RegistryPayload }
  | {
      kind: "package";
      acts: ActPrint[];
      registry: RegistryPayload;
      fileName: string;
      fileNameAscii: string;
    };

function isAct(a: unknown): a is ActPrint {
  const x = a as ActPrint;
  return (
    !!x &&
    typeof x.fileName === "string" &&
    typeof x.heading === "string" &&
    typeof x.draft === "boolean" &&
    Array.isArray(x.sections) &&
    Array.isArray(x.signers)
  );
}

function isRegistry(r: unknown): r is RegistryPayload {
  const x = r as RegistryPayload;
  return (
    !!x &&
    typeof x.fileName === "string" &&
    Array.isArray(x.headers) &&
    Array.isArray(x.rows) &&
    x.rows.length <= 2000
  );
}

function file(body: Uint8Array, mime: string, name: string, ascii: string): Response {
  return new Response(body as unknown as BodyInit, {
    headers: {
      "content-type": mime,
      "content-disposition": contentDisposition(name, ascii),
      "cache-control": "no-store",
    },
  });
}

export async function gasExecDocsResponse(request: Request): Promise<Response> {
  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return new Response("Не разобрано тело запроса", { status: 400 });
  }
  if (payload?.kind === "act" && isAct(payload.act)) {
    return file(
      await buildActDocx(payload.act),
      DOCX_MIME,
      payload.act.fileName,
      payload.act.fileNameAscii,
    );
  }
  if (payload?.kind === "registry" && isRegistry(payload.registry)) {
    const r = payload.registry;
    return file(await buildRegistryXlsx(r), XLSX_MIME, r.fileName, r.fileNameAscii);
  }
  if (
    payload?.kind === "package" &&
    Array.isArray(payload.acts) &&
    payload.acts.length <= 200 &&
    payload.acts.every(isAct) &&
    isRegistry(payload.registry) &&
    typeof payload.fileName === "string"
  ) {
    return file(
      await buildPackageZip(payload.acts, payload.registry),
      ZIP_MIME,
      payload.fileName,
      payload.fileNameAscii ?? "package.zip",
    );
  }
  return new Response("В запросе нет документа", { status: 400 });
}
