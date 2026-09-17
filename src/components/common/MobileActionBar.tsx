import type { ReactNode } from "react";

/**
 * Главное действие экрана на телефоне: закреплено над нижней навигацией,
 * чтобы до него дотягивался большой палец. С 768px действие стоит в шапке экрана.
 */
export function MobileActionBar({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="h-16 md:hidden" aria-hidden />
      <div className="fixed inset-x-0 bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))] z-30 flex gap-2 border-t border-line bg-base px-4 py-2 md:hidden [&>*]:min-h-11 [&>*]:flex-1">
        {children}
      </div>
    </>
  );
}
