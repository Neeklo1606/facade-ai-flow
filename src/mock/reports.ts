export type ReportStatus = "pending" | "accepted" | "returned";
export type ReportSource = "text" | "voice" | "photo";

export interface ReportField {
  key: string;
  label: string;
  value: string;
  confidence: "high" | "medium" | "low";
}

export interface SiteReport {
  id: string;
  projectId: string;
  author: string;
  authorInitials: string;
  zone: string;
  floors: string;
  workType: string;
  volume: number;
  unit: string;
  photos: number;
  issues: string[];
  createdAt: string;
  status: ReportStatus;
  source: ReportSource;
  voiceDurationSec?: number;
  transcript?: string;
  fields?: ReportField[];
}

export const reports: SiteReport[] = [
  {
    id: "R-3391",
    projectId: "obj-severnaya-korona",
    author: "Гареев Р.М.",
    authorInitials: "ГР",
    zone: "Захватка 2, оси Г-К",
    floors: "9–11 этажи",
    workType: "Монтаж облицовки",
    volume: 184,
    unit: "м²",
    photos: 6,
    issues: ["Не хватает нащельника углового, 12 шт"],
    createdAt: "2026-08-12T08:12:00+03:00",
    status: "pending",
    source: "voice",
    voiceDurationSec: 47,
    transcript:
      "Гареев, Северная Корона, третий корпус. Сегодня закрыли облицовку с девятого по одиннадцатый, примерно сто восемьдесят четыре квадрата по захватке два. Нащельника углового не хватает, штук двенадцать надо довезти.",
    fields: [
      { key: "zone", label: "Захватка", value: "Захватка 2, оси Г-К", confidence: "high" },
      { key: "floors", label: "Этажи", value: "9–11", confidence: "high" },
      { key: "workType", label: "Вид работ", value: "Монтаж облицовки", confidence: "high" },
      { key: "volume", label: "Объем", value: "184 м²", confidence: "medium" },
      { key: "deficit", label: "Дефицит", value: "Нащельник угловой — 12 шт", confidence: "medium" },
    ],
  },
  {
    id: "R-3388",
    projectId: "obj-meridian",
    author: "Ким А.В.",
    authorInitials: "КА",
    zone: "Захватка 1, оси А-Г",
    floors: "6–7 этажи",
    workType: "Монтаж направляющих",
    volume: 96,
    unit: "пог. м",
    photos: 4,
    issues: ["Отклонение по геометрии стены, требуется удлиненный кронштейн"],
    createdAt: "2026-08-11T18:40:00+03:00",
    status: "pending",
    source: "text",
  },
  {
    id: "R-3384",
    projectId: "obj-school-1547",
    author: "Гареев Р.М.",
    authorInitials: "ГР",
    zone: "Главный фасад",
    floors: "1–3 этажи",
    workType: "Монтаж утеплителя",
    volume: 240,
    unit: "м²",
    photos: 8,
    issues: [],
    createdAt: "2026-08-11T17:05:00+03:00",
    status: "accepted",
    source: "photo",
  },
  {
    id: "R-3379",
    projectId: "obj-primorskiy",
    author: "Ким А.В.",
    authorInitials: "КА",
    zone: "Захватка 1, оси А-Г",
    floors: "5 этаж",
    workType: "Установка стеновых кронштейнов",
    volume: 312,
    unit: "шт",
    photos: 3,
    issues: ["Анкер клиновой 10х100 — остаток на 2 дня"],
    createdAt: "2026-08-10T19:22:00+03:00",
    status: "returned",
    source: "voice",
    voiceDurationSec: 31,
    transcript:
      "Ким, Приморский, дом семь. Пятый этаж, кронштейны поставили триста двенадцать штук. Анкера клинового осталось дня на два, не больше.",
    fields: [
      { key: "zone", label: "Захватка", value: "Захватка 1, оси А-Г", confidence: "high" },
      { key: "floors", label: "Этажи", value: "5", confidence: "high" },
      { key: "workType", label: "Вид работ", value: "Установка стеновых кронштейнов", confidence: "medium" },
      { key: "volume", label: "Объем", value: "312 шт", confidence: "low" },
    ],
  },
  {
    id: "R-3375",
    projectId: "obj-severnaya-korona",
    author: "Гареев Р.М.",
    authorInitials: "ГР",
    zone: "Захватка 1, оси А-Г",
    floors: "8 этаж",
    workType: "Монтаж примыканий",
    volume: 62,
    unit: "пог. м",
    photos: 5,
    issues: [],
    createdAt: "2026-08-10T18:14:00+03:00",
    status: "accepted",
    source: "text",
  },
];
