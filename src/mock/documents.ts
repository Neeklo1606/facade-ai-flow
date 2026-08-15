export type DocumentType =
  | "Договор"
  | "Допсоглашение"
  | "Проектная документация"
  | "Замерная карта"
  | "Акт"
  | "КС-2"
  | "КС-3"
  | "Сертификат"
  | "Письмо";

export type DocProcessing = "uploaded" | "recognizing" | "extracting" | "ready" | "error";

export interface Doc {
  id: string;
  name: string;
  type: DocumentType;
  projectId: string;
  uploadedBy: string;
  uploadedAt: string;
  processing: DocProcessing;
  sizeKb: number;
  pages: number;
}

export const docProcessingLabels: Record<DocProcessing, string> = {
  uploaded: "Загружен",
  recognizing: "Распознается",
  extracting: "Извлекаются данные",
  ready: "Готов",
  error: "Ошибка обработки",
};

export const documents: Doc[] = [
  {
    id: "D-8801",
    name: "Договор подряда СИ-2025/114-НВФ.pdf",
    type: "Договор",
    projectId: "obj-severnaya-korona",
    uploadedBy: "Соколов И.П.",
    uploadedAt: "2026-02-11T11:20:00+03:00",
    processing: "ready",
    sizeKb: 4820,
    pages: 34,
  },
  {
    id: "D-8834",
    name: "ДС №2 к СИ-2025/114-НВФ (доп. объем облицовки).pdf",
    type: "Допсоглашение",
    projectId: "obj-severnaya-korona",
    uploadedBy: "Волкова Е.С.",
    uploadedAt: "2026-06-18T15:02:00+03:00",
    processing: "ready",
    sizeKb: 1240,
    pages: 6,
  },
  {
    id: "D-8902",
    name: "Замерная карта, оси Г-К, 9-12 эт.xlsx",
    type: "Замерная карта",
    projectId: "obj-severnaya-korona",
    uploadedBy: "Гареев Р.М.",
    uploadedAt: "2026-08-04T09:45:00+03:00",
    processing: "extracting",
    sizeKb: 388,
    pages: 3,
  },
  {
    id: "D-8911",
    name: "Договор подряда ПС-2025/067-СПК.pdf",
    type: "Договор",
    projectId: "obj-meridian",
    uploadedBy: "Соколов И.П.",
    uploadedAt: "2026-01-23T10:10:00+03:00",
    processing: "ready",
    sizeKb: 6120,
    pages: 47,
  },
  {
    id: "D-8940",
    name: "АР. Фасады. Лист 12-18.pdf",
    type: "Проектная документация",
    projectId: "obj-meridian",
    uploadedBy: "Волкова Е.С.",
    uploadedAt: "2026-03-11T12:31:00+03:00",
    processing: "ready",
    sizeKb: 18400,
    pages: 18,
  },
  {
    id: "D-8977",
    name: "КС-2 за июль 2026, Школа 1547.pdf",
    type: "КС-2",
    projectId: "obj-school-1547",
    uploadedBy: "Волкова Е.С.",
    uploadedAt: "2026-08-03T16:48:00+03:00",
    processing: "recognizing",
    sizeKb: 940,
    pages: 5,
  },
  {
    id: "D-8985",
    name: "Сертификат соответствия. Керамогранит 600х600.pdf",
    type: "Сертификат",
    projectId: "obj-primorskiy",
    uploadedBy: "Дорохов С.Н.",
    uploadedAt: "2026-07-29T14:03:00+03:00",
    processing: "ready",
    sizeKb: 520,
    pages: 2,
  },
  {
    id: "D-8990",
    name: "Письмо заказчику о переносе сроков по захватке 2.docx",
    type: "Письмо",
    projectId: "obj-meridian",
    uploadedBy: "Соколов И.П.",
    uploadedAt: "2026-08-09T18:20:00+03:00",
    processing: "uploaded",
    sizeKb: 68,
    pages: 1,
  },
  {
    id: "D-9012",
    name: "Контракт 44-ФЗ №0173200001426000891.pdf",
    type: "Договор",
    projectId: "obj-school-1547",
    uploadedBy: "Волкова Е.С.",
    uploadedAt: "2026-05-06T10:02:00+03:00",
    processing: "recognizing",
    sizeKb: 2960,
    pages: 28,
  },
  {
    id: "D-9024",
    name: "ДС №1 к ПС-2025/067-СПК (перенос сроков остекления).pdf",
    type: "Допсоглашение",
    projectId: "obj-meridian",
    uploadedBy: "Соколов И.П.",
    uploadedAt: "2026-07-02T13:15:00+03:00",
    processing: "ready",
    sizeKb: 980,
    pages: 4,
  },
  {
    id: "D-9031",
    name: "Акт освидетельствования скрытых работ №14 (утеплитель, захватка 1).pdf",
    type: "Акт",
    projectId: "obj-severnaya-korona",
    uploadedBy: "Гареев Р.М.",
    uploadedAt: "2026-08-11T17:40:00+03:00",
    processing: "ready",
    sizeKb: 610,
    pages: 3,
  },
  {
    id: "D-9037",
    name: "КС-3 за июль 2026, Северная Корона к3.pdf",
    type: "КС-3",
    projectId: "obj-severnaya-korona",
    uploadedBy: "Волкова Е.С.",
    uploadedAt: "2026-08-05T12:12:00+03:00",
    processing: "ready",
    sizeKb: 720,
    pages: 2,
  },
  {
    id: "D-9044",
    name: "Замерная карта витража, оси 1-9, БЦ Меридиан.xlsx",
    type: "Замерная карта",
    projectId: "obj-meridian",
    uploadedBy: "Ким А.В.",
    uploadedAt: "2026-08-13T09:05:00+03:00",
    processing: "recognizing",
    sizeKb: 442,
    pages: 5,
  },
  {
    id: "D-9051",
    name: "Сертификат пожарной безопасности. Минеральная вата 100 мм.pdf",
    type: "Сертификат",
    projectId: "obj-severnaya-korona",
    uploadedBy: "Дорохов С.Н.",
    uploadedAt: "2026-06-22T11:31:00+03:00",
    processing: "ready",
    sizeKb: 340,
    pages: 2,
  },
  {
    id: "D-9058",
    name: "АР. Узлы примыканий кровли. Лист 4-9.pdf",
    type: "Проектная документация",
    projectId: "obj-primorskiy",
    uploadedBy: "Волкова Е.С.",
    uploadedAt: "2026-04-19T15:44:00+03:00",
    processing: "ready",
    sizeKb: 12800,
    pages: 9,
  },
  {
    id: "D-9066",
    name: "Акт приемки этапа «Подготовка и замеры».pdf",
    type: "Акт",
    projectId: "obj-school-1547",
    uploadedBy: "Соколов И.П.",
    uploadedAt: "2026-07-10T16:20:00+03:00",
    processing: "ready",
    sizeKb: 480,
    pages: 2,
  },
];
