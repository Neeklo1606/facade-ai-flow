import type { ProcessingJobRow } from "@/contracts";

/**
 * Журнал обращений к модели в демонстрации (ADR-035, п. 3). Записи подготовлены заранее,
 * как и сами разборы: в демо-режиме модель не вызывается, и провайдер `demo` виден
 * в каждой строке — журнал не выдаёт имитацию за работу живой модели.
 *
 * Вторая строка — отказ: ответ не прошёл схему и потому не применён. Она здесь нарочно,
 * чтобы разбор без результата был виден и в демонстрации, а не только в тесте.
 */
export const processingJobs: ProcessingJobRow[] = [
  {
    id: "pj-korona-shift",
    projectId: "p-korona",
    sourceId: "src-tg-gareev",
    task: "extract",
    provider: "demo",
    model: "demo-scenarios",
    promptVersion: "extract-2026-10-18",
    status: "ok",
    startedAt: "2026-09-05T08:42:06",
    durationMs: 1840,
    tokensIn: null,
    tokensOut: null,
    costKopecks: null,
    refusal: null,
    result: { workRecords: 1, tasks: 0, risks: 1, clarifications: 1 },
  },
  {
    id: "pj-korona-invalid",
    projectId: "p-korona",
    sourceId: null,
    task: "extract",
    provider: "demo",
    model: "demo-scenarios",
    promptVersion: "extract-2026-10-18",
    status: "invalid",
    startedAt: "2026-09-05T18:40:51",
    durationMs: 1210,
    tokensIn: null,
    tokensOut: null,
    costKopecks: null,
    refusal: "Ответ не прошёл схему: единица измерения не из справочника объекта",
    result: null,
  },
];
