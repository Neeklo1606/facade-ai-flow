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
];
