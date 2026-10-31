import { buildRfqWorkbook, type RfqPayload } from "@/adapters/gas-ops/rfq-xlsx";
import { XLSX_MIME } from "@/adapters/gas-ops/xlsx";
import { rfqFileName, rfqFileNameAscii } from "@/domain/gas-ops/supply";
import { contentDisposition } from "./gas-export";

/**
 * Файл запроса цены (ADR-057). Позиции приходят телом: в прототипе заявки живут во вкладке.
 * С базой тело станет номером заявки, а экран не изменится
 */
export async function gasRfqResponse(request: Request): Promise<Response> {
  let payload: RfqPayload;
  try {
    payload = (await request.json()) as RfqPayload;
  } catch {
    return new Response("Не разобрано тело запроса", { status: 400 });
  }
  if (
    typeof payload?.number !== "string" ||
    !Array.isArray(payload.rows) ||
    !Array.isArray(payload.headers) ||
    payload.rows.length > 500
  ) {
    return new Response("В запросе нет позиций заявки", { status: 400 });
  }
  const file = await buildRfqWorkbook(payload);
  return new Response(file as unknown as BodyInit, {
    headers: {
      "content-type": XLSX_MIME,
      "content-disposition": contentDisposition(rfqFileName(payload), rfqFileNameAscii(payload)),
      "cache-control": "no-store",
    },
  });
}
