/**
 * Контекст агента (ADR-066): данные недели текстом для модели. Только то, что роль видит
 * на экранах: бригадир не получает сумм и ставок (таблица 3.3). Каждый факт с меткой,
 * откуда он: «запись ГЗ-00098», «смета ОБ-101, версия 2», чтобы ответ ссылался на источник
 * (правило 2). Объём ограничен: длинные списки обрезаются с пометкой «и ещё N».
 */
import { MONEY_ROLES } from "./assistant";
import { hoursOfMinutes } from "./calc";
import type { Role } from "./model";
import { brigadeCards, objectCards, type GasData } from "./view";
import type { CloseReason } from "./week";
import { TOTAL_LABEL, TOTAL_ORDER } from "./estimate-labels";
import type { EstimateVersion } from "./work-cost";

const LIMIT = { brigades: 40, objects: 60, entries: 40, reasons: 30, versions: 20 };

const rub = (n: number) => `${Math.round(n).toLocaleString("ru-RU")} ₽`;
const hours = (minutes: number) =>
  `${hoursOfMinutes(minutes).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ч`;
const day = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

function capped<T>(list: readonly T[], max: number, line: (item: T) => string): string[] {
  const lines = list.slice(0, max).map(line);
  if (list.length > max) lines.push(`… и ещё ${list.length - max}`);
  return lines;
}

const STATUS: Record<string, string> = {
  pending: "ждёт проверки",
  clarify: "на уточнении",
  confirmed: "принята",
  rejected: "отклонена",
  draft: "черновик",
};

export function assistantContext(input: {
  role: Role;
  data: GasData;
  reasons: readonly CloseReason[];
  /** Версии смет с разбором: что именно вытянуто из файла и из какой строки (ADR-072) */
  versions?: readonly EstimateVersion[];
}): string {
  const { role, data, reasons } = input;
  const money = MONEY_ROLES.includes(role);
  const out: string[] = [];
  out.push(`Неделя ${day(data.week.from)}–${day(data.week.to)}, сегодня ${day(data.today)}.`);
  out.push(`Роль пользователя: ${role}. Суммы ${money ? "видны" : "скрыты: не называй деньги"}.`);

  const confirmed = data.entries.filter((e) => e.status === "confirmed");
  const minutes = confirmed.reduce((a, e) => a + e.minutes, 0);
  const byStatus = new Map<string, number>();
  for (const e of data.entries) byStatus.set(e.status, (byStatus.get(e.status) ?? 0) + 1);
  out.push(
    `Записи: ${[...byStatus].map(([s, n]) => `${STATUS[s] ?? s} ${n}`).join(", ")}. Часы принятых: ${hours(minutes)}.`,
  );

  out.push("", "## Бригады");
  const groups = new Map(data.groups.map((g) => [g.id, g.name]));
  const cards = brigadeCards(data, "confirmed");
  out.push(
    ...capped(cards, LIMIT.brigades, (c) => {
      const parts = [
        `${c.brigade.name} (код ${c.brigade.code}, ${groups.get(c.brigade.groupId) ?? "без подразделения"})`,
        `часы ${hours(c.totals.minutes)}`,
        money ? `начислено ${rub(c.totals.amountRub)}` : null,
        money && c.totals.revenuePerHour !== null ? `${rub(c.totals.revenuePerHour)}/ч` : null,
        c.pending ? `ждут проверки ${c.pending}` : null,
        c.members.length ? `состав ${c.members.map((m) => m.name).join(", ")}` : null,
      ];
      return `- ${parts.filter(Boolean).join("; ")}`;
    }),
  );

  out.push("", "## Объекты и сметы");
  const objectOf0 = new Map(data.objects.map((o) => [o.id, o]));
  const objects = objectCards(data).sort((a, b) => b.totals.amountRub - a.totals.amountRub);
  out.push(
    ...capped(objects, LIMIT.objects, (o) => {
      const estimate = o.estimate;
      const cost =
        !estimate || estimate.status === "missing"
          ? "нет сметы"
          : money
            ? `стоимость работ ${rub(estimate.amountRub)} (${estimate.origin === "manual" ? "вручную" : `смета, версия ${estimate.version}`})`
            : "смета есть";
      const parts = [
        `${o.object.code} ${o.object.label}`,
        cost,
        o.totals.count ? `часы ${hours(o.totals.minutes)}` : "записей нет",
        money && o.totals.count ? `начислено ${rub(o.totals.amountRub)}` : null,
        o.brigades.length ? `бригады ${o.brigades.map((b) => b.name).join(", ")}` : null,
      ];
      return `- ${parts.filter(Boolean).join("; ")}`;
    }),
  );

  if (money && input.versions?.length) {
    out.push("", "## Разбор смет: значения из файлов");
    const latest = [...input.versions].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
    out.push(
      ...capped(latest, LIMIT.versions, (v) => {
        const o = v.objectId ? objectOf0.get(v.objectId) : null;
        const totals = TOTAL_ORDER.filter((k) => v.totals[k])
          .map(
            (k) =>
              `${TOTAL_LABEL[k]} ${rub(v.totals[k]!.kopecks / 100)} (строка ${v.totals[k]!.row})`,
          )
          .join(", ");
        const parts = [
          `смета ${o?.code ?? "без объекта"}, версия ${v.version}, файл «${v.fileName}»`,
          v.confirmedAt ? `подтверждена ${day(v.confirmedAt.slice(0, 10))}` : "ждёт подтверждения",
          totals || "итоги не найдены",
          v.sections.length ? `разделов ${v.sections.length}` : null,
          v.laborHours
            ? `затраты труда ${v.laborHours.value.toLocaleString("ru-RU")} чел.-ч (строка ${v.laborHours.row})`
            : null,
        ];
        return `- ${parts.filter(Boolean).join("; ")}`;
      }),
    );
  }

  out.push("", "## Ждут решения менеджера");
  const waiting = data.entries.filter((e) => e.status === "pending" || e.status === "clarify");
  const objectOf = new Map(data.objects.map((o) => [o.id, o]));
  const brigadeOf = new Map(data.brigades.map((b) => [b.id, b.name]));
  out.push(
    ...(waiting.length
      ? capped(waiting, LIMIT.entries, (e) => {
          const o = objectOf.get(e.objectId);
          return `- запись ${e.number}: ${brigadeOf.get(e.brigadeId) ?? "бригада ?"}, ${o?.code ?? "объект ?"}, ${day(e.day)}, ${hours(e.minutes)}, ${STATUS[e.status]}`;
        })
      : ["- нет"]),
  );

  out.push("", "## Что мешает закрыть неделю");
  out.push(
    ...(reasons.length ? capped(reasons, LIMIT.reasons, (r) => `- ${r.text}`) : ["- ничего"]),
  );
  return out.join("\n");
}

/** Системная инструкция агента: отвечать только по данным, со ссылкой на источник */
export const ASSISTANT_SYSTEM = [
  "Ты агент учёта времени бригад газовой компании. Отвечаешь менеджеру, руководителю или бригадиру по-русски, коротко и по делу.",
  "Отвечай только по данным из блока <data>. Если ответа в данных нет, так и скажи и подскажи, на каком экране это посмотреть: «Проверка», «Табель», «Неделя», «Справочники».",
  "Каждую цифру сопровождай источником: номер записи, код объекта, название бригады или «смета ОБ-..., версия N».",
  "Ты не меняешь данные: записи принимает человек на экране «Проверка». Если просят что-то изменить, объясни, где это сделать.",
  "Если в данных сказано, что суммы скрыты, денег не называй.",
  "Без длинного тире, без эмодзи, без markdown-таблиц. Списки короткие, до 7 строк.",
].join("\n");
