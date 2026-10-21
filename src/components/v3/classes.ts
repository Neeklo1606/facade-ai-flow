/**
 * Классы приёмов v3 для экранов ГАЙКИ: отдельно от компонентов, чтобы горячая замена
 * модулей работала и для файла с компонентами.
 */

/** Тон события и здоровья: красный блокирует, янтарный требует решения, серый информирует */
export type V3Tone = "danger" | "warn" | "ok" | "info" | "neutral";

/**
 * Поле цветом здоровья сверху плитки было в v3. ADR-045, 3.4 и 5.16: градиентов на рабочих
 * экранах нет, статус показывается точкой и словом. Ключи оставлены, чтобы разметка не ломалась.
 */
export const healthField: Record<V3Tone, string> = {
  danger: "",
  warn: "",
  ok: "",
  info: "",
  neutral: "",
};

/** Класс растянутой ссылки карточки: вся карточка нажимается, фокус виден по контуру */
export const stretchedLink =
  "focus-ring absolute inset-0 z-[1] rounded-[var(--r-xl)] outline-offset-2";

/** Класс капсулы подсказки: «Here are your AI-based tips ›» из референса календаря */
export const tipCapsule =
  "focus-ring press group flex min-h-14 w-full items-center gap-3 rounded-full bg-surface-2 py-2 ps-2 pe-4 text-left transition-fast is-hover:bg-surface-3";
