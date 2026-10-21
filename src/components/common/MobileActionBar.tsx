import type { ReactNode } from "react";

/**
 * Действие экрана на телефоне. ADR-045 «Финальный интерфейс», 4.4: над нижней кромкой
 * один фиксированный слой, и у ГАЙКИ это нижняя панель с голосовой кнопкой (главное действие
 * прораба). Поэтому действие экрана больше не плавает над панелью: оно стоит в конце
 * содержимого, на всю ширину, высотой 48. С 1024px действие стоит в шапке экрана.
 */
export function MobileActionBar({ children }: { children: ReactNode }) {
  return (
    <div
      data-mobile-actions
      className="mt-section flex gap-2 lg:hidden [&>*]:min-h-12 [&>*]:flex-1"
    >
      {children}
    </div>
  );
}
