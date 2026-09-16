import { format, formatDistanceToNow, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

export function fmtDate(value: string) {
  return format(parseISO(value), "dd.MM.yyyy", { locale: ru });
}

export function fmtDateTime(value: string) {
  return format(parseISO(value), "dd.MM, HH:mm", { locale: ru });
}

export function fmtAgo(value: string) {
  return formatDistanceToNow(parseISO(value), { addSuffix: true, locale: ru });
}

export function fmtNum(value: number, digits = 0) {
  return value.toLocaleString("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtMoney(value: number) {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

export function fmtMln(value: number) {
  return `${(value / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн ₽`;
}

export function fmtDuration(ms: number) {
  return `${(ms / 1000).toFixed(1)} с`;
}

export function fmtSec(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** «Сегодня» демо-данных: все сроки и отметки времени в моках отсчитываются от него. */
export const MOCK_NOW = "2026-09-05T12:00:00";

export function fmtDayTitle(value: string) {
  const day = value.slice(0, 10);
  const today = MOCK_NOW.slice(0, 10);
  const yesterday = format(new Date(parseISO(MOCK_NOW).getTime() - 86_400_000), "yyyy-MM-dd");
  const label = format(parseISO(day), "d MMMM, EEEE", { locale: ru });
  if (day === today) return `Сегодня, ${label}`;
  if (day === yesterday) return `Вчера, ${label}`;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function fmtTime(value: string) {
  return format(parseISO(value), "HH:mm", { locale: ru });
}

/** «через 3 дня», «просрочено на 2 дня» относительно MOCK_NOW. */
export function fmtDue(value: string) {
  const diffHours = (parseISO(value).getTime() - parseISO(MOCK_NOW).getTime()) / 3_600_000;
  const abs = Math.abs(diffHours);
  const amount = abs < 24 ? `${Math.max(1, Math.round(abs))} ч` : `${Math.round(abs / 24)} дн.`;
  return {
    overdue: diffHours < 0,
    label: diffHours < 0 ? `просрочено на ${amount}` : `осталось ${amount}`,
  };
}

/** Форма слова по числу: plural(3, "позиция", "позиции", "позиций"). */
export function plural(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
