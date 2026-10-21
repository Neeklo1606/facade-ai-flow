/**
 * Общее для экрана «Проверка»: строка очереди, маркер источника и его цвет. Цвет полосы
 * карточки говорит, откуда пришёл факт, как категории событий в календаре референса.
 */
import { useSyncExternalStore } from "react";
import type { ReportCard } from "@/api/types";
import { sourceKindLabel } from "@/contracts";

export interface FactRow {
  card: ReportCard;
  projectName: string;
  zoneName: string;
}

type SourceLike = {
  kind: keyof typeof sourceKindLabel;
  captureKey: string | null;
  location: string;
};

/**
 * Маркер источника до двух слов: запись с экрана «Запись» — «Голосовое» или «Текст»
 * (ADR-036 хранит её как ручной источник с ключом отправки), остальное — по виду источника.
 */
export function sourceMarker(source: SourceLike) {
  if (source.captureKey) return source.location === "текст" ? "Текст" : "Голосовое";
  return source.kind === "telegram" ? "С площадки" : sourceKindLabel[source.kind];
}

/** Цвет полосы и чипа по источнику. Оранжевый не берём: он у главного действия экрана */
export function sourceTone(source: SourceLike | null): { bar: string; chip: string } {
  const marker = source ? sourceMarker(source) : null;
  if (marker === "Голосовое") return { bar: "bg-warn", chip: "bg-warn-bg text-warn" };
  if (marker === "Текст") return { bar: "bg-info", chip: "bg-info-bg text-info" };
  if (marker === "С площадки") return { bar: "bg-sand", chip: "bg-surface-2 text-text" };
  return { bar: "bg-text-3", chip: "bg-surface-2 text-text-2" };
}

/** Короткое имя дня для заголовка группы: «Сегодня», «Вчера», «2 сентября» */
export function dayLabel(title: string) {
  return title.split(",")[0] ?? title;
}

const DESKTOP = "(min-width: 1024px)";

function subscribe(listener: () => void) {
  const query = window.matchMedia(DESKTOP);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

/** Десктоп от 1024 px: список и панель деталей рядом. На сервере считаем телефоном */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP).matches,
    () => false,
  );
}
