import { dataSource } from "@/api/config";

/**
 * Тема оформления (ADR-017). Выбор пользователя из трёх положений, применённая тема — из двух.
 *
 * Тема ставится атрибутом `data-theme` на `<html>` и применяется до первой отрисовки скриптом
 * из `themeBootScript`: иначе светлая мигала бы тёмной на каждой загрузке. Значения по умолчанию
 * зависят от контура: демонстрацию показывают в переговорной, рабочий режим живёт у человека
 * на столе весь день.
 */

export type ThemeChoice = "light" | "dark" | "system";
export type Theme = "light" | "dark";

export const THEME_KEY = "neeklo-fieldops-theme";

export const themeChoices: readonly ThemeChoice[] = ["light", "dark", "system"] as const;

export const themeLabels: Record<ThemeChoice, string> = {
  light: "Светлая",
  dark: "Тёмная",
  system: "Как в системе",
};

/** Умолчание контура: демонстрация — тёмная, рабочий режим — как в системе (ADR-017, п. 6) */
export const defaultChoice: ThemeChoice = dataSource === "server" ? "system" : "dark";

const isChoice = (value: string | null): value is ThemeChoice =>
  value === "light" || value === "dark" || value === "system";

/** Выбор пользователя из браузера; приватный режим и запрет хранилища дают умолчание */
export function readChoice(): ThemeChoice {
  if (typeof window === "undefined") return defaultChoice;
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    return isChoice(saved) ? saved : defaultChoice;
  } catch {
    return defaultChoice;
  }
}

export function writeChoice(choice: ThemeChoice) {
  try {
    window.localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Приватный режим: выбор проживёт до перезагрузки
  }
}

export function systemTheme(): Theme {
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export const resolveTheme = (choice: ThemeChoice): Theme =>
  choice === "system" ? systemTheme() : choice;

/** Применить тему к документу: цвета берутся из `data-theme`, `color-scheme` красит формы и полосы */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset["theme"] = theme;
  root.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "light" ? "#f4f2ee" : "#000000");
}

/**
 * Тот же выбор, но до загрузки приложения: строка выполняется в `<head>`.
 * Логика повторена вручную, поэтому держится короткой и проверяется тестом
 * `tests/domain/theme.test.ts` — он сверяет её с функциями выше.
 */
export function themeBootScript(): string {
  return (
    `(function(){try{var c=localStorage.getItem(${JSON.stringify(THEME_KEY)});` +
    `if(c!=="light"&&c!=="dark"&&c!=="system")c=${JSON.stringify(defaultChoice)};` +
    `var t=c==="system"?(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):c;` +
    `document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;}` +
    `catch(e){document.documentElement.dataset.theme=${JSON.stringify(defaultChoice === "system" ? "dark" : defaultChoice)};}})()`
  );
}
