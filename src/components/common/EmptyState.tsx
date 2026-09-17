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
      title: "Не получилось загрузить данные",
      description:
        "Связь с сервером прервалась. Данные не потерялись — повторите через несколько секунд.",
    },
  }[variant];

  const label =
    actionLabel ??
    (variant === "filtered" ? "Сбросить фильтры" : variant === "error" ? "Повторить" : undefined);

  return (
    <div
      role={variant === "error" ? "alert" : undefined}
      className="flex flex-col items-center justify-center px-6 py-14 text-center"
    >
      {/* Иконка в круге 44px --surface-2 */}
      <span className="grid size-11 place-items-center rounded-full bg-surface-2">
        <Icon
          className={variant === "error" ? "size-5 text-danger" : "size-5 text-text-2"}
          strokeWidth={1.5}
        />
      </span>
      <h3 className="mt-4 text-[16px] leading-[1.35] font-semibold text-text">
        {title ?? defaults.title}
      </h3>
      <p className="mt-1.5 max-w-md text-[13px] leading-[1.45] text-text-2">
        {description ?? defaults.description}
      </p>
      {label && onAction && (
        <Button
          className="mt-5"
          variant={variant === "empty" ? "accent" : "secondary"}
          onClick={onAction}
        >
          {label}
        </Button>
      )}
    </div>
  );
}
