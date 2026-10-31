/**
 * Демо-набор исполнительной документации (ADR-058). У заказчика нет проекта, участников
 * и записей объёмов, поэтому всё ниже помечено source: "mock" и подписано «Демо» на экране.
 * Организации и представители названы ролями, номеров НРС нет: их вносит ПТО из документов.
 *
 * Сценарий показа: на ОБ-101 у акта по футлярам не хватает только сертификата на трубу
 * (его привезёт поставка снабжения), у дымохода не подтверждён объём. На ОБ-102 нет
 * исполнительной схемы и приказа представителя строительного контроля.
 */
import type {
  DocsState,
  Participant,
  ProjectSheet,
  WorkKind,
  WorkRecord,
} from "@/domain/gas-ops/exec-docs";

function shift(today: string, days: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const KINDS: WorkKind[] = [
  {
    id: "wk-sleeve",
    name: "Прокладка газопровода в футлярах через стены и перекрытия",
    unit: "м",
    act: "aosr",
    needsScheme: true,
    needsTests: false,
    next: "Заделка футляров и отделка стен",
    source: "mock",
  },
  {
    id: "wk-flue",
    name: "Монтаж коаксиального дымохода котла",
    unit: "компл",
    act: "aosr",
    needsScheme: true,
    needsTests: true,
    next: "Пусконаладка котла",
    source: "mock",
  },
];

function team(objectId: string, controlAuthority: boolean): Participant[] {
  return [
    {
      id: `pt-${objectId}-cc`,
      objectId,
      side: "customer-control",
      org: "Демо-заказчик",
      position: "Инженер строительного контроля",
      person: "Представитель заказчика",
      authority: { title: "Приказ о назначении (демо)", fileName: "приказ_заказчик.pdf" },
      nrsId: null,
      source: "mock",
    },
    {
      id: `pt-${objectId}-b`,
      objectId,
      side: "builder",
      org: "Демо-подрядчик",
      position: "Прораб",
      person: "Прораб объекта",
      authority: { title: "Приказ о назначении (демо)", fileName: "приказ_прораб.pdf" },
      nrsId: null,
      source: "mock",
    },
    {
      id: `pt-${objectId}-bc`,
      objectId,
      side: "builder-control",
      org: "Демо-подрядчик",
      position: "Инженер ПТО",
      person: "Специалист строительного контроля",
      authority: controlAuthority
        ? { title: "Приказ о назначении (демо)", fileName: "приказ_стройконтроль.pdf" }
        : null,
      nrsId: null,
      source: "mock",
    },
  ];
}

export function buildDocsSeed(today: string): DocsState {
  const sheets: ProjectSheet[] = [
    {
      id: "sh-m1",
      objectId: "obj-m1",
      cipher: "ДЕМО-101-ГСВ",
      section: "ГСВ",
      sheets: "1–4",
      title: "Газоснабжение внутреннее (демо)",
      author: "Демо-проектировщик",
      source: "mock",
    },
    {
      id: "sh-m2",
      objectId: "obj-m2",
      cipher: "ДЕМО-102-ГСВ",
      section: "ГСВ",
      sheets: "1–3",
      title: "Газоснабжение внутреннее (демо)",
      author: "Демо-проектировщик",
      source: "mock",
    },
  ];
  const works: WorkRecord[] = [
    {
      id: "wr-1",
      number: "РО-0001",
      objectId: "obj-m1",
      zone: "Кухня, ввод через стену",
      kindId: "wk-sleeve",
      volume: 12,
      from: shift(today, -5),
      to: shift(today, -4),
      materials: [{ itemId: "nm-pipe-20", qty: 12 }],
      sheetIds: ["sh-m1"],
      reportedBy: "Прораб",
      volumeConfirmedBy: "Прораб",
      volumeConfirmedAt: `${shift(today, -4)}T17:20:00`,
      source: "mock",
    },
    {
      id: "wr-2",
      number: "РО-0002",
      objectId: "obj-m1",
      zone: "Котельная",
      kindId: "wk-flue",
      volume: 1,
      from: shift(today, -2),
      to: shift(today, -2),
      materials: [{ itemId: "nm-flue", qty: 1 }],
      sheetIds: ["sh-m1"],
      reportedBy: "Прораб",
      volumeConfirmedBy: null,
      volumeConfirmedAt: null,
      source: "mock",
    },
    {
      id: "wr-3",
      number: "РО-0003",
      objectId: "obj-m2",
      zone: "Узел 3, ввод в дом",
      kindId: "wk-sleeve",
      volume: 6,
      from: shift(today, -3),
      to: shift(today, -3),
      materials: [{ itemId: "nm-pipe-15", qty: 6 }],
      sheetIds: ["sh-m2"],
      reportedBy: "Прораб",
      volumeConfirmedBy: "Прораб",
      volumeConfirmedAt: `${shift(today, -3)}T18:05:00`,
      source: "mock",
    },
  ];
  return {
    participants: [...team("obj-m1", true), ...team("obj-m2", false)],
    sheets,
    kinds: KINDS,
    works,
    files: [
      {
        id: "df-1",
        objectId: "obj-m1",
        kind: "scheme",
        fileName: "схема_футляры_ОБ-101.pdf",
        workId: "wr-1",
        itemId: null,
        participantId: null,
        docId: null,
        by: "Прораб",
        at: `${shift(today, -4)}T17:25:00`,
      },
      {
        id: "df-2",
        objectId: "obj-m2",
        kind: "certificate",
        fileName: "сертификат_ВГП15.pdf",
        workId: null,
        itemId: "nm-pipe-15",
        participantId: null,
        docId: null,
        by: "ПТО",
        at: `${shift(today, -3)}T10:00:00`,
      },
    ],
    docs: [],
    registries: [],
    journal: [],
  };
}
