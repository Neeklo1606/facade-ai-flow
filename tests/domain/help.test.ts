import { describe, expect, test } from "bun:test";
import { articleForScreen, helpArticles, searchHelp, sortForRole } from "@/lib/help/articles";
import { screenFor } from "@/lib/guide/screens";
import { rolesWith, sectionOfPath } from "@/domain/access";
import { createDemoRepositories } from "@/adapters/demo";

/**
 * Справка (ADR-019). Проверяется то, что молча разойдётся с продуктом: адреса шагов, связь
 * экрана со статьёй и полнота самой статьи — цель, шаги, что проверить, куда дальше.
 */

describe("статьи справки", () => {
  test("у каждой статьи есть цель, шаги, проверка и следующий шаг", () => {
    for (const article of helpArticles) {
      expect(article.goal.length, article.title).toBeGreaterThan(20);
      expect(article.steps.length, article.title).toBeGreaterThanOrEqual(3);
      expect(article.check.length, article.title).toBeGreaterThan(20);
      expect(article.next.length, article.title).toBeGreaterThan(20);
      expect(article.roles.length, article.title).toBeGreaterThan(0);
    }
  });

  test("адрес шага ведёт на существующий экран, а не в «Раздел не найден»", () => {
    const targets = helpArticles.flatMap((article) =>
      article.steps.flatMap((step) => (step.to ? [{ article: article.title, to: step.to }] : [])),
    );
    // Шаги с переходами есть: иначе проверка молчала бы
    expect(targets.length).toBeGreaterThan(5);
    for (const target of targets) {
      const [path = "/", search = ""] = target.to.split("?");
      expect(screenFor(path, search).key, `${target.article}: ${target.to}`).not.toBe("not-found");
    }
  });

  test("объект из адреса шага есть в данных, а не только в форме адреса", async () => {
    // screenFor разбирает адрес по форме и не знает, существует ли объект: с несуществующим
    // ключом проверка выше оставалась зелёной (находка независимой проверки)
    const repos = createDemoRepositories({ persist: false });
    const projects = await repos.projects.list();
    const known = new Set(projects.map((item) => item.project.id));
    const used = new Set(
      helpArticles.flatMap((article) =>
        article.steps.flatMap((step) => {
          const id = step.to?.match(/^\/projects\/([^/?]+)/u)?.[1];
          return id ? [id] : [];
        }),
      ),
    );
    expect(used.size).toBeGreaterThan(0);
    for (const id of used) expect(known.has(id), `объекта ${id} нет в данных`).toBe(true);
  });

  test("шаг ведёт в раздел, у которого есть роль с доступом", () => {
    // Иначе ссылку не увидит никто, и шаг молча превращается в мёртвый текст
    for (const article of helpArticles) {
      for (const step of article.steps) {
        if (!step.to) continue;
        const url = new URL(step.to, "http://local");
        const section = sectionOfPath(url.pathname, url.searchParams.get("view") ?? undefined);
        if (!section) continue;
        expect(rolesWith(section).length, `${article.title}: ${step.to}`).toBeGreaterThan(0);
      }
    }
  });

  test("экран находит свою статью", () => {
    for (const key of ["documents", "deliveries", "field-reports", "materials", "access"]) {
      expect(articleForScreen(key), key).not.toBeNull();
    }
    // Экран без своей статьи не получает чужую
    expect(articleForScreen("demo-stats")).toBeNull();
  });

  test("идентификаторы статей не повторяются: по ним открывается ссылка", () => {
    const ids = helpArticles.map((article) => article.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("поиск по справке", () => {
  test("находит по слову из шага и по ключевому слову, которого нет в тексте", () => {
    expect(searchHelp("приёмка").map((a) => a.id)).toContain("delivery");
    expect(searchHelp("1С").map((a) => a.id)).toContain("faq");
    expect(searchHelp("телеграм").map((a) => a.id)).toContain("field-reports");
  });

  test("пустой запрос отдаёт все статьи, бессмысленный — ни одной", () => {
    expect(searchHelp("  ")).toHaveLength(helpArticles.length);
    expect(searchHelp("квазар")).toHaveLength(0);
  });
});

describe("порядок статей", () => {
  test("статьи роли идут первыми, но остальные не пропадают", () => {
    const sorted = sortForRole(helpArticles, "foreman");
    expect(sorted).toHaveLength(helpArticles.length);
    expect(sorted[0]?.roles).toContain("foreman");
    expect(sorted.some((article) => !article.roles.includes("foreman"))).toBe(true);
  });
});
