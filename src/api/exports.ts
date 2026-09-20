import { listProjectsInput } from "@/ports";
import { XLSX_MIME } from "@/adapters/export/xlsx";
import { registryFileName } from "./export-paths";
import { ForbiddenError } from "@/ports";
import { requestRepositories } from "./server-repositories";

/** Ответ серверного маршрута: файл строится на сервере из всего реестра, а не из данных вкладки */
export async function registryExportResponse(request: Request) {
  const url = new URL(request.url);
  const parsed = listProjectsInput.safeParse({
    region: url.searchParams.get("region") ?? undefined,
    managerId: url.searchParams.get("managerId") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    unverified: url.searchParams.get("unverified") === "true" ? true : undefined,
  });
  if (!parsed.success) {
    return new Response("Неверный фильтр выгрузки", { status: 400 });
  }
  let file: Blob;
  try {
    file = await requestRepositories().projects.exportRegistry(parsed.data);
  } catch (error) {
    if (!(error instanceof ForbiddenError)) throw error;
    console.warn("403", error.detail);
    return new Response(error.message, { status: 403, headers: { "cache-control": "no-store" } });
  }
  return new Response(file, {
    headers: {
      "content-type": XLSX_MIME,
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(registryFileName())}`,
      "cache-control": "no-store",
    },
  });
}
