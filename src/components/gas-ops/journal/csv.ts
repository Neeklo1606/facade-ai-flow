/** «Выгрузить выбранные» в «Журнале» (ADR-061, 10; раздел 4.4) */
import {
  CHANNEL_LABEL,
  ENTRY_STATUS_LABEL,
  costBreakdown,
  formatClock,
  headcountOf,
  manMinutesOf,
} from "@/api/gas-ops";
import type { JournalRow } from "./columns";

const csvCell = (value: string | number | null) => {
  const text = value === null ? "" : String(value);
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/**
 * Выбранные записи в CSV с разделителем «;» (так открывает Excel в русской локали). Пустое
 * остаётся пустым: человеко-часы без состава не превращаются в ноль.
 */
export function journalCsv(rows: JournalRow[], money: boolean): string {
  const head = [
    "Дата",
    "Номер",
    "Бригада",
    "Объект",
    "Начало",
    "Окончание",
    "Перерыв, мин",
    "Минуты",
    "Состав",
    "Чел.-ч",
    ...(money ? ["Сумма, ₽", "Источник суммы"] : []),
    "Статус",
    "Замечания",
    "Канал",
  ];
  const lines = rows.map(({ view, remarks }) => {
    const { entry } = view;
    const man = manMinutesOf(entry);
    const cost = costBreakdown(view);
    return [
      entry.day,
      entry.number,
      view.brigade?.name ?? "",
      view.object?.label ?? "",
      entry.startMinutes === null ? "" : formatClock(entry.startMinutes),
      entry.endMinutes === null ? "" : formatClock(entry.endMinutes),
      entry.breakMinutes,
      entry.minutes,
      headcountOf(entry),
      man === null ? null : (man / 60).toFixed(2).replace(".", ","),
      ...(money ? [cost.expected ? null : cost.amountRub, cost.source] : []),
      ENTRY_STATUS_LABEL[entry.status],
      remarks.map((r) => r.label).join(", "),
      entry.channel ? CHANNEL_LABEL[entry.channel] : "",
    ]
      .map(csvCell)
      .join(";");
  });
  return [head.join(";"), ...lines].join("\n");
}

export function downloadJournalCsv(rows: JournalRow[], money: boolean): void {
  // BOM, чтобы Excel узнал UTF-8
  const blob = new Blob(["﻿", journalCsv(rows, money)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `zhurnal-${rows.length}-zapisej.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
