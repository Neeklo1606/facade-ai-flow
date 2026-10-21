/**
 * Классы приёмов v3 для экранов ГАЙКИ: отдельно от компонентов, чтобы горячая замена
 * модулей работала и для файла с компонентами.
 */

/** Тон события и здоровья: красный блокирует, янтарный требует решения, серый информирует */
export type V3Tone = "danger" | "warn" | "ok" | "info" | "neutral";

/**
 * Тёплое поле сверху плитки цветом здоровья, как свечение у виджетов. Мелкая заливка:
 * правило «один большой градиент на экран» её не касается. Классы записаны целиком,
 * иначе сборщик стилей их не увидит.
 */
export const healthField: Record<V3Tone, string> = {
  danger:
    "bg-[radial-gradient(120%_100%_at_0%_0%,color-mix(in_oklab,var(--danger)_30%,transparent)_0%,transparent_62%)]",
  warn: "bg-[radial-gradient(120%_100%_at_0%_0%,color-mix(in_oklab,var(--warn)_30%,transparent)_0%,transparent_62%)]",
  ok: "bg-[radial-gradient(120%_100%_at_0%_0%,color-mix(in_oklab,var(--ok)_24%,transparent)_0%,transparent_62%)]",
  info: "bg-[radial-gradient(120%_100%_at_0%_0%,color-mix(in_oklab,var(--info)_24%,transparent)_0%,transparent_62%)]",
  neutral:
    "bg-[radial-gradient(120%_100%_at_0%_0%,color-mix(in_oklab,var(--sand)_22%,transparent)_0%,transparent_62%)]",
};

/** Класс растянутой ссылки карточки: вся карточка нажимается, фокус виден по контуру */
export const stretchedLink =
  "focus-ring absolute inset-0 z-[1] rounded-[var(--r-xl)] outline-offset-2";

/** Класс капсулы подсказки: «Here are your AI-based tips ›» из референса календаря */
export const tipCapsule =
  "focus-ring press group flex min-h-14 w-full items-center gap-3 rounded-full bg-surface-2 py-2 ps-2 pe-4 text-left transition-fast is-hover:bg-surface-3";
