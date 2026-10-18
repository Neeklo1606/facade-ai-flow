import type { ExtractionResult } from "@/contracts";

/**
 * Короткая запись значений для набора оценки и подготовленных разборов демо-режима.
 * Схема требует у каждого значения основание и фразу-источник, поэтому писать их руками
 * в тридцати сообщениях — верный способ ошибиться.
 */

type Field<T> = {
  value: T | null;
  basis: "stated" | "inferred_from_context" | "unknown";
  attention: string | null;
  provenance: { quote: string } | null;
};

/** Сказано вслух: значение и фраза, из которой оно взято */
export const stated = <T>(value: T, quote: string, attention: string | null = null): Field<T> => ({
  value,
  basis: "stated",
  attention,
  provenance: { quote },
});

/** Следует из контекста объекта: единственный лоток в справочнике, вчерашняя дата, «завтра» */
export const inferred = <T>(
  value: T,
  quote: string,
  attention: string | null = null,
): Field<T> => ({
  value,
  basis: "inferred_from_context",
  attention,
  provenance: { quote },
});

/** Не сказано и из контекста не следует. Ноль сюда не подставляется (правило 3) */
export const unknown = <T>(attention: string | null = null): Field<T> => ({
  value: null,
  basis: "unknown",
  attention,
  provenance: null,
});

/** Пустой разбор: сообщение без фактов */
export const emptyResult: ExtractionResult = {
  workRecords: [],
  tasks: [],
  risks: [],
  plannedTomorrow: [],
  clarifications: [],
};

export const result = (parts: Partial<ExtractionResult>): ExtractionResult => ({
  ...emptyResult,
  ...parts,
});
