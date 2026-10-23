import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Экран «Ещё» как «Настройки» в Telegram (ADR-048, 01_SPEC 4.1): группы однострочных строк 52
 * с иконкой 20, подпись группы над ней, строка нажимается целиком.
 */
export function SettingsGroup({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-1.5", className)} aria-label={title}>
      {title ? <h2 className="px-4 text-meta text-text-3">{title}</h2> : null}
      <ul className="overflow-hidden rounded-card bg-surface ring-1 ring-line [&>li+li]:border-t [&>li+li]:border-line">
        {children}
      </ul>
    </section>
  );
}

const rowClass =
  "flex min-h-row-compact w-full items-center gap-3 px-4 py-2.5 text-left text-body text-text transition-colors duration-100 focus-ring active:bg-surface-2 is-hover:bg-surface-2 [touch-action:manipulation]";

interface RowContent {
  icon?: LucideIcon;
  label: string;
  /** Значение справа тихим текстом, как «Тёмная» у темы */
  value?: string;
  tone?: "normal" | "danger";
}

function Inner({
  icon: Icon,
  label,
  value,
  tone = "normal",
  chevron,
}: RowContent & { chevron: boolean }) {
  return (
    <>
      {Icon ? (
        <Icon
          className={cn("size-5 shrink-0", tone === "danger" ? "text-danger" : "text-text-2")}
          strokeWidth={1.75}
          aria-hidden
        />
      ) : null}
      <span className={cn("min-w-0 flex-1 truncate", tone === "danger" && "text-danger")}>
        {label}
      </span>
      {value ? <span className="shrink-0 text-meta text-text-3">{value}</span> : null}
      {chevron ? <ChevronRight className="size-4 shrink-0 text-text-3" aria-hidden /> : null}
    </>
  );
}

/** Строка-переход: обычная ссылка, вложенный экран открывается сдвигом (ADR-048, 4) */
export function SettingsLink({
  to,
  search,
  ...content
}: RowContent & { to: string; search?: Record<string, string> }) {
  return (
    <li>
      <Link to={to} search={search as never} viewTransition className={rowClass}>
        <Inner {...content} chevron />
      </Link>
    </li>
  );
}

/** Строка-действие: открывает шторку или делает действие на месте */
export function SettingsButton({
  onSelect,
  chevron = false,
  ...content
}: RowContent & { onSelect: () => void; chevron?: boolean }) {
  return (
    <li>
      <button type="button" onClick={onSelect} className={rowClass}>
        <Inner {...content} chevron={chevron} />
      </button>
    </li>
  );
}

/** Произвольная строка (выбор темы капсулами): тот же отступ и высота */
export function SettingsItem({ children }: { children: ReactNode }) {
  return <li className="flex min-h-row-compact items-center gap-3 px-4 py-2">{children}</li>;
}

/** Карточка роли вверху «Ещё»: аватар 48, имя, роль, «Сменить роль» */
export function RoleCard({
  initials,
  name,
  role,
  onChange,
  changeLabel = "Сменить роль",
}: {
  initials: string;
  name: string;
  role: string;
  onChange?: () => void;
  changeLabel?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-card bg-surface p-4 ring-1 ring-line">
      <span
        aria-hidden
        className="grid size-12 shrink-0 place-items-center rounded-full bg-pill text-body-strong text-pill-text"
      >
        {initials}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-heading text-text">{name}</span>
        <span className="block text-meta text-text-2">{role}</span>
      </span>
      {onChange ? (
        <button
          type="button"
          onClick={onChange}
          className="inline-flex min-h-11 shrink-0 items-center rounded-full px-2 text-body-strong whitespace-nowrap text-text-2 focus-ring [touch-action:manipulation]"
        >
          {changeLabel}
        </button>
      ) : null}
    </div>
  );
}

/** Выбор темы: подпись строкой, под ней три капсулы на всю ширину, ничего не наезжает */
export function ThemeSetting({
  icon: Icon,
  value,
  options,
  onChange,
}: {
  icon: LucideIcon;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <li className="flex flex-col gap-2.5 px-4 py-3">
      <span className="flex items-center gap-3 text-body text-text">
        <Icon className="size-5 shrink-0 text-text-2" strokeWidth={1.75} aria-hidden />
        Тема
      </span>
      <span
        role="group"
        aria-label="Тема оформления"
        className="grid grid-cols-3 gap-1 rounded-full bg-surface-2 p-1"
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
            className={cn(
              "min-h-10 rounded-full px-2 text-meta-strong transition-colors duration-100 focus-ring",
              value === option.value
                ? "bg-surface text-text shadow-none ring-1 ring-line"
                : "text-text-2",
            )}
          >
            {option.label}
          </button>
        ))}
      </span>
    </li>
  );
}
