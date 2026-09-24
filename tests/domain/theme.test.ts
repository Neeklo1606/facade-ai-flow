import { describe, expect, test } from "bun:test";
import { THEME_KEY, defaultChoice, resolveTheme, themeBootScript } from "@/lib/theme";

/**
 * Скрипт темы в `<head>` повторяет логику модуля вручную: он выполняется до загрузки
 * приложения. Значит, его надо сверять с модулем, иначе однажды они разойдутся и светлая тема
 * будет мигать тёмной (ADR-017, п. 7).
 */

/** Выполнить скрипт с подставленным браузером и вернуть, какую тему он поставил */
function runBoot({ saved, systemLight }: { saved?: string | null; systemLight: boolean }) {
  const store = new Map<string, string>();
  if (saved != null) store.set(THEME_KEY, saved);
  const root = { dataset: {} as Record<string, string>, style: {} as Record<string, string> };
  const scope = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    },
    matchMedia: (query: string) => ({ matches: systemLight && query.includes("light") }),
    document: { documentElement: root },
  };
  const run = new Function("localStorage", "matchMedia", "document", themeBootScript()) as (
    ...args: unknown[]
  ) => void;
  run(scope.localStorage, scope.matchMedia, scope.document);
  return root;
}

describe("тема до первой отрисовки", () => {
  test("без выбора берётся умолчание контура", () => {
    const root = runBoot({ systemLight: false });
    expect(root.dataset["theme"]).toBe(resolveTheme(defaultChoice));
  });

  test("сохранённый выбор главнее умолчания", () => {
    expect(runBoot({ saved: "light", systemLight: false }).dataset["theme"]).toBe("light");
    expect(runBoot({ saved: "dark", systemLight: true }).dataset["theme"]).toBe("dark");
  });

  test("«как в системе» читает настройку системы", () => {
    expect(runBoot({ saved: "system", systemLight: true }).dataset["theme"]).toBe("light");
    expect(runBoot({ saved: "system", systemLight: false }).dataset["theme"]).toBe("dark");
  });

  test("мусор в хранилище не ломает страницу", () => {
    const root = runBoot({ saved: "полосатая", systemLight: false });
    expect(root.dataset["theme"]).toBe(resolveTheme(defaultChoice));
  });

  test("color-scheme ставится вместе с темой: формы и полосы прокрутки красит он", () => {
    const root = runBoot({ saved: "light", systemLight: false });
    expect(root.style["colorScheme"]).toBe("light");
  });
});
