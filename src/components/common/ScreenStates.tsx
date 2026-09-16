import type { ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { AlertTriangle, Loader2, Lock, RefreshCw, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "./EmptyState";
import { SkeletonLine } from "./Skeletons";
import type { ScreenState } from "@/lib/screen-state";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/** Снять принудительное состояние из адреса — «Повторить» после ошибки. */
export function useClearForcedState() {
  const navigate = useNavigate();
  const location = useRouterState({ select: (s) => s.location });
  return () => {
    const search = { ...(location.search as Record<string, unknown>) };
    delete search["state"];
    void navigate({ to: location.pathname, search: search as never, replace: true });
  };
}

export type SkeletonKind = "table" | "cards" | "feed" | "split" | "matrix" | "summary";

export function ScreenSkeleton({ kind, rows = 6 }: { kind: SkeletonKind; rows?: number }) {
  if (kind === "cards") {
    return (
      <div
        className="grid gap-3 p-3 sm:grid-cols-2 lg:p-4 2xl:grid-cols-3"
        aria-busy
        aria-label="Загрузка"
      >
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="card-surface space-y-3 p-4">
            <SkeletonLine className="h-4 w-2/3" />
            <SkeletonLine className="w-1/2" />
            <SkeletonLine className="h-1.5 w-full rounded-full" />
            <div className="grid grid-cols-2 gap-2 pt-2">
              <SkeletonLine className="w-3/4" />
              <SkeletonLine className="w-3/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (kind === "feed") {
    return (
      <div className="space-y-3" aria-busy aria-label="Загрузка">
        {Array.from({ length: Math.min(rows, 4) }).map((_, i) => (
          <div key={i} className="card-surface space-y-3 p-4">
            <div className="flex items-center gap-3">
              <SkeletonLine className="size-10 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <SkeletonLine className="w-1/3" />
                <SkeletonLine className="w-1/4" />
              </div>
            </div>
            <SkeletonLine className="w-5/6" />
            <div className="grid grid-cols-3 gap-2">
              <SkeletonLine className="aspect-4/3 h-auto rounded-[var(--r-sm)]" />
              <SkeletonLine className="aspect-4/3 h-auto rounded-[var(--r-sm)]" />
              <SkeletonLine className="aspect-4/3 h-auto rounded-[var(--r-sm)]" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (kind === "split") {
    return (
      <div
        className="grid h-full grid-cols-1 gap-px bg-border lg:grid-cols-[260px_minmax(0,1fr)_460px]"
        aria-busy
        aria-label="Загрузка"
      >
        <div className="hidden space-y-3 bg-surface p-4 lg:block">
          {Array.from({ length: 10 }).map((_, i) => (
            <SkeletonLine key={i} className={i % 3 === 0 ? "w-2/3" : "ml-4 w-3/4"} />
          ))}
        </div>
        <div className="hidden bg-subtle p-6 lg:block">
          <SkeletonLine className="mx-auto h-full max-h-[900px] w-full max-w-[640px] rounded-none" />
        </div>
        <div className="space-y-4 bg-surface p-4">
          <SkeletonLine className="h-5 w-1/2" />
          <SkeletonLine className="h-1.5 w-full rounded-full" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2 border-b border-border pb-3">
              <SkeletonLine className="w-1/3" />
              <SkeletonLine className="w-5/6" />
              <SkeletonLine className="w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (kind === "matrix") {
    return (
      <div className="card-surface overflow-hidden" aria-busy aria-label="Загрузка">
        <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-px bg-border">
          {Array.from({ length: 16 }).map((_, i) => (
            <div key={i} className="space-y-2 bg-surface p-4">
              <SkeletonLine className="w-2/3" />
              <SkeletonLine className="w-1/2" />
              {i > 3 && <SkeletonLine className="w-3/4" />}
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (kind === "summary") {
    return (
      <div className="grid gap-4 xl:grid-cols-2" aria-busy aria-label="Загрузка">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card-surface space-y-3 p-4">
            <SkeletonLine className="h-4 w-1/3" />
            {Array.from({ length: 4 }).map((__, j) => (
              <SkeletonLine key={j} className="w-full" />
            ))}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="divide-y divide-border" aria-busy aria-label="Загрузка">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-4">
          <SkeletonLine className="w-1/3" />
          <SkeletonLine className="w-1/5" />
          <SkeletonLine className="hidden w-1/6 sm:block" />
          <SkeletonLine className="ml-auto w-16" />
        </div>
      ))}
    </div>
  );
}

export function ForbiddenState({ section, roles }: { section: string; roles: string }) {
  return (
    <EmptyState
      icon={Lock}
      title={`Нет доступа к разделу «${section}»`}
      description={`Раздел доступен: ${roles}. Запросите доступ у руководителя проекта — после выдачи права раздел откроется без перезагрузки.`}
      actionLabel="Запросить доступ"
      onAction={() =>
        toast.success("Запрос доступа отправлен", {
          description: "Соколов И. П. получит уведомление в Telegram.",
        })
      }
    />
  );
}

/** Полоса над содержимым: частичные данные или идущая обработка. */
export function StateBanner({
  tone,
  icon,
  title,
  children,
  action,
  className,
}: {
  tone: "warn" | "info";
  icon?: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const Icon = icon ?? (tone === "warn" ? AlertTriangle : Loader2);
  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-start gap-x-3 gap-y-2 rounded-[var(--r-md)] border px-4 py-3",
        tone === "warn"
          ? "border-[color-mix(in_oklab,var(--warn)_30%,transparent)] bg-warn-bg"
          : "border-[color-mix(in_oklab,var(--info)_25%,transparent)] bg-info-bg",
        className,
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tone === "warn" ? "text-warn" : "animate-spin text-info",
        )}
      />
      <div className="min-w-0 flex-1">
        <p className={cn("text-[13px] font-medium", tone === "warn" ? "text-warn" : "text-info")}>
          {title}
        </p>
        {children && <div className="mt-0.5 text-caption text-text-secondary">{children}</div>}
      </div>
      {action}
    </div>
  );
}

export interface StateCopy {
  empty: {
    title: string;
    description: string;
    actionLabel?: string;
    onAction?: () => void;
    icon?: LucideIcon;
  };
  filtered?: { title?: string; description?: string; onReset?: () => void };
  errorTitle: string;
  section: string;
  roles: string;
}

/**
 * Состояния, которые заменяют содержимое целиком: загрузка, пусто, пусто по фильтру,
 * ошибка, нет доступа. Частичные данные и обработка показываются полосой над содержимым в самих экранах.
 */
export function ScreenGate({
  state,
  skeleton,
  copy,
  children,
}: {
  state: ScreenState;
  skeleton: ReactNode;
  copy: StateCopy;
  children: ReactNode;
}) {
  const clear = useClearForcedState();
  switch (state) {
    case "loading":
      return <>{skeleton}</>;
    case "error":
      return (
        <EmptyState
          variant="error"
          title={copy.errorTitle}
          description="Сервер не ответил. Данные на экране не изменились — повторите загрузку. Если ошибка повторяется, напишите в поддержку."
          actionLabel="Повторить"
          onAction={clear}
        />
      );
    case "forbidden":
      return <ForbiddenState section={copy.section} roles={copy.roles} />;
    case "empty":
      return (
        <EmptyState
          {...(copy.empty.icon ? { icon: copy.empty.icon } : {})}
          title={copy.empty.title}
          description={copy.empty.description}
          {...(copy.empty.actionLabel && copy.empty.onAction
            ? { actionLabel: copy.empty.actionLabel, onAction: copy.empty.onAction }
            : {})}
        />
      );
    case "filtered":
      return (
        <EmptyState
          variant="filtered"
          title={copy.filtered?.title ?? "Ничего не найдено по условиям"}
          description={
            copy.filtered?.description ??
            "Измените условия отбора или сбросьте фильтры, чтобы увидеть все записи."
          }
          onAction={copy.filtered?.onReset ?? clear}
        />
      );
    default:
      return <>{children}</>;
  }
}

export function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <Button size="sm" variant="secondary" onClick={onClick}>
      <RefreshCw className="size-3.5" /> Обновить
    </Button>
  );
}
