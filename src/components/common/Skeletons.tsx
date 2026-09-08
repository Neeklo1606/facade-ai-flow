import { cn } from "@/lib/utils";

export function SkeletonLine({ className }: { className?: string }) {
  return <span className={cn("skeleton block h-3 w-full", className)} aria-hidden />;
}

/** Скелетон плитки метрики — повторяет геометрию будущего контента. */
export function MetricTileSkeleton() {
  return (
    <div className="card-surface flex h-[118px] flex-col justify-between p-4">
      <div className="flex items-center justify-between">
        <SkeletonLine className="w-24" />
        <SkeletonLine className="size-4 rounded-full" />
      </div>
      <SkeletonLine className="h-7 w-20" />
      <SkeletonLine className="w-28" />
    </div>
  );
}

export function ListRowSkeleton() {
  return (
    <div className="flex items-start gap-3 px-5 py-3.5">
      <SkeletonLine className="size-7 shrink-0 rounded-[var(--r-xs)]" />
      <div className="min-w-0 flex-1 space-y-2">
        <SkeletonLine className="w-2/3" />
        <SkeletonLine className="w-full" />
        <div className="flex gap-2">
          <SkeletonLine className="h-[22px] w-24 rounded-[var(--r-xs)]" />
          <SkeletonLine className="h-[22px] w-20 rounded-[var(--r-xs)]" />
        </div>
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4">
          <SkeletonLine className="w-1/3" />
          <SkeletonLine className="w-1/5" />
          <SkeletonLine className="w-1/6" />
          <SkeletonLine className="ml-auto w-16" />
        </div>
      ))}
    </div>
  );
}
