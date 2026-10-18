import type { ProjectContext } from "@/ports";

/**
 * Синтетический контекст объекта для набора оценки и демо-режима (ADR-035, п. 5).
 * Объект «Северный» из документа продукта: инженерные сети, секции А-В. Данные вымышленные
 * и используются только в наборе оценки — это не данные клиента.
 */
export const SAMPLE_CONTEXT: ProjectContext = {
  projectId: "p-severny",
  projectName: "Северный",
  workDate: "2026-10-16",
  timezone: "Europe/Moscow",
  zones: [
    { code: "A", name: "Секция А, оси 1-8" },
    { code: "B", name: "Секция Б, оси 8-14" },
    { code: "V", name: "Секция В, оси 14-20" },
    { code: "K2", name: "Корпус 2, отметка +6" },
  ],
  workTypes: [
    {
      code: "tray",
      name: "Монтаж кабельного лотка",
      units: ["пог. м"],
      synonyms: ["лоток", "кабельный лоток", "лотки"],
    },
    {
      code: "fireproof",
      name: "Огнезащита конструкций",
      units: ["м²"],
      synonyms: ["огнезащита", "огнебиозащита"],
    },
    {
      code: "backfill",
      name: "Обратная засыпка песком",
      units: ["м³"],
      synonyms: ["засыпка", "песок"],
    },
    {
      code: "anchors",
      name: "Разметка и сверление под анкеры",
      units: ["шт"],
      synonyms: ["анкеры", "сверление"],
    },
    {
      code: "duct",
      name: "Монтаж воздуховодов",
      units: ["пог. м", "м²"],
      synonyms: ["воздуховод", "вентиляция"],
    },
  ],
  people: [
    { id: "e-petrov", name: "Петров А. С." },
    { id: "e-gareev", name: "Гареев Р. М." },
    { id: "e-silin", name: "Силин К. Д." },
  ],
  crews: [
    { id: "cr-petrov", name: "Бригада Петрова" },
    { id: "cr-silin", name: "Бригада Силина" },
  ],
  materials: [
    { name: "Лоток кабельный 200×80", unit: "пог. м" },
    { name: "Нащельник угловой", unit: "шт" },
    { name: "Песок строительный", unit: "м³" },
    { name: "Анкер клиновой 12×100", unit: "шт" },
  ],
};

/** Второй объект с похожим названием: на нём проверяется, что модель не путает объекты */
export const SAMPLE_CONTEXT_TWIN: ProjectContext = {
  ...SAMPLE_CONTEXT,
  projectId: "p-severny-2",
  projectName: "Северный-2",
};
