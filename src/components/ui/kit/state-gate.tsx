/**
 * Состояния экранов-списков вроде «Ещё» (ADR-045, 4.17; шаг L8): загрузка скелетоном и ошибка
 * с «Повторить». Данные таких экранов приходят сразу, поэтому состояния показываются
 * переключателем сборки проверки макетов (VITE_SCREEN_STATES=1, адрес ?state=...).
 * В обычной сборке узел прозрачен.
 */
import type { ReactNode } from "react";
import { useForcedState } from "@/lib/screen-state";
import { ErrorBlock, SkeletonRows } from "./states";

export function ListStateGate({ what, children }: { what: string; children: ReactNode }) {
  const forced = useForcedState();
  if (forced === "loading" || forced === "processing")
    return <SkeletonRows rows={6} label={`Загружаю ${what}`} />;
  if (forced === "error")
    return (
      <ErrorBlock what={`Не удалось загрузить ${what}`} onRetry={() => window.location.reload()} />
    );
  return <>{children}</>;
}
