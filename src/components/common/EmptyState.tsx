import type { LucideIcon } from "lucide-react";
import { AlertCircle, FilterX, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";

export type EmptyVariant = "empty" | "filtered" | "error";

const fallbackIcon: Record<EmptyVariant, LucideIcon> = {
  empty: Inbox,
  filtered: FilterX,
  error: AlertCircle,
};

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  variant = "empty",
}: {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  variant?: EmptyVariant;
}) {
  const Icon = icon ?? fallbackIcon[variant];
  const defaults = {
    empty: {
      title: "Пока пусто",
      description: "Данные появятся здесь, как только поступят из подключённых каналов.",
    },
    filtered: {
      title: "Ничего не найдено по заданным фильтрам",
      description: "Измените условия или сбросьте фильтры, чтобы увидеть все записи.",
    },
    error: {
      title: "Не удалось загрузить данные",
      description: "Что-то пошло не так. Попробуйте ещё раз через пару секунд.",
    },
  }[variant];

  const label =
    actionLabel ?? (variant === "filtered" ? "Сбросить фильтры" : variant === "error" ? "Повторить" : undefined);

  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <span className="grid size-[72px] place-items-center rounded-full bg-subtle">
        <Icon className="size-10 text-text-muted" strokeWidth={1.5} />
      </span>
      <h3 className="mt-4 text-[15px] font-medium">{title ?? defaults.title}</h3>
      <p className="mt-2 max-w-md text-[13px] text-text-secondary">{description ?? defaults.description}</p>
      {label && onAction && (
        <Button className="mt-4" size="sm" variant={variant === "empty" ? "default" : "secondary"} onClick={onAction}>
          {label}
        </Button>
      )}
    </div>
  );
}
