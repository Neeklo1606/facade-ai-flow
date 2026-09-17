import { cn } from "@/lib/utils";

/**
 * Базовый скелетон. Повторяет геометрию будущего содержимого,
 * поэтому размеры задаются через className, а не фиксированы внутри.
 */
export function Skeleton({ className }: { className?: string }) {
  return <span className={cn("skeleton block h-4 w-full", className)} aria-hidden />;
}

export { SkeletonLine, ListRowSkeleton, TableSkeleton } from "./Skeletons";
