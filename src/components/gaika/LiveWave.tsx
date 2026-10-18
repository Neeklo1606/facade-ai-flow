import { cn } from "@/lib/utils";

/**
 * Живая волна громкости (D1, п. 2): высота полос по уровню микрофона 0…1. В покое полосы
 * лежат точками, в записи поднимаются. Чисто вид: уровень приносит экран.
 */
const BARS = 28;

export function LiveWave({
  level,
  active,
  className,
}: {
  level: number;
  active: boolean;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn("flex h-16 items-center justify-center gap-1", className)}
    >
      {Array.from({ length: BARS }).map((_, index) => {
        // Огибающая: в середине полосы выше, к краям ниже — волна читается как голос
        const envelope = 0.45 + 0.55 * Math.sin(((index + 0.5) / BARS) * Math.PI);
        const jitter = 0.75 + 0.25 * Math.sin(index * 1.7 + level * 9);
        const height = active ? Math.max(6, Math.round(level * 60 * envelope * jitter)) : 6;
        return (
          <span
            key={index}
            className={cn(
              "w-1 rounded-full transition-[height] duration-150",
              active ? "bg-text" : "bg-text-3/40",
            )}
            style={{ height: `${height}px` }}
          />
        );
      })}
    </div>
  );
}
