import { AlertTriangle, Check, CloudOff, RefreshCw, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Где сейчас запись (дизайн-система, раздел 9). «Сохранено» ставится только после ответа
 * сервера: правило продукта запрещает обещать сохранение раньше, чем оно случилось.
 */
export type SyncState = "local" | "queued" | "sending" | "saved" | "conflict";

const view: Record<SyncState, { label: string; icon: typeof Check; tone: string }> = {
  local: { label: "Не отправлено", icon: CloudOff, tone: "text-text-3" },
  queued: { label: "В очереди", icon: RefreshCw, tone: "text-text-2" },
  sending: { label: "Отправляется", icon: UploadCloud, tone: "text-sand" },
  saved: { label: "Сохранено", icon: Check, tone: "text-ok" },
  conflict: { label: "Расхождение", icon: AlertTriangle, tone: "text-risk" },
};

export function SyncIndicator({ state, className }: { state: SyncState; className?: string }) {
  const { label, icon: Icon, tone } = view[state];
  return (
    <span
      role="status"
      className={cn("text-caption inline-flex items-center gap-1.5", tone, className)}
    >
      <Icon className={cn("size-4", state === "sending" && "animate-spin")} />
      {label}
    </span>
  );
}
