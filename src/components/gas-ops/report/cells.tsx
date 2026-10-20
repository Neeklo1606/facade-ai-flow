/**
 * Мелкие части отчёта (ADR-044, F6): значение ячейки, точка «новая», тихая метка «Демо».
 */
import { cn } from "@/lib/utils";
import { DASH } from "./cell-text";

export function Value({ text, className }: { text: string; className?: string }) {
  return <span className={cn("tnum", text === DASH && "text-text-3", className)}>{text}</span>;
}

/** Точка «новая»: запись по строке создана или изменена в этой вкладке */
export function NewDot() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-orange">
      <span aria-hidden className="size-2 rounded-full bg-orange" />
      новая
    </span>
  );
}

/** «Демо» тихой серой подписью рядом со значением (визуал v3, п. 8) */
export function DemoMark() {
  return <span className="shrink-0 text-[12px] text-text-3">Демо</span>;
}
