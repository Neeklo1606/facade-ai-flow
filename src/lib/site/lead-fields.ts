/**
 * Поля заявки, общие для формы и сервера (ADR-051): откуда пришла заявка и сколько бригад.
 * Порт `LeadSink` берёт их отсюда, интерфейс тоже: порты экраны не импортируют (ADR-001).
 */
export const LEAD_SOURCES = ["landing", "razbor", "demo-final", "case"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const CREW_OPTIONS = ["1-3", "4-10", "больше 10"] as const;
