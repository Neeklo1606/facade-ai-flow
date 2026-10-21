/**
 * Тосты ADR-045, раздел 4.5: внизу над нижним слоем, ширина экрана минус 32, высота от 48,
 * один за раз (новый заменяет старый). Текст text-body, справа «Отменить» акцентом.
 * 6 секунд с отменой, 4 для уведомления. Свайп вниз закрывает, role="status" для читалок.
 */
import { toast as sonner } from "sonner";
import { createToastQueue } from "@/lib/ui/kit-logic";

const queue = createToastQueue({
  show: (id, text, { duration, undo }) => {
    sonner(text, {
      id,
      duration,
      ...(undo ? { action: { label: "Отменить", onClick: undo } } : {}),
    });
  },
  dismiss: (id) => sonner.dismiss(id),
});

/** Показать тост: `notify("Подтверждено 4 записи на 58 800 ₽", { undo })` */
export function notify(text: string, options: { undo?: () => void } = {}) {
  return queue.notify(text, options);
}
