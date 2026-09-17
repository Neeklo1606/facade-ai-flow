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

export { fmtMoney, fmtNum } from "@/shared/number-format";

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

/** Заголовок дня в ленте. `now` — время источника данных (useNow), а не устройства. */
export function fmtDayTitle(value: string, now: string) {
  const day = value.slice(0, 10);
  const today = now.slice(0, 10);
  const yesterday = format(new Date(parseISO(now).getTime() - 86_400_000), "yyyy-MM-dd");
  const label = format(parseISO(day), "d MMMM, EEEE", { locale: ru });
  if (day === today) return `Сегодня, ${label}`;
  if (day === yesterday) return `Вчера, ${label}`;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function fmtTime(value: string) {
  return format(parseISO(value), "HH:mm", { locale: ru });
}

/** «осталось 3 дн.», «просрочено на 2 ч» — по сроку, который посчитал сервер (`replyDue`). */
export function fmtReplyDue(due: { hours: number; overdue: boolean }) {
  const abs = Math.abs(due.hours);
  const amount = abs < 24 ? `${Math.max(1, abs)} ч` : `${Math.round(abs / 24)} дн.`;
  return due.overdue || due.hours < 0 ? `просрочено на ${amount}` : `осталось ${amount}`;
}

/** Форма слова по числу: plural(3, "позиция", "позиции", "позиций"). */
export function plural(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
