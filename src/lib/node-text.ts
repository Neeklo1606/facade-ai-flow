import { isValidElement, type ReactNode } from "react";

/**
 * Текст узла React для подсказки `title` у строки, обрезанной многоточием (обход QA 23.11:
 * обрезанный текст без подсказки). Строки и числа как есть, элементы по детям, пустое
 * значение и логические дают пустую строку. Пробелы схлопываются.
 */
export function nodeText(node: ReactNode): string {
  const walk = (value: ReactNode): string => {
    if (value === null || value === undefined || typeof value === "boolean") return "";
    if (typeof value === "string" || typeof value === "number") return String(value);
    if (Array.isArray(value)) return value.map(walk).join("");
    if (isValidElement<{ children?: ReactNode }>(value)) {
      return walk(value.props.children);
    }
    return "";
  };
  return walk(node).replace(/\s+/g, " ").trim();
}

/** `title` только когда текст есть: пустой атрибут не нужен */
export function hintOf(node: ReactNode): string | undefined {
  const text = nodeText(node);
  return text ? text : undefined;
}
