import type { ReactNode } from "react";

/**
 * Главное действие экрана на телефоне: закреплено над нижней навигацией, чтобы до него
 * дотягивался большой палец. С 1024px действие стоит в шапке экрана.
 *
 * Отступ 20px снизу — под выступ кнопки «+» нижней панели (ADR-026, п. 4): без него круг
 * перекрывал полосу, и нажатие по «+» попадало в кнопку экрана.
 */
export function MobileActionBar({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="h-[84px] lg:hidden" aria-hidden />
      <div className="fixed inset-x-0 bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom)+20px)] z-30 flex gap-2 border-t border-line bg-base px-4 py-2 lg:hidden [&>*]:min-h-11 [&>*]:flex-1">
        {children}
      </div>
    </>
  );
}
