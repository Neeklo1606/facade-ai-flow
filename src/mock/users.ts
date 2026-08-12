export type UserRole =
  | "Генеральный директор"
  | "Руководитель проекта"
  | "Прораб"
  | "ПТО"
  | "Снабжение"
  | "Финансы";

export interface User {
  id: string;
  name: string;
  initials: string;
  role: UserRole;
  projects: string[];
  telegram: boolean;
  lastActive: string;
  active: boolean;
  email: string;
}

export const users: User[] = [
  {
    id: "u-sokolov",
    name: "Соколов И.П.",
    initials: "СИ",
    role: "Руководитель проекта",
    projects: ["obj-severnaya-korona", "obj-meridian", "obj-primorskiy", "obj-school-1547", "obj-galaktika"],
    telegram: true,
    lastActive: "2026-08-12T09:41:00+03:00",
    active: true,
    email: "sokolov@fasad-rp.ru",
  },
  {
    id: "u-gareev",
    name: "Гареев Р.М.",
    initials: "ГР",
    role: "Прораб",
    projects: ["obj-severnaya-korona", "obj-school-1547"],
    telegram: true,
    lastActive: "2026-08-12T08:12:00+03:00",
    active: true,
    email: "gareev@fasad-rp.ru",
  },
  {
    id: "u-kim",
    name: "Ким А.В.",
    initials: "КА",
    role: "Прораб",
    projects: ["obj-meridian", "obj-galaktika"],
    telegram: true,
    lastActive: "2026-08-11T19:04:00+03:00",
    active: true,
    email: "kim@fasad-rp.ru",
  },
  {
    id: "u-volkova",
    name: "Волкова Е.С.",
    initials: "ВЕ",
    role: "ПТО",
    projects: ["obj-severnaya-korona", "obj-meridian", "obj-primorskiy"],
    telegram: false,
    lastActive: "2026-08-12T10:02:00+03:00",
    active: true,
    email: "volkova@fasad-rp.ru",
  },
  {
    id: "u-dorohov",
    name: "Дорохов С.Н.",
    initials: "ДС",
    role: "Снабжение",
    projects: ["obj-severnaya-korona", "obj-meridian", "obj-primorskiy", "obj-galaktika"],
    telegram: true,
    lastActive: "2026-08-12T09:58:00+03:00",
    active: true,
    email: "dorohov@fasad-rp.ru",
  },
  {
    id: "u-lebedev",
    name: "Лебедев А.А.",
    initials: "ЛА",
    role: "Генеральный директор",
    projects: [],
    telegram: false,
    lastActive: "2026-08-11T17:22:00+03:00",
    active: true,
    email: "lebedev@fasad-rp.ru",
  },
];

export const currentUser: User = users[0]!;
