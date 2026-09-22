import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  ALTERNATIVES,
  allSources,
  isVerified,
  PARAMETERS,
  POSITIONING,
  UNVERIFIED,
  type Claim,
} from "@/lib/help/alternatives";
import { helpArticles } from "@/lib/help/articles";

/**
 * Сравнение с альтернативами (ADR-020). Проверяется ровно то, что нельзя заметить глазами
 * на встрече: утверждение без источника и без пометки «не проверено», цена конкурента,
 * расхождение статьи справки с документом показа.
 */

const ROOT = new URL("../..", import.meta.url).pathname;
const salesDemo = readFileSync(`${ROOT}docs/SALES_DEMO.md`, "utf8");

const claims = (): { where: string; claim: Claim }[] =>
  ALTERNATIVES.flatMap((alternative) =>
    PARAMETERS.map((parameter) => ({
      where: `${alternative.name} / ${parameter.title}`,
      claim: alternative.claims[parameter.id],
    })),
  );

describe("утверждение о чужой системе", () => {
  test("либо имеет источник, либо помечено «не проверено» — третьего нет", () => {
    const unsupported = claims()
      .filter(({ claim }) => !isVerified(claim) && !claim.text.toLowerCase().includes(UNVERIFIED))
      .map(({ where }) => where);
    expect(unsupported).toEqual([]);
  });

  test("проверка ловит утверждение без источника и без пометки", () => {
    const invented: Claim = { text: "В этой системе нет закупок." };
    expect(isVerified(invented) || invented.text.toLowerCase().includes(UNVERIFIED)).toBe(false);
  });

  test("утверждение об отсутствии называет страницу, на которой смотрели", () => {
    /*
     * «На сайте не заявлено» проверяется за минуту, только если сказано, на каком сайте.
     * Дважды подряд проверка ловила обратное: строки утверждали, что срок внедрения
     * не указан, а он был указан на той самой странице, которая стояла источником.
     */
    const absence = /не заявлен|не указан|не описан|не называет/iu;
    const unsourced = claims()
      .filter(({ claim }) => absence.test(claim.text) && !isVerified(claim))
      .map(({ where }) => where);
    expect(unsourced).toEqual([]);
  });

  test("у каждого источника адрес и дата обращения: по ней видно, когда перепроверять", () => {
    for (const source of allSources()) {
      expect(source.url, source.title).toMatch(/^https:\/\//u);
      expect(source.seen, source.title).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
      expect(source.title.length).toBeGreaterThan(5);
    }
    expect(allSources().length).toBeGreaterThanOrEqual(4);
  });

  test("цен конкурентов нет: они меняются и оспариваются на встрече", () => {
    const price = /\bцена|\bцены|стоимост|руб\.|₽|тариф|подписк/iu;
    const texts = [
      ...claims().map(({ claim }) => claim.text),
      ...ALTERNATIVES.map((alternative) => alternative.what),
      ...PARAMETERS.map((parameter) => parameter.us),
      POSITIONING,
    ];
    expect(texts.filter((text) => price.test(text))).toEqual([]);
  });

  test("сравниваются те пять параметров, о которых договорились", () => {
    expect(PARAMETERS.map((parameter) => parameter.id)).toEqual([
      "start",
      "audience",
      "field",
      "trace",
      "rollout",
    ]);
    expect(ALTERNATIVES.map((alternative) => alternative.id)).toEqual([
      "exon",
      "builddocs",
      "tsus",
      "uso",
    ]);
  });
});

describe("справка и документ показа не расходятся", () => {
  test("статья справки существует и показывает таблицу", () => {
    const article = helpArticles.find((item) => item.id === "alternatives");
    expect(article?.compare).toBe(true);
    expect(article?.next).toContain("Показ");
  });

  test("в документе показа названы все системы и все источники с адресами", () => {
    for (const alternative of ALTERNATIVES) {
      const name = alternative.name.split(" ")[0] ?? alternative.name;
      expect(salesDemo, alternative.name).toContain(name);
    }
    for (const source of allSources()) {
      expect(salesDemo, source.url).toContain(source.url);
    }
  });

  test("в документе показа сказано, что цены не сравниваем и где написано «не проверено»", () => {
    expect(salesDemo).toContain(UNVERIFIED);
    expect(salesDemo.toLowerCase()).toContain("цены не сравниваем");
  });
});
