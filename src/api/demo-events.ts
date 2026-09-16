import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { api } from "./client";

type Notice = { title: string; description: string };

/**
 * Демо: события симулятора (ответ поставщика, стадия распознавания, заказ) меняют данные без действия
 * пользователя. Обновляем только затронутые области кеша и показываем заметные события.
 * Подписка — после монтирования: уведомление до появления Toaster вызывало бы обновление
 * немонтированного компонента; события, случившиеся раньше, адаптер отдаёт при подписке.
 */
export function useDemoEvents(queryClient: QueryClient, onNotice: (notice: Notice) => void) {
  useEffect(
    () =>
      api.demo.onEvent(({ areas, notice }) => {
        areas.forEach((area) => void queryClient.invalidateQueries({ queryKey: [area] }));
        if (notice) onNotice(notice);
      }),
    // onNotice — стрелка из корня приложения; переподписка на каждый рендер не нужна
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient],
  );
}
