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
 * экран. В прототипе данные живут во вкладке, поэтому приходят телом; в T7 их прочитает
 * хранилище базы (`createGasDbStore().read()`), а тело сократится до недели и версии.
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

/** Ответ серверного маршрута выгрузки: файл собирается здесь, библиотека Excel тяжёлая */
export async function gasExportResponse(request: Request): Promise<Response> {
  let payload: ExportPayload;
  try {
    payload = exportPayloadOf((await request.json()) as GasExportRequest);
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
