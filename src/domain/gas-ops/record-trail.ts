/**
 * Путь записи (ADR-068): четыре шага из статуса записи и числа замечаний. Чистая функция,
 * интерфейс только рисует. Нет решения человека — шаги «Подтверждено» и «В отчёте» пустые.
 */
import type { EntryStatus } from "./model";

export type TrailState = "done" | "warn" | "fail" | "todo";
export type TrailStep = { label: string; state: TrailState };

export function trailOf(status: EntryStatus, remarkCount: number): TrailStep[] {
  const confirmed = status === "confirmed";
  const rejected = status === "rejected";
  const draft = status === "draft";
  return [
    { label: "Внесено", state: draft ? "todo" : "done" },
    { label: "Проверено", state: draft ? "todo" : remarkCount > 0 ? "warn" : "done" },
    {
      label: rejected ? "Отклонено" : status === "clarify" ? "На уточнении" : "Подтверждено",
      state: confirmed ? "done" : rejected ? "fail" : status === "clarify" ? "warn" : "todo",
    },
    { label: "В отчёте", state: confirmed ? "done" : "todo" },
  ];
}
