import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Раскладка с панелью деталей 480px справа. Панель сжимает контент, а не перекрывает его;
 * Esc закрывает. Ниже 1024px сжимать некуда — панель открывается на весь экран поверх.
 */
export function DetailsLayout({
  open,
  onClose,
  title,
  subtitle,
  panel,
  footer,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  panel: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const titleId = useId();
  // Последний onClose без перезапуска эффекта: иначе панель забирала бы фокус на каждом рендере
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    // Фокус в панель при открытии, чтобы Esc и Tab работали сразу
    panelRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // Esc принадлежит верхнему слою: открытый диалог, палитра команд или меню закрываются первыми
      if (
        document.querySelector(
          '[role="dialog"][data-state="open"], [role="alertdialog"], [data-radix-popper-content-wrapper]',
        )
      )
        return;
      closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className={cn("flex min-h-0 min-w-0", className)}>
      <div className="min-w-0 flex-1">{children}</div>
      {open && (
        <aside
          ref={panelRef}
          tabIndex={-1}
          aria-labelledby={titleId}
          className="fixed inset-0 z-50 flex flex-col bg-surface outline-none lg:relative lg:inset-auto lg:z-auto lg:ml-4 lg:w-[480px] lg:shrink-0 lg:rounded-l-[var(--r-lg)] lg:border-l lg:border-line lg:shadow-[var(--lift-3)] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150"
        >
          <header className="flex items-start gap-3 border-b border-line px-6 py-5">
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-[20px] leading-[1.25] font-semibold text-text">
                {title}
              </h2>
              {subtitle && <div className="mt-1 text-[13px] text-text-2">{subtitle}</div>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть панель"
              title="Закрыть (Esc)"
              className="focus-ring grid size-11 shrink-0 place-items-center lg:size-[38px] rounded-[var(--r-sm)] text-text-2 transition-fast is-hover:bg-surface-2 is-hover:text-text"
            >
              <X className="size-[18px]" strokeWidth={1.5} />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{panel}</div>
          {footer && (
            <footer className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
              {footer}
            </footer>
          )}
        </aside>
      )}
    </div>
  );
}
