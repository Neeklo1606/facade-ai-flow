import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Действия экрана в шапке контента: заголовок и действия в одной строке 72px.
 * Страница объявляет действия у себя, а рисуются они в слоте шапки.
 */
export function PageActions({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  // Слот появляется в DOM вместе с шапкой; на сервере его нет — действия дорисуются после гидратации
  useEffect(() => setSlot(document.getElementById("page-actions")), []);
  return slot ? createPortal(children, slot) : null;
}

/** Подпись под заголовком в шапке контента вместо пути: код объекта, статус, ревизия */
export function PageCaption({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById("page-caption")), []);
  return slot ? createPortal(children, slot) : null;
}
