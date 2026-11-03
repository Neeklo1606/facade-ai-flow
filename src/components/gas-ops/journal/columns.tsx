/**
 * Колонки «Журнала» (ADR-061, 10; раздел 4.4). Пустое – «–» с подсказкой, а не ноль (2.3, п. 2).
 */
import { isAutoAccepted } from "@/api/gas-ops";
import type { ReactNode } from "react";
import {
  CHANNEL_LABEL,
  ENTRY_STATUS_LABEL,
  costBreakdown,
  fmtHours,
  fmtManHours,
  fmtRub,
  formatClock,
  headcountOf,
  manMinutesOf,
  type EntryView,
  type Remark,
} from "@/api/gas-ops";
import { EntryStatusBadge } from "../marks";
import { RemarkChips } from "../review/remarks";
import { fmtShortDay } from "../review/rules";

export interface JournalRow {
  id: string;
  view: EntryView;
  remarks: Remark[];
}

export type ColumnKey =
  | "day"
  | "number"
  | "brigade"
  | "object"
  | "start"
  | "end"
  | "break"
  | "hours"
  | "crew"
  | "man"
  | "sum"
  | "status"
  | "remarks"
  | "channel";

export interface Column {
  key: ColumnKey;
  title: string;
  width: string;
  numeric?: boolean;
  money?: boolean;
  /**
   * Колонка выводится от 1280 px. Между 1024 и 1280 колонки с фиксированной шириной не
   * помещаются, а прокрутка таблицы вбок ломает липкие строки дня. Интервал и чел.-ч есть
   * в детали записи
   */
  wide?: boolean;
  cell: (row: JournalRow) => ReactNode;
}

const dash = (hint: string) => (
  <span className="text-text-3" title={hint} aria-label={hint}>
    –
  </span>
);

export const COLUMNS: Column[] = [
  { key: "day", title: "Дата", width: "w-[72px]", cell: ({ view }) => fmtShortDay(view.entry.day) },
  { key: "number", title: "№", width: "w-[76px]", cell: ({ view }) => view.entry.number },
  {
    key: "brigade",
    title: "Бригада",
    width: "w-[84px]",
    cell: ({ view }) => (
      <span className="block truncate" title={view.brigade?.name}>
        {view.brigade?.name ?? "–"}
      </span>
    ),
  },
  {
    key: "object",
    title: "Объект",
    width: "",
    cell: ({ view }) => (
      <span className="block truncate" title={view.object?.label}>
        {view.object?.label ?? "–"}
      </span>
    ),
  },
  {
    key: "start",
    title: "Начало",
    width: "w-[60px]",
    numeric: true,
    wide: true,
    cell: ({ view }) =>
      view.entry.startMinutes === null
        ? dash("В отчёте заказчика нет рамки смены")
        : formatClock(view.entry.startMinutes),
  },
  {
    key: "end",
    title: "Оконч.",
    width: "w-[60px]",
    numeric: true,
    wide: true,
    cell: ({ view }) =>
      view.entry.endMinutes === null
        ? dash("В отчёте заказчика нет рамки смены")
        : formatClock(view.entry.endMinutes),
  },
  {
    key: "break",
    title: "Перерыв",
    width: "w-[72px]",
    numeric: true,
    cell: ({ view }) => (view.entry.breakMinutes ? `${view.entry.breakMinutes} мин` : "0"),
  },
  {
    key: "hours",
    title: "Часы",
    width: "w-[52px]",
    numeric: true,
    cell: ({ view }) => fmtHours(view.hours).replace(/\s?ч$/, ""),
  },
  {
    key: "crew",
    title: "Состав",
    width: "w-[60px]",
    numeric: true,
    wide: true,
    cell: ({ view }) => {
      const people = headcountOf(view.entry);
      return people === null ? dash("Состав не указан") : `${people} чел.`;
    },
  },
  {
    key: "man",
    title: "Чел.-ч",
    width: "w-[56px]",
    numeric: true,
    wide: true,
    cell: ({ view }) => {
      const man = manMinutesOf(view.entry);
      return man === null
        ? dash("Не рассчитано: состав не указан")
        : fmtManHours(man, "чел.-ч").replace(/\s?чел\.-ч$/, "");
    },
  },
  {
    key: "sum",
    title: "Сумма",
    width: "w-[88px]",
    numeric: true,
    money: true,
    cell: ({ view }) => {
      const cost = costBreakdown(view);
      return cost.amountRub === null ? (
        dash("Не рассчитано: нет подтверждённой стоимости")
      ) : (
        <span title={cost.expected ? "Начислится при принятии" : cost.source}>
          {cost.expected ? "≈ " : ""}
          {fmtRub(cost.amountRub)}
        </span>
      );
    },
  },
  {
    key: "status",
    title: "Статус",
    // До 1400 px статус точкой с подсказкой: иначе на 1280 не помещается объект
    width: "w-[44px] min-[1400px]:w-[140px]",
    cell: ({ view }) => (
      <span
        title={
          isAutoAccepted(view.entry)
            ? "Принята автоматически"
            : ENTRY_STATUS_LABEL[view.entry.status]
        }
      >
        <EntryStatusBadge
          status={view.entry.status}
          auto={isAutoAccepted(view.entry)}
          className="max-w-full"
          labelClassName="truncate max-[1399px]:sr-only"
        />
      </span>
    ),
  },
  {
    key: "remarks",
    title: "Замечания",
    width: "w-[112px] min-[1400px]:w-[156px]",
    cell: ({ remarks }) =>
      remarks.length ? <RemarkChips remarks={remarks} /> : <span className="text-text-3">нет</span>,
  },
  {
    key: "channel",
    title: "Канал",
    width: "w-[96px]",
    cell: ({ view }) => (
      <span className="block truncate">
        {view.entry.channel
          ? CHANNEL_LABEL[view.entry.channel]
          : view.entry.source === "fact-report"
            ? "Выгрузка"
            : "–"}
      </span>
    ),
  },
];

/** По умолчанию: перерыв и канал скрыты, чтобы таблица помещалась на 1280 без прокрутки вбок */
export const DEFAULT_COLUMNS: ColumnKey[] = COLUMNS.map((c) => c.key).filter(
  (key) => key !== "break" && key !== "channel",
);

export const PAGE_SIZES = [25, 50, 100] as const;
