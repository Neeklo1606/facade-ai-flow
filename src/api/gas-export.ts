import { buildCustomerWorkbook, customerFileName, XLSX_MIME } from "@/adapters/gas-ops/xlsx";

/**
 * Ответ серверного маршрута выгрузки газового отчёта (ADR-042). Файл собирается здесь,
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
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
        customerFileName(payload.week),
      )}`,
      "cache-control": "no-store",
    },
  });
}
