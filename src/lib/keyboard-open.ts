import { useEffect, useState } from "react";

/**
 * Открыта ли экранная клавиатура (ADR-026, п. 10). Признак — фокус в поле ввода: на iOS Safari
 * фиксированный элемент остаётся у нижнего края разметки, а не видимой области, и клавиатура
 * его перекрывает. Панель на это время убирается, а место под неё остаётся занятым — иначе
 * содержимое прыгало бы при каждом касании поля.
 */
const TYPING = new Set(["INPUT", "TEXTAREA"]);

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (!TYPING.has(target.tagName)) return false;
  // Чекбокс и переключатель клавиатуру не вызывают
  const type = (target as HTMLInputElement).type;
  return !["checkbox", "radio", "range", "button", "submit", "file", "color"].includes(type);
}

export function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const focusIn = (event: FocusEvent) => setOpen(isTyping(event.target));
    const focusOut = () => setOpen(false);
    document.addEventListener("focusin", focusIn);
    document.addEventListener("focusout", focusOut);
    return () => {
      document.removeEventListener("focusin", focusIn);
      document.removeEventListener("focusout", focusOut);
    };
  }, []);
  return open;
}
