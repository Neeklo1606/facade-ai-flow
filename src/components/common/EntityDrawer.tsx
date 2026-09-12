import type { ReactNode } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/**
 * Боковая карточка сущности: заголовок, подзаголовок, содержимое и нижняя панель действий.
 * Используется для объекта, задачи, документа, поставки и любой другой записи реестра.
 */
export function EntityDrawer({
  open,
  onOpenChange,
  title,
  subtitle,
  badges,
  footer,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  subtitle?: string;
  badges?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[520px]">
        <SheetHeader className="gap-1 border-b border-border px-5 py-4">
          <SheetTitle className="text-[18px] leading-tight font-semibold">{title}</SheetTitle>
          {subtitle && <SheetDescription className="text-[13px]">{subtitle}</SheetDescription>}
          {badges && <div className="mt-2 flex flex-wrap items-center gap-2">{badges}</div>}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
      </SheetContent>
    </Sheet>
  );
}
