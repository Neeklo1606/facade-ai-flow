import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * Неожиданный отказ обязан быть виден человеку (аудит перед выпуском). Отказ по существу
 * объясняет место вызова, а сбой сервера, неверный запрос и обрыв связи — общий обработчик:
 * до правки кнопка молча не срабатывала, и человек не знал, что делать.
 *
 * Тест держит вместе две стороны: тексты, которые задаёт `src/api/errors.ts`, и шаблоны,
 * по которым их узнаёт `src/router.tsx`. Разъедутся — сообщение пропадёт, и никто не заметит.
 */
const errors = readFileSync("src/api/errors.ts", "utf8");
const router = readFileSync("src/router.tsx", "utf8");

/** Шаблоны из router.tsx, по которым отказ считается неожиданным */
function patterns(): RegExp[] {
  const block = /const UNEXPECTED = \[([\s\S]*?)\];/.exec(router)?.[1] ?? "";
  return [...block.matchAll(/\/(.+?)\/([a-z]*)/g)].map(
    (match) => new RegExp(match[1]!, match[2] || undefined),
  );
}

/** Тексты ответов, которые сервер отдаёт на неожиданные отказы */
function serverTexts(): string[] {
  return [
    ...errors.matchAll(/setResponseStatus\((400|500)\);\s*throw new Error\("([^"]+)"\)/g),
  ].map((match) => match[2]!);
}

describe("сообщение о неожиданном отказе", () => {
  test("шаблоны разобраны, а не потеряны", () => {
    expect(patterns().length).toBeGreaterThanOrEqual(3);
  });

  test("каждый текст сервера узнаётся общим обработчиком", () => {
    const list = patterns();
    const texts = serverTexts();
    expect(texts.length).toBeGreaterThanOrEqual(2);
    for (const text of texts) {
      expect(
        list.some((pattern) => pattern.test(text)),
        `текст «${text}» не подходит ни под один шаблон router.tsx`,
      ).toBe(true);
    }
  });

  test("обрыв связи тоже считается неожиданным", () => {
    const list = patterns();
    for (const text of ["Failed to fetch", "NetworkError when attempting to fetch resource"]) {
      expect(
        list.some((pattern) => pattern.test(text)),
        text,
      ).toBe(true);
    }
  });

  test("отказ по существу общий обработчик не дублирует", () => {
    const list = patterns();
    for (const text of [
      "Сначала разберите позиции «Не удалось определить»: 2. Исправьте или исключите их.",
      "Материал «Кронштейн» с единицей шт уже есть",
      "Нет доступа к разделу",
    ]) {
      expect(
        list.some((pattern) => pattern.test(text)),
        text,
      ).toBe(false);
    }
  });
});
