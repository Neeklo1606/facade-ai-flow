import { listProjectsInput } from "@/ports";
import { XLSX_MIME } from "@/adapters/export/xlsx";
import { registryFileName } from "./export-paths";
import { serverRepositories } from "./server-repositories";

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
  const file = await serverRepositories().projects.exportRegistry(parsed.data);
  return new Response(file, {
    headers: {
      "content-type": XLSX_MIME,
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(registryFileName())}`,
      "cache-control": "no-store",
    },
  });
}
