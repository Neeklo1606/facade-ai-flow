import type { ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Окно по центру, как карточка в 1С (ADR-089): заголовок полосой, поля, кнопки внизу справа.
 * Для коротких форм — ручная стоимость, бригада, привязка к объекту. На телефоне то же окно
 * с отступами 16 и прокруткой внутри, а не шторка снизу: форма видна целиком.
 * Слой выше шторок (60/61): окно открывается и из шторки.
 */
export function CenterDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  testId,
  wide = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string | undefined;
  children: ReactNode;
  footer?: ReactNode;
  testId?: string | undefined;
  wide?: boolean;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-[var(--overlay)] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          data-testid={testId}
          className={cn(
            "fixed left-1/2 top-1/2 z-[71] flex max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-card border border-line bg-surface shadow-pop outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            wide ? "max-w-2xl" : "max-w-lg",
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-line bg-surface-2 px-4 py-3">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-heading">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-0.5 text-meta text-text-2">
                  {description}
                </DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">
                  {title}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              className="-me-2 -mt-1 grid size-11 shrink-0 place-items-center rounded-full text-text-2 focus-ring is-hover:bg-surface-3"
              aria-label="Закрыть окно"
            >
              <X className="size-4" aria-hidden />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
          {footer ? (
            <div className="flex flex-col-reverse gap-2 border-t border-line px-4 py-3 sm:flex-row sm:justify-end">
              {footer}
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
