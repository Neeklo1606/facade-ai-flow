/**
 * Полоса «Нет связи» (ADR-045, 4.17): отдельный маленький модуль, потому что оболочка
 * держит её в первом куске бандла. Имитация в демо помечена.
 */
import { WifiOff } from "lucide-react";

/** Полоса 32 под шапкой: изменения сохранятся и отправятся позже. В демо помечена имитацией */
export function OfflineBar({ demo = false }: { demo?: boolean }) {
  return (
    <div
      role="status"
      className="flex h-8 items-center gap-2 bg-warn-bg px-gutter text-meta text-warn"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden />
      <span className="truncate">Нет связи. Изменения сохранятся и отправятся позже</span>
      {demo ? <span className="ms-auto shrink-0 text-text-3">имитация</span> : null}
    </div>
  );
}
