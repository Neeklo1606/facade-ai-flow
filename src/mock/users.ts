import type { RoleId, User } from "@/types";

export const roleLabels: Record<RoleId, string> = {
  owner: "Собственник",
  pm: "Руководитель проекта",
  foreman: "Прораб",
  pto: "ПТО",
  supply: "Снабжение",
  finance: "Финансы",
  mechanic: "Механик",
};

export const users: User[] = [
  {
    id: "u-sokolov",
    name: "Соколов И. П.",
    role: "pm",
    roleLabel: roleLabels.pm,
    siteIds: ["s-korona", "s-meridian", "s-primorsky"],
    telegram: "@sokolov_ip",
    status: "active",
    lastActiveAt: "2026-09-05T12:40:00",
  },
  {
    id: "u-gareev",
    name: "Гареев Р. М.",
    role: "foreman",
    roleLabel: roleLabels.foreman,
    siteIds: ["s-korona"],
    telegram: "@gareev_rm",
    status: "active",
    lastActiveAt: "2026-09-05T11:12:00",
  },
  {
    id: "u-kim",
    name: "Ким А. В.",
    role: "foreman",
    roleLabel: roleLabels.foreman,
    siteIds: ["s-meridian", "s-school"],
    telegram: "@kim_av",
    status: "active",
    lastActiveAt: "2026-09-05T09:05:00",
  },
  {
    id: "u-volkova",
    name: "Волкова Е. С.",
    role: "pto",
    roleLabel: roleLabels.pto,
    siteIds: ["s-korona", "s-meridian", "s-primorsky", "s-school", "s-galaxy"],
    telegram: "@volkova_es",
    status: "active",
    lastActiveAt: "2026-09-04T17:30:00",
  },
  {
    id: "u-dorohov",
    name: "Дорохов С. Н.",
    role: "supply",
    roleLabel: roleLabels.supply,
    siteIds: ["s-korona", "s-meridian", "s-primorsky", "s-school", "s-galaxy"],
    telegram: "@dorohov_sn",
    status: "active",
    lastActiveAt: "2026-09-05T13:02:00",
  },
  {
    id: "u-panteleev",
    name: "Пантелеев А. Ю.",
    role: "owner",
    roleLabel: roleLabels.owner,
    siteIds: [],
    telegram: "@panteleev",
    status: "active",
    lastActiveAt: "2026-09-05T08:20:00",
  },
  {
    id: "u-ivashina",
    name: "Ивашина М. К.",
    role: "finance",
    roleLabel: roleLabels.finance,
    siteIds: [],
    telegram: null,
    status: "active",
    lastActiveAt: "2026-09-03T16:44:00",
  },
  {
    id: "u-nurgaliev",
    name: "Нургалиев Т. Р.",
    role: "mechanic",
    roleLabel: roleLabels.mechanic,
    siteIds: ["s-galaxy"],
    telegram: "@nurgaliev_tr",
    status: "invited",
    lastActiveAt: "2026-08-28T10:15:00",
  },
];

export const currentUser = users[0];

export function userName(id: string) {
  return users.find((u) => u.id === id)?.name ?? "—";
}
