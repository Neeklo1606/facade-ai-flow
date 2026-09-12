import { EmptyState } from "./EmptyState";

/** Ошибка загрузки раздела с повтором действия. */
export function ErrorState({
  title,
  description,
  onRetry,
  actionLabel = "Повторить",
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  actionLabel?: string;
}) {
  return (
    <EmptyState
      variant="error"
      {...(title ? { title } : {})}
      {...(description ? { description } : {})}
      actionLabel={actionLabel}
      {...(onRetry ? { onAction: onRetry } : {})}
    />
  );
}
