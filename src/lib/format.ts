import { format, formatDistanceToNow, differenceInCalendarDays } from "date-fns";
import { ru } from "date-fns/locale";

export const fmtDate = (d: string | Date) => format(new Date(d), "d MMM yyyy", { locale: ru });
export const fmtDateShort = (d: string | Date) => format(new Date(d), "d MMM", { locale: ru });
export const fmtDateTime = (d: string | Date) => format(new Date(d), "d MMM, HH:mm", { locale: ru });
export const fmtTime = (d: string | Date) => format(new Date(d), "HH:mm", { locale: ru });
export const fmtAgo = (d: string | Date) =>
  formatDistanceToNow(new Date(d), { locale: ru, addSuffix: true });
export const daysLeft = (d: string | Date, from: Date = new Date("2026-08-12")) =>
  differenceInCalendarDays(new Date(d), from);

const rub = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

export const fmtMoney = (v: number) => `${rub.format(v)} ₽`;
export const fmtMln = (v: number) =>
  `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(v / 1_000_000)} млн ₽`;
export const fmtNum = (v: number) => rub.format(v);
export const fmtPct = (v: number) =>
  `${v > 0 ? "+" : ""}${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(v)}%`;
