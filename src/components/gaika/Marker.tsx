import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Моно-маркер подписи: ОБЪЁМ, ЛЮДИ, СРОК (дизайн-система, раздел 8). До двух слов —
 * длиннее это уже текст, и капс в нём запрещён. `data-marker` читает проверка кадра.
 */
export function Marker({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span data-marker="" className={cn("text-marker block", className)}>
      {children}
    </span>
  );
}
