/**
 * Поля заявки, общие для формы и сервера (ADR-051, ADR-067): откуда пришла заявка, сколько
 * бригад и какая задача интересна. Порт `LeadSink` берёт их отсюда, интерфейс тоже: порты
 * экраны не импортируют (ADR-001).
 */
export const LEAD_SOURCES = [
  "landing",
  "task-time",
  "task-supply",
  "task-docs",
  "case",
  "razbor",
  "demo-final",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const CREW_OPTIONS = ["1-3", "4-10", "больше 10"] as const;

/** Задача клиента в заявке (ADR-067): необязательное поле, три чипа формы */
export const LEAD_TASKS = ["time", "supply", "docs"] as const;
export type LeadTask = (typeof LEAD_TASKS)[number];

export const LEAD_TASK_LABEL: Record<LeadTask, string> = {
  time: "учёт времени",
  supply: "снабжение",
  docs: "документы",
};
