/**
 * Снабжение v1 (ADR-057, модуль 2 Сервиса v1): заявка с объекта, предложения поставщиков,
 * заказ, который делает человек, и приёмка на объекте.
 *
 * Правила здесь, экран и адаптер их только зовут. Деньги в копейках, целыми числами:
 * цена за единицу бывает с копейками, а сумма заказа не должна плыть от округления.
 * Заказ поставщику система не делает (инвариант 9): «заказано» ставит человек.
 */
import type { DataSource } from "./model";

export type SupplyStatus =
  | "new"
  | "in-work"
  | "waiting-offers"
  | "ordered"
  | "in-transit"
  | "partial"
  | "delivered"
  | "closed"
  | "rejected";

export const SUPPLY_STATUS_LABEL: Record<SupplyStatus, string> = {
  new: "Новая",
  "in-work": "В работе",
  "waiting-offers": "Ждём предложения",
  ordered: "Заказано",
  "in-transit": "В пути",
  partial: "Доставлено частично",
  delivered: "Доставлено",
  closed: "Закрыта",
  rejected: "Отклонена",
};

/** Куда можно перейти из статуса. Частичная приёмка может повториться, пока не довезли всё */
const NEXT: Record<SupplyStatus, readonly SupplyStatus[]> = {
  new: ["in-work", "rejected"],
  "in-work": ["waiting-offers", "rejected"],
  "waiting-offers": ["ordered", "rejected"],
  ordered: ["in-transit"],
  "in-transit": ["partial", "delivered"],
  partial: ["partial", "delivered"],
  delivered: ["closed"],
  closed: [],
  rejected: [],
};

export function canMove(from: SupplyStatus, to: SupplyStatus): boolean {
  return NEXT[from].includes(to);
}

/** Заказ уже сделан: такие строки считаются «заказано» в сверке с лимитом сметы */
export const ORDERED_STATUSES: readonly SupplyStatus[] = [
  "ordered",
  "in-transit",
  "partial",
  "delivered",
  "closed",
];

/** Ждут приёмки на объекте */
export const AWAITING_RECEIPT: readonly SupplyStatus[] = ["in-transit", "partial"];

const FINISHED: readonly SupplyStatus[] = ["delivered", "closed", "rejected"];

export type SupplyPriority = "normal" | "urgent";

export const PRIORITY_LABEL: Record<SupplyPriority, string> = {
  normal: "Обычная",
  urgent: "Срочно",
};

/** Позиция номенклатуры: название, единица и слова, по которым её узнаёт разбор текста */
export interface NomenclatureItem {
  id: string;
  name: string;
  unit: string;
  category: string;
  /** Как позицию называют на объекте: «вгп 20», «подводка» */
  aliases: string[];
  source: DataSource;
}

export interface RequestLine {
  id: string;
  itemId: string;
  qty: number;
}

export interface StatusChange {
  at: string;
  actor: string;
  status: SupplyStatus;
  note: string | null;
}

export interface SupplyRequest {
  id: string;
  /** «ЗК-00001» */
  number: string;
  objectId: string;
  lines: RequestLine[];
  needBy: string | null;
  priority: SupplyPriority;
  /** Имена файлов фото: сами файлы в демо не хранятся */
  photos: string[];
  authorId: string;
  authorName: string;
  /** Ключ отправки с телефона: повтор с ним возвращает ту же заявку */
  clientKey: string | null;
  createdAt: string;
  status: SupplyStatus;
  rejectReason: string | null;
  chosenOfferId: string | null;
  /** Ожидаемая дата доставки: ставит снабженец, когда отмечает «в пути» */
  eta: string | null;
  history: StatusChange[];
  source: DataSource;
}

export interface Supplier {
  id: string;
  name: string;
  inn: string | null;
  contact: string | null;
  phone: string | null;
  email: string | null;
  categories: string[];
  source: DataSource;
}

export interface OfferLine {
  lineId: string;
  /** Цена за единицу, копейки; null — поставщик эту строку не предложил */
  priceKop: number | null;
}

export interface Offer {
  id: string;
  requestId: string;
  supplierId: string;
  lines: OfferLine[];
  /** Срок поставки, дни */
  leadDays: number;
  deliveryKop: number;
  terms: string | null;
  fileName: string | null;
  enteredBy: string;
  at: string;
}

export interface ReceiptLine {
  lineId: string;
  qty: number;
}

export interface Certificate {
  lineId: string;
  fileName: string;
}

export type ReceiptResult = "accepted" | "accepted-with-discrepancy";

export const RECEIPT_RESULT_LABEL: Record<ReceiptResult, string> = {
  accepted: "Принято",
  "accepted-with-discrepancy": "Принято с расхождением",
};

export interface Receipt {
  id: string;
  requestId: string;
  lines: ReceiptLine[];
  result: ReceiptResult;
  discrepancy: string | null;
  invoicePhoto: string | null;
  certificates: Certificate[];
  acceptedBy: string;
  at: string;
  /** Ключ отправки с телефона: повтор приёмки не принимает поставку дважды */
  clientKey: string | null;
}

/** Лимит материала по смете объекта: сколько позиции заложено */
export interface MaterialLimit {
  objectId: string;
  itemId: string;
  qty: number;
  source: DataSource;
}

export interface SupplyState {
  items: NomenclatureItem[];
  suppliers: Supplier[];
  requests: SupplyRequest[];
  offers: Offer[];
  receipts: Receipt[];
  limits: MaterialLimit[];
}

export function itemOf(items: readonly NomenclatureItem[], id: string): NomenclatureItem | null {
  return items.find((i) => i.id === id) ?? null;
}

/** «12,5»: количество без лишних нулей */
export function fmtQty(value: number): string {
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 3 });
}

/** «1 234,50 ₽» из копеек */
export function fmtKop(kop: number): string {
  const rub = kop / 100;
  return `${rub.toLocaleString("ru-RU", {
    minimumFractionDigits: kop % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}\u00a0₽`;
}

/** Рубли, как ввёл человек («1 250,5»), в копейки; не число — null */
export function parseRubToKop(text: string): number | null {
  const clean = text.replace(/[\s\u00a0₽]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

/** Количество, как ввёл человек; ноль и меньше — не количество */
export function parseQty(text: string | number): number | null {
  const value =
    typeof text === "number"
      ? text
      : Number(String(text).trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
}

// ---------- Разбор текста заявки ----------

export interface DraftLine {
  /** Кусок текста, из которого строка разобрана: показывается рядом, чтобы было видно источник */
  raw: string;
  itemId: string | null;
  qty: number | null;
  /** low — позиция или количество не найдены уверенно: строку подтверждают отдельно */
  confidence: "high" | "low";
  note: string | null;
}

export interface RequestDraft {
  lines: DraftLine[];
  needBy: string | null;
  urgent: boolean;
}

function norm(text: string): string {
  return text.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

const WEEKDAYS: Record<string, number> = {
  понедельник: 1,
  вторник: 2,
  сред: 3,
  четверг: 4,
  пятниц: 5,
  суббот: 6,
  воскресень: 0,
};

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function weekdayOf(day: string): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}

/** Срок из текста: «завтра», «послезавтра», «к пятнице», «до 05.11». Ближайший такой день впереди */
export function parseNeedBy(text: string, today: string): { day: string; match: string } | null {
  const t = norm(text);
  const date = /(?:к|до)?\s*(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?/.exec(t);
  if (date) {
    const year = date[3] ? (date[3].length === 2 ? `20${date[3]}` : date[3]) : today.slice(0, 4);
    const day = `${year}-${date[2]!.padStart(2, "0")}-${date[1]!.padStart(2, "0")}`;
    if (!Number.isNaN(Date.parse(`${day}T00:00:00Z`))) return { day, match: date[0] };
  }
  const tomorrow = /послезавтра|завтра/.exec(t);
  if (tomorrow)
    return { day: addDays(today, tomorrow[0] === "завтра" ? 1 : 2), match: tomorrow[0] };
  const weekday =
    /(?:к|до|в|на)\s+(понедельник[а-я]*|вторник[а-я]*|сред[а-я]*|четверг[а-я]*|пятниц[а-я]*|суббот[а-я]*|воскресень[а-я]*)/.exec(
      t,
    );
  if (weekday) {
    const stem = Object.keys(WEEKDAYS).find((k) => weekday[1]!.startsWith(k))!;
    const target = WEEKDAYS[stem]!;
    const ahead = (target - weekdayOf(today) + 7) % 7 || 7;
    return { day: addDays(today, ahead), match: weekday[0] };
  }
  return null;
}

const UNIT_WORDS: { re: RegExp; unit: string }[] = [
  { re: /^(м|метр[а-я]*|пог\.?\s*м)$/, unit: "м" },
  { re: /^(шт|штук[а-я]*|штуки)$/, unit: "шт" },
  { re: /^(кг|килограмм[а-я]*)$/, unit: "кг" },
  { re: /^(компл[а-я]*|комплект[а-я]*)$/, unit: "компл" },
  { re: /^(уп|упак[а-я]*)$/, unit: "уп" },
];

function unitOf(word: string | undefined): string | null {
  if (!word) return null;
  return UNIT_WORDS.find((u) => u.re.test(word))?.unit ?? null;
}

/** Лучшая позиция по самому длинному совпавшему названию или синониму */
function matchItem(
  segment: string,
  items: readonly NomenclatureItem[],
): { item: NomenclatureItem; alias: string } | null {
  let best: { item: NomenclatureItem; alias: string } | null = null;
  for (const item of items) {
    for (const alias of [item.name, ...item.aliases].map(norm)) {
      if (segment.includes(alias) && (!best || alias.length > best.alias.length)) {
        best = { item, alias };
      }
    }
  }
  return best;
}

/**
 * Черновик строк заявки из текста или расшифровки голоса. Модель не нужна: позиция
 * выбирается только из номенклатуры, количество — число рядом с ней. Чего не нашли,
 * то не угадывается: строка приходит без позиции или без количества с низкой уверенностью
 */
export function parseRequestText(
  text: string,
  items: readonly NomenclatureItem[],
  today: string,
): RequestDraft {
  let rest = norm(text);
  const urgent = /срочн/.test(rest);
  rest = rest.replace(/срочн[а-я]*/g, " ");
  const need = parseNeedBy(rest, today);
  if (need) rest = rest.replace(need.match, " ");

  const segments = rest
    .split(/[,;\n]|\s+и\s+|\.\s/)
    .map((s) => s.trim())
    .filter((s) => /[a-zа-я]/.test(s));

  const lines: DraftLine[] = segments.map((raw) => {
    const found = matchItem(raw, items);
    // Размеры («20 мм», «1/2», «60/100») — часть названия, а не количество
    const left = (found ? raw.replace(found.alias, " ") : raw)
      .replace(/\d+(?:[.,]\d+)?\s*мм(?![а-я])/g, " ")
      .replace(/\d+\/\d+/g, " ")
      .replace(/(^|\s)g\d+(?=\s|$)/g, " ");
    const qtyMatch = /(\d+(?:[.,]\d+)?)\s*([a-zа-я.]+)?/.exec(left);
    const qty = qtyMatch ? parseQty(qtyMatch[1]!) : null;
    const unit = unitOf(qtyMatch?.[2]);
    const notes: string[] = [];
    if (!found) notes.push("Позиция не найдена в номенклатуре: выберите из списка.");
    if (qty === null) notes.push("Количество не названо.");
    if (found && unit && unit !== found.item.unit) {
      notes.push(`Названо в «${unit}», позиция учитывается в «${found.item.unit}».`);
    }
    return {
      raw,
      itemId: found?.item.id ?? null,
      qty,
      confidence: notes.length === 0 ? "high" : "low",
      note: notes.length ? notes.join(" ") : null,
    };
  });
  return { lines, needBy: need?.day ?? null, urgent };
}

// ---------- Сверка с лимитом сметы ----------

export interface LimitCheck {
  /** null — лимита по смете нет: честная метка, а не ноль */
  limit: number | null;
  ordered: number;
  inRequest: number;
  over: number;
  source: DataSource | null;
}

export function limitCheck(input: {
  objectId: string;
  itemId: string;
  qty: number;
  limits: readonly MaterialLimit[];
  requests: readonly SupplyRequest[];
  /** Сама заявка в «заказано» не считается дважды */
  requestId?: string | null;
}): LimitCheck {
  const limit = input.limits.find(
    (l) => l.objectId === input.objectId && l.itemId === input.itemId,
  );
  const ordered = input.requests
    .filter(
      (r) =>
        r.id !== input.requestId &&
        r.objectId === input.objectId &&
        ORDERED_STATUSES.includes(r.status),
    )
    .flatMap((r) => r.lines)
    .filter((l) => l.itemId === input.itemId)
    .reduce((a, l) => a + l.qty, 0);
  if (!limit) return { limit: null, ordered, inRequest: input.qty, over: 0, source: null };
  return {
    limit: limit.qty,
    ordered,
    inRequest: input.qty,
    over: Math.max(0, ordered + input.qty - limit.qty),
    source: limit.source,
  };
}

/** «по смете 120 м, заказано 80, в заявке 50: превышение 10» */
export function limitText(check: LimitCheck, unit: string): string {
  if (check.limit === null) return "Лимита по смете нет";
  const base = `по смете ${fmtQty(check.limit)}\u00a0${unit}, заказано ${fmtQty(check.ordered)}, в заявке ${fmtQty(check.inRequest)}`;
  return check.over > 0 ? `${base}: превышение ${fmtQty(check.over)}` : `${base}: в пределах сметы`;
}

// ---------- Сравнение предложений ----------

export interface OfferRow {
  offer: Offer;
  /** Сумма каждой строки заявки, копейки; null — цены нет */
  linesKop: (number | null)[];
  /** Итог со стоимостью доставки; null — не по всем строкам есть цена */
  totalKop: number | null;
  bestPrice: boolean;
  bestLead: boolean;
}

export function offerTotal(
  request: Pick<SupplyRequest, "lines">,
  offer: Offer,
): OfferRow["linesKop"] {
  return request.lines.map((line) => {
    const price = offer.lines.find((l) => l.lineId === line.id)?.priceKop ?? null;
    return price === null ? null : Math.round(price * line.qty);
  });
}

export function compareOffers(
  request: Pick<SupplyRequest, "id" | "lines">,
  offers: readonly Offer[],
): OfferRow[] {
  const rows = offers
    .filter((o) => o.requestId === request.id)
    .map((offer) => {
      const linesKop = offerTotal(request, offer);
      const totalKop = linesKop.some((v) => v === null)
        ? null
        : linesKop.reduce<number>((a, v) => a + (v ?? 0), 0) + offer.deliveryKop;
      return { offer, linesKop, totalKop, bestPrice: false, bestLead: false };
    });
  const priced = rows.filter((r) => r.totalKop !== null);
  const minPrice = priced.length ? Math.min(...priced.map((r) => r.totalKop!)) : null;
  // Лучший срок — среди полных предложений: неполное быстрее, но привезёт не всё
  const minLead = priced.length ? Math.min(...priced.map((r) => r.offer.leadDays)) : null;
  for (const row of rows) {
    row.bestPrice = row.totalKop !== null && row.totalKop === minPrice;
    row.bestLead = row.totalKop !== null && row.offer.leadDays === minLead;
  }
  return rows;
}

// ---------- Приёмка ----------

export interface ReceiptInput {
  lines: { lineId: string; qty: string | number }[];
  /** «Принять с расхождением»: без описания расхождения не принимается */
  withDiscrepancy: boolean;
  discrepancy: string | null;
  invoicePhoto: string | null;
  certificates: Certificate[];
}

export interface LineDiff {
  lineId: string;
  expected: number;
  fact: number;
  diff: number;
}

export type ReceiptCheck =
  | {
      ok: true;
      lines: ReceiptLine[];
      diffs: LineDiff[];
      result: ReceiptResult;
      status: "partial" | "delivered";
    }
  | {
      ok: false;
      code: "bad-qty" | "discrepancy-required" | "note-required";
      message: string;
      lineId?: string;
    };

/** Сколько уже принято по каждой строке прежними приёмками */
export function receivedOf(
  request: Pick<SupplyRequest, "id" | "lines">,
  receipts: readonly Receipt[],
): Map<string, number> {
  const got = new Map<string, number>(request.lines.map((l) => [l.id, 0]));
  for (const receipt of receipts.filter((r) => r.requestId === request.id)) {
    for (const line of receipt.lines) got.set(line.lineId, (got.get(line.lineId) ?? 0) + line.qty);
  }
  return got;
}

export function receiptOf(
  request: Pick<SupplyRequest, "id" | "lines">,
  receipts: readonly Receipt[],
  input: ReceiptInput,
): ReceiptCheck {
  const before = receivedOf(request, receipts);
  const lines: ReceiptLine[] = [];
  const diffs: LineDiff[] = [];
  for (const line of request.lines) {
    const raw = input.lines.find((l) => l.lineId === line.id)?.qty ?? 0;
    const fact =
      typeof raw === "number" ? raw : Number(String(raw).replace(",", ".").trim() || "0");
    if (!Number.isFinite(fact) || fact < 0) {
      return { ok: false, code: "bad-qty", message: "Количество не число.", lineId: line.id };
    }
    const expected = Math.max(0, line.qty - (before.get(line.id) ?? 0));
    lines.push({ lineId: line.id, qty: fact });
    if (fact !== expected) diffs.push({ lineId: line.id, expected, fact, diff: fact - expected });
  }
  if (diffs.length > 0 && !input.withDiscrepancy) {
    return {
      ok: false,
      code: "discrepancy-required",
      message: "Количество не совпадает с заказом. Нажмите «Принять с расхождением» и опишите его.",
    };
  }
  if (input.withDiscrepancy && !input.discrepancy?.trim()) {
    return {
      ok: false,
      code: "note-required",
      message: "Опишите расхождение: что не так и сколько.",
    };
  }
  const complete = request.lines.every(
    (line) =>
      (before.get(line.id) ?? 0) + (lines.find((l) => l.lineId === line.id)?.qty ?? 0) >= line.qty,
  );
  return {
    ok: true,
    lines,
    diffs,
    result: input.withDiscrepancy ? "accepted-with-discrepancy" : "accepted",
    status: complete ? "delivered" : "partial",
  };
}

// ---------- Показатели и списки ----------

export function isOverdue(
  request: Pick<SupplyRequest, "needBy" | "status">,
  today: string,
): boolean {
  return !!request.needBy && request.needBy < today && !FINISHED.includes(request.status);
}

export interface SupplyMetrics {
  fresh: number;
  waitingOffers: number;
  inTransit: number;
  overdue: number;
}

export function supplyMetrics(requests: readonly SupplyRequest[], today: string): SupplyMetrics {
  return {
    fresh: requests.filter((r) => r.status === "new").length,
    waitingOffers: requests.filter((r) => r.status === "waiting-offers").length,
    inTransit: requests.filter((r) => AWAITING_RECEIPT.includes(r.status)).length,
    overdue: requests.filter((r) => isOverdue(r, today)).length,
  };
}

/** Порядок таблицы: срочные, затем ближайший срок, без срока в конце, затем номер */
export function sortRequests<T extends Pick<SupplyRequest, "priority" | "needBy" | "number">>(
  requests: readonly T[],
): T[] {
  return [...requests].sort(
    (a, b) =>
      (a.priority === "urgent" ? 0 : 1) - (b.priority === "urgent" ? 0 : 1) ||
      (a.needBy ?? "9999").localeCompare(b.needBy ?? "9999") ||
      a.number.localeCompare(b.number),
  );
}

export function nextRequestNumber(requests: readonly Pick<SupplyRequest, "number">[]): string {
  const max = requests.reduce((a, r) => Math.max(a, Number(r.number.replace(/\D/g, "")) || 0), 0);
  return `ЗК-${String(max + 1).padStart(5, "0")}`;
}

/** Сумма заказа: итог выбранного предложения; не выбрано или неполное — null */
export function orderTotalKop(request: SupplyRequest, offers: readonly Offer[]): number | null {
  if (!request.chosenOfferId) return null;
  const row = compareOffers(request, offers).find((r) => r.offer.id === request.chosenOfferId);
  return row?.totalKop ?? null;
}

export interface OverLimit {
  requestId: string;
  number: string;
  objectId: string;
  itemId: string;
  over: number;
}

/**
 * Лимит строки заявки с учётом порядка заказов: у заказанной заявки «заказано» — только
 * заказанные раньше неё, иначе одно превышение повторилось бы у каждой заказанной заявки
 * объекта. Незаказанная видит все заказы
 */
export function requestLimit(
  state: Pick<SupplyState, "requests" | "limits">,
  request: Pick<SupplyRequest, "id" | "number" | "objectId" | "status">,
  itemId: string,
  qty: number,
): LimitCheck {
  return limitCheck({
    objectId: request.objectId,
    itemId,
    qty,
    limits: state.limits,
    requests: ORDERED_STATUSES.includes(request.status)
      ? state.requests.filter((x) => x.number < request.number)
      : state.requests,
    requestId: request.id,
  });
}

/** Строки заявок, которые выходят за лимит сметы: для руководителя и детали заявки */
export function overLimits(state: Pick<SupplyState, "requests" | "limits">): OverLimit[] {
  const out: OverLimit[] = [];
  for (const r of state.requests.filter((x) => x.status !== "rejected")) {
    for (const line of r.lines) {
      const check = requestLimit(state, r, line.itemId, line.qty);
      if (check.over > 0) {
        out.push({
          requestId: r.id,
          number: r.number,
          objectId: r.objectId,
          itemId: line.itemId,
          over: check.over,
        });
      }
    }
  }
  return out;
}

export interface SupplyOverview {
  /** Сумма выбранных предложений по заказанным заявкам; заказов нет — 0 и count 0 */
  orderedKop: number;
  orderedCount: number;
  /** Заказано, но сумма неизвестна (неполное предложение) */
  unpricedCount: number;
  overdue: SupplyRequest[];
  overLimit: OverLimit[];
}

export function supplyOverview(state: SupplyState, today: string): SupplyOverview {
  const ordered = state.requests.filter((r) => ORDERED_STATUSES.includes(r.status));
  const totals = ordered.map((r) => orderTotalKop(r, state.offers));
  return {
    orderedKop: totals.reduce<number>((a, v) => a + (v ?? 0), 0),
    orderedCount: ordered.length,
    unpricedCount: totals.filter((v) => v === null).length,
    overdue: state.requests.filter((r) => isOverdue(r, today)),
    overLimit: overLimits(state),
  };
}

// ---------- Материалы для ПТО (связь с модулем 3) ----------

export interface AcceptedMaterial {
  key: string;
  objectId: string;
  itemId: string;
  qty: number;
  requestNumber: string;
  requestId: string;
  receiptId: string;
  at: string;
  result: ReceiptResult;
  certificates: string[];
}

/** Принятые на объекте материалы с сертификатами: из них ПТО собирает акты (S6) */
export function acceptedMaterials(
  state: Pick<SupplyState, "requests" | "receipts">,
  objectIds?: ReadonlySet<string> | null,
): AcceptedMaterial[] {
  const out: AcceptedMaterial[] = [];
  for (const receipt of state.receipts) {
    const request = state.requests.find((r) => r.id === receipt.requestId);
    if (!request || (objectIds && !objectIds.has(request.objectId))) continue;
    for (const line of receipt.lines.filter((l) => l.qty > 0)) {
      const requestLine = request.lines.find((l) => l.id === line.lineId);
      if (!requestLine) continue;
      out.push({
        key: `${receipt.id}:${line.lineId}`,
        objectId: request.objectId,
        itemId: requestLine.itemId,
        qty: line.qty,
        requestNumber: request.number,
        requestId: request.id,
        receiptId: receipt.id,
        at: receipt.at,
        result: receipt.result,
        certificates: receipt.certificates
          .filter((c) => c.lineId === line.lineId)
          .map((c) => c.fileName),
      });
    }
  }
  return out;
}

// ---------- Запрос предложений ----------

export const RFQ_HEADERS = [
  "№",
  "Наименование",
  "Ед.",
  "Количество",
  "Цена за ед. без НДС, ₽",
  "Срок поставки, дней",
  "Примечание",
] as const;

export function rfqRows(
  request: Pick<SupplyRequest, "lines">,
  items: readonly NomenclatureItem[],
): (string | number)[][] {
  return request.lines.map((line, i) => {
    const item = itemOf(items, line.itemId);
    return [i + 1, item?.name ?? "Позиция не найдена", item?.unit ?? "", line.qty, "", "", ""];
  });
}

function ru(day: string): string {
  return `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;
}

/** Текст запроса для копирования в почту или мессенджер: писем система не отправляет */
export function rfqText(
  request: Pick<SupplyRequest, "number" | "lines" | "needBy">,
  context: { objectLabel: string; items: readonly NomenclatureItem[] },
): string {
  const list = request.lines
    .map((line, i) => {
      const item = itemOf(context.items, line.itemId);
      return `${i + 1}. ${item?.name ?? "Позиция не найдена"}: ${fmtQty(line.qty)} ${item?.unit ?? ""}`.trim();
    })
    .join("\n");
  const due = request.needBy ? `Материалы нужны на объекте к ${ru(request.needBy)}.` : "";
  return [
    "Добрый день!",
    "",
    `Просим направить коммерческое предложение по заявке ${request.number}, объект ${context.objectLabel}.`,
    "",
    list,
    "",
    "В предложении укажите цену за единицу без НДС, стоимость доставки на объект и срок поставки. Если предлагаете аналог, приложите паспорт и опишите отличия.",
    due,
  ]
    .filter((line, i, all) => !(line === "" && all[i - 1] === ""))
    .join("\n")
    .trim();
}

export function rfqFileName(request: Pick<SupplyRequest, "number">): string {
  return `Запрос_цены_${request.number}.xlsx`;
}

export function rfqFileNameAscii(request: Pick<SupplyRequest, "number">): string {
  return `rfq_${request.number.replace(/\D/g, "")}.xlsx`;
}

// ---------- Выборка прораба ----------

/** Заявка для прораба: поля перечислены явно, цен и предложений поставщиков нет */
export interface SiteRequest {
  id: string;
  number: string;
  objectId: string;
  status: SupplyStatus;
  needBy: string | null;
  eta: string | null;
  priority: SupplyPriority;
  lines: { id: string; itemId: string; qty: number; received: number }[];
  rejectReason: string | null;
  createdAt: string;
}

export function siteRequests(
  state: Pick<SupplyState, "requests" | "receipts">,
  objectIds: ReadonlySet<string> | "all",
): SiteRequest[] {
  return state.requests
    .filter((r) => objectIds === "all" || objectIds.has(r.objectId))
    .map((r) => {
      const got = receivedOf(r, state.receipts);
      return {
        id: r.id,
        number: r.number,
        objectId: r.objectId,
        status: r.status,
        needBy: r.needBy,
        eta: r.eta,
        priority: r.priority,
        lines: r.lines.map((l) => ({
          id: l.id,
          itemId: l.itemId,
          qty: l.qty,
          received: got.get(l.id) ?? 0,
        })),
        rejectReason: r.rejectReason,
        createdAt: r.createdAt,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
