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
  return value.toLocaleString("ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits });
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
