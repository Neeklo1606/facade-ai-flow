import { toast } from "sonner";

/** Undo вместо подтверждений: действие выполняется сразу, откат живёт 6 секунд. */
export function toastUndo(message: string, onUndo: () => void, description?: string) {
  toast(message, {
    description,
    duration: 6000,
    action: { label: "Отменить", onClick: onUndo },
  });
}

/** Оптимистичное действие не прошло — даём «Повторить». */
export function toastRetry(message: string, onRetry: () => void) {
  toast.error(message, {
    duration: 8000,
    action: { label: "Повторить", onClick: onRetry },
  });
}

export { toast };
