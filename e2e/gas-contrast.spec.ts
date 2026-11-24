import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, open, test } from "./fixtures";
import { gasRole } from "./gas-helpers";

/**
 * Контраст текста на экранах сервиса по ролям (обход QA 23.11: «обходчик не меряет контраст»,
 * просьба владельца 25.11: подписи на светлом фоне читаются тяжело).
 *
 * Вид «Стекло» полупрозрачный, и контраст зависит от сцены под листом, поэтому прогон идёт
 * в обоих режимах прозрачности: обычном и «Уменьшить прозрачность» системы. Только правило
 * color-contrast: остальной axe экранов проверяют screens.spec.ts и a11y-launch.spec.ts.
 */

const SCREENS: Record<string, string[]> = {
  Менеджер: [
    "/gas/moderation",
    "/gas/tabel",
    "/gas/week",
    "/gas/objects",
    "/gas/estimates",
    "/gas/directory",
    "/gas/entries",
    "/gas/admin",
  ],
  Руководитель: ["/gas/overview", "/gas/summary", "/gas/week"],
  Бригадир: ["/gas/brigade"],
};

async function settle(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          animation.playState !== "running" ||
          animation.effect?.getTiming().iterations === Infinity,
      ),
  );
}

async function contrast(page: Page) {
  await settle(page);
  const results = await new AxeBuilder({ page })
    .withRules(["color-contrast"])
    .exclude("[data-sonner-toaster]")
    .analyze();
  return results.violations.flatMap((v) =>
    v.nodes.map((n) => `${n.target.join(" ")}: ${n.any[0]?.message ?? v.id}`),
  );
}

// Обычная прозрачность на компьютере, уменьшенная на телефоне: обе ширины и оба режима сцены
const RUNS = [
  { width: 1440, transparency: "no-preference" },
  { width: 390, transparency: "reduce" },
] as const;

for (const theme of ["light", "dark"] as const) {
  for (const { width, transparency } of RUNS) {
    test(`контраст сервиса ${width} ${theme}, прозрачность ${transparency}`, async ({ page }) => {
      test.skip(test.info().project.name !== "desktop", "один прогон на проект desktop");
      test.setTimeout(180_000);
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await page.addInitScript(
        (mode) => localStorage.setItem("neeklo-fieldops-theme", mode),
        theme,
      );
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-transparency", value: transparency }],
      });

      const found: string[] = [];
      for (const [role, paths] of Object.entries(SCREENS)) {
        await open(page, "/gas");
        await gasRole(page, role);
        for (const path of paths) {
          await open(page, path);
          for (const line of await contrast(page)) found.push(`${role} ${path} ${line}`);
        }
      }
      expect(found, `${width} ${theme} ${transparency}: текст ниже 4,5:1`).toEqual([]);
    });
  }
}
