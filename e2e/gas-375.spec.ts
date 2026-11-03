import { expect, open, test } from "./fixtures";
import { gasRole } from "./gas-helpers";

/**
 * 375 px — самый узкий телефон, под который сдаём (CLAUDE.md, правило 5; финальный промт,
 * проверка волны 2): экраны сценария дня каждой роли без прокрутки страницы вбок, области
 * нажатия видимых кнопок от 44 px.
 */
const SCREENS: { role: string; paths: string[] }[] = [
  { role: "Бригадир", paths: ["/gas/brigade", "/gas/foreman", "/gas/entries"] },
  {
    role: "Менеджер",
    paths: [
      "/gas/moderation",
      "/gas/tabel",
      "/gas/week",
      "/gas/directory",
      "/gas/estimates",
      "/gas/brigades",
      "/gas/employees",
      "/gas/objects",
      "/gas/entries",
      "/gas/more",
    ],
  },
  { role: "Руководитель", paths: ["/gas/week", "/gas/tabel", "/gas/more"] },
];

test.describe("375 без прокрутки вбок", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });
  test.describe.configure({ timeout: 120_000 });

  for (const { role, paths } of SCREENS) {
    test(`${role}: экраны дня`, async ({ page }) => {
      await open(page, "/gas");
      await gasRole(page, role);
      for (const path of paths) {
        await open(page, path);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `прокрутка вбок на ${path}`).toBeLessThanOrEqual(0);
        const small = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>("main button, main a[href]")]
            .filter((el) => {
              const box = el.getBoundingClientRect();
              const style = getComputedStyle(el);
              return box.width > 0 && box.height > 0 && style.visibility !== "hidden";
            })
            .filter((el) => {
              const box = el.getBoundingClientRect();
              // Ссылки внутри строки текста — не области нажатия
              if (el.tagName === "A" && getComputedStyle(el).display === "inline") return false;
              // `touch-target` расширяет область нажатия невидимым ::before до 44 px
              const before = getComputedStyle(el, "::before");
              const hitW = Math.max(box.width, parseFloat(before.width) || 0);
              const hitH = Math.max(box.height, parseFloat(before.height) || 0);
              return Math.min(hitW, hitH) < 44;
            })
            .map(
              (el) =>
                `${el.tagName} «${(el.textContent ?? el.getAttribute("aria-label") ?? "").trim().slice(0, 30)}» ${Math.round(el.getBoundingClientRect().width)}×${Math.round(el.getBoundingClientRect().height)}`,
            ),
        );
        expect(small, `области нажатия меньше 44 px на ${path}`).toEqual([]);
      }
    });
  }
});
