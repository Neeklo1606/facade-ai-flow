import type { ReactNode } from "react";

/**
 * Главное действие экрана на телефоне: закреплено над нижней навигацией,
 * чтобы до него дотягивался большой палец. На десктопе не рендерится.
 */
export function MobileActionBar({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="h-16 lg:hidden" aria-hidden />
      <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-30 flex gap-2 border-t border-border bg-surface/95 px-4 py-2 backdrop-blur-xl lg:hidden [&>*]:flex-1">
        {children}
      </div>
    </>
  );
}
