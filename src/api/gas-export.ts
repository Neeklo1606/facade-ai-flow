import { buildCustomerWorkbook, customerFileName, XLSX_MIME } from "@/adapters/gas-ops/xlsx";
import { gasReportFileNameAscii } from "@/domain/gas-ops/report";

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
 * Ответ серверного маршрута выгрузки газового отчёта (ADR-043). Файл собирается здесь,
 * а не во вкладке: библиотека выгрузки тяжёлая, в клиентский набор её тащить незачем.
 *
 * Строки приходят телом запроса, потому что в прототипе состояние живёт во вкладке.
 * С появлением базы тело станет фильтром, а экран не изменится.
 */
export async function gasExportResponse(request: Request): Promise<Response> {
  let payload: Parameters<typeof buildCustomerWorkbook>[0];
  try {
    payload = (await request.json()) as Parameters<typeof buildCustomerWorkbook>[0];
  } catch {
    return new Response("Не разобрано тело запроса", { status: 400 });
  }
  if (!Array.isArray(payload?.rows) || !Array.isArray(payload?.days) || !payload?.week) {
    return new Response("В запросе нет строк отчёта", { status: 400 });
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
