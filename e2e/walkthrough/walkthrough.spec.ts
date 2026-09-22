import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type BrowserContext, type Page } from "@playwright/test";
import {
  INTERACTIVE,
  MAX_INNER,
  MAX_PER_SCREEN,
  OUT,
  SCREEN_BUDGET_MS,
  ROLES,
  THEME,
  asPersona,
  discover,
  load,
  type RoleReport,
} from "./helpers";

/**
 * Обход продукта (Q8): за каждую роль — все экраны, до которых можно дойти по ссылкам,
 * и каждый интерактивный элемент на них, включая элементы открывшихся диалогов.
 * Отчёт — JSON в WALK_OUT: что нажато, что произошло, где ничего не произошло.
 *
 * Не входит в конвейер: полный обход идёт десятки минут. Запуск — `bun run walkthrough`.
 */

/**
 * Пометить элементы и вернуть их подписи. Повторяющиеся строки списков и таблиц дают одну
 * подпись: «строка › кнопка №2», а не сотню одинаковых кнопок
 */
async function catalog(page: Page, scope: string | null) {
  return page.evaluate(
    ({ selector, scope }) => {
      const root = scope ? document.querySelector(scope) : document.body;
      if (!root) return [];
      const visible = (el: Element) => {
        const rect = el.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
        );
      };
      const clean = (text: string) =>
        text
          .replace(/\s+/g, " ")
          .replace(/\d+([.,]\d+)?/g, "#")
          .trim()
          .slice(0, 70);
      const rowOf = (el: Element) =>
        el.closest(
          "tr, li, [role=row], [role=listitem], [role=option], [data-position-id], article",
        );
      // Уже выбранное: текущий раздел, выбранная вкладка, нажатый переключатель, ссылка на этот же адрес
      const selectedNow = (el: Element) => {
        const attr = (name: string) => el.getAttribute(name);
        if (["page", "true", "step"].includes(attr("aria-current") ?? "")) return true;
        if (
          attr("aria-selected") === "true" ||
          attr("aria-pressed") === "true" ||
          attr("aria-checked") === "true"
        ) {
          return true;
        }
        if (["active", "on", "checked"].includes(attr("data-state") ?? "")) return true;
        const href = attr("href");
        if (href && el.tagName === "A") {
          const target = new URL(href, location.href);
          return target.pathname + target.search === location.pathname + location.search;
        }
        return false;
      };
      const result: {
        signature: string;
        label: string;
        index: number;
        selected: boolean;
        disabled: string | null;
      }[] = [];
      // Отключённый элемент: не нажимается, но должен объяснять причину рядом или в подписи
      const disabledReason = (el: Element) => {
        const off =
          (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true";
        if (!off) return null;
        const described = el.getAttribute("aria-describedby");
        const text = described ? document.getElementById(described)?.textContent : null;
        return (text ?? el.getAttribute("title") ?? "без объяснения").trim().slice(0, 100);
      };
      const seen = new Set<string>();
      const all = [...root.querySelectorAll(selector)];
      all.forEach((el, index) => {
        if (!visible(el)) return;
        if (el.closest("[inert], [aria-hidden='true']")) return;
        const role = el.getAttribute("role") ?? el.tagName.toLowerCase();
        const label = (
          el.getAttribute("aria-label") ??
          el.textContent ??
          el.getAttribute("title") ??
          ""
        )
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 80);
        const zone = el.closest("[role=dialog]")
          ? "диалог"
          : el.closest("nav, aside, [data-sidebar]")
            ? "меню"
            : el.closest("header")
              ? "шапка"
              : "экран";
        const row = rowOf(el);
        let signature: string;
        if (row && row !== el && row.parentElement && row.parentElement.children.length > 2) {
          const inRow = [...row.querySelectorAll(selector)].indexOf(el);
          signature = `${zone}|строка ${row.tagName.toLowerCase()}|${role}#${inRow}`;
        } else if (row === el && el.parentElement && el.parentElement.children.length > 2) {
          signature = `${zone}|строка ${role}`;
        } else {
          signature = `${zone}|${role}|${clean(label)}`;
        }
        if (seen.has(signature)) return;
        seen.add(signature);
        result.push({
          signature,
          label,
          index,
          selected: selectedNow(el),
          disabled: disabledReason(el),
        });
      });
      return result;
    },
    { selector: INTERACTIVE, scope },
  );
}

/** Найти элемент с подписью заново — после перезагрузки порядок мог сдвинуться */
async function locate(page: Page, signature: string, scope: string | null) {
  const items = await catalog(page, scope);
  const item = items.find((entry) => entry.signature === signature);
  if (!item) return null;
  const root = scope ? page.locator(scope).first() : page.locator("body");
  return root.locator(INTERACTIVE).nth(item.index);
}

interface Snapshot {
  url: string;
  dialogs: number;
  toasts: number;
}

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const w = window as unknown as { __walk?: { mutations: number; observer: MutationObserver } };
    w.__walk?.observer.disconnect();
    const state = { mutations: 0, observer: new MutationObserver(() => undefined) };
    state.observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes" && record.attributeName === "class") continue;
        state.mutations += 1;
      }
    });
    state.observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        "aria-expanded",
        "aria-pressed",
        "aria-selected",
        "aria-checked",
        "aria-current",
        "data-state",
        "open",
        "hidden",
        "value",
      ],
    });
    w.__walk = state;
    // Прокрутка — тоже действие: «к следующему на проверке», «показать на листе»
    const scrollers = [...document.querySelectorAll("*")].filter(
      (el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1,
    );
    (window as unknown as { __walkScroll?: [Element, number, number][] }).__walkScroll = [
      [document.scrollingElement ?? document.documentElement, scrollX, scrollY],
      ...scrollers.map((el) => [el, el.scrollLeft, el.scrollTop] as [Element, number, number]),
    ];
    return {
      url: location.href,
      dialogs: document.querySelectorAll("[role=dialog], [role=alertdialog]").length,
      toasts: document.querySelectorAll("[data-sonner-toast]").length,
    };
  });
}

/** Что изменилось после нажатия */
async function effectOf(
  page: Page,
  before: Snapshot,
  extra: { download: boolean; popup: boolean; fileChooser: boolean },
) {
  const after = await page.evaluate(() => {
    const w = window as unknown as { __walk?: { mutations: number } };
    const active = document.activeElement;
    return {
      url: location.href,
      dialogs: document.querySelectorAll("[role=dialog], [role=alertdialog]").length,
      toasts: document.querySelectorAll("[data-sonner-toast]").length,
      mutations: w.__walk?.mutations ?? -1,
      scrolled: (
        (window as unknown as { __walkScroll?: [Element, number, number][] }).__walkScroll ?? []
      ).some(([el, left, top], index) =>
        index === 0
          ? Math.abs(scrollX - left) > 2 || Math.abs(scrollY - top) > 2
          : Math.abs(el.scrollLeft - left) > 2 || Math.abs(el.scrollTop - top) > 2,
      ),
      typing:
        !!active &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.tagName === "SELECT"),
      notFound:
        !!document.querySelector("[data-screen='not-found']") ||
        /Раздел не найден/.test(document.body.innerText),
      // Отказ — такой же тупик: человек нажал ссылку и попал в стену (ADR-015, дополнение S4)
      noAccess: !!document.querySelector("[data-screen='no-access']"),
    };
  });
  const effect: string[] = [];
  if (after.url !== before.url) {
    effect.push(
      after.notFound
        ? "переход: РАЗДЕЛ НЕ НАЙДЕН"
        : after.noAccess
          ? "переход: НЕТ ДОСТУПА"
          : "переход",
    );
  }
  if (after.dialogs > before.dialogs) effect.push("диалог");
  if (after.dialogs < before.dialogs) effect.push("закрыл диалог");
  if (after.toasts > before.toasts) effect.push("уведомление");
  if (extra.download) effect.push("файл");
  if (extra.popup) effect.push("новая вкладка");
  if (extra.fileChooser) effect.push("выбор файла");
  if (after.typing) effect.push("поле ввода");
  // Мутации без перехода — изменение на экране: раскрытие, фильтр, выбор
  if (!effect.length && after.mutations > 0) effect.push("изменение экрана");
  if (!effect.length && after.scrolled) effect.push("прокрутка");
  // Переход по той же странице: адрес меняется частично (параметры) — тоже изменение
  return { effect, url: after.url };
}

async function press(page: Page, context: BrowserContext, locator: ReturnType<Page["locator"]>) {
  const flags = { download: false, popup: false, fileChooser: false };
  const onDownload = () => (flags.download = true);
  const onPage = () => (flags.popup = true);
  const onChooser = () => (flags.fileChooser = true);
  page.on("download", onDownload);
  page.on("filechooser", onChooser);
  context.on("page", onPage);
  let note: string | undefined;
  const href = await locator.getAttribute("href").catch(() => null);
  if (href && /^(tel|mailto):/.test(href)) {
    page.off("download", onDownload);
    page.off("filechooser", onChooser);
    context.off("page", onPage);
    return { flags, note: `внешняя ссылка ${href.split(":")[0]}`, external: true };
  }
  try {
    await locator.click({ timeout: 3_000 });
  } catch (error) {
    const message = String(error);
    const covered = /intercepts pointer events/.exec(message)
      ? message.match(/<([a-z]+)[^>]*>/)?.[0]
      : null;
    note = covered
      ? `перекрыт: ${covered.slice(0, 80)}`
      : `не нажимается: ${message.split("\n")[0]?.slice(0, 100)}`;
    // Проверяем действие: нажатие из кода доходит до обработчика
    await locator.evaluate((el) => (el as HTMLElement).click()).catch(() => undefined);
  }
  await page.waitForTimeout(700);
  page.off("download", onDownload);
  page.off("filechooser", onChooser);
  context.off("page", onPage);
  return { flags, note, external: false };
}

async function closePopups(context: BrowserContext, keep: Page) {
  for (const other of context.pages()) if (other !== keep) await other.close();
}

test.describe.configure({ mode: "parallel" });

for (const [persona, role] of Object.entries(ROLES)) {
  test(`обход: ${role}, тема ${THEME}`, async ({ browser }) => {
    test.setTimeout(3 * 60 * 60 * 1000);
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: "ru-RU",
      timezoneId: "Europe/Moscow",
    });
    await asPersona(context, persona);
    const page = await context.newPage();
    const report: RoleReport = {
      role,
      persona,
      theme: THEME,
      pages: await discover(page),
      elements: [],
    };

    const save = () => {
      mkdirSync(OUT, { recursive: true });
      writeFileSync(join(OUT, `walk-${THEME}-${persona}.json`), JSON.stringify(report, null, 2));
    };
    for (const screen of report.pages) {
      save();
      await load(page, screen.url);
      const items = await catalog(page, null);
      /*
       * Границы обхода одного экрана. Реестр материалов даёт сотни однотипных строк, и у каждой
       * своя панель: без границы обход упирался в предел теста и не доходил до следующих экранов.
       * Сколько пропущено — записывается, чтобы отчёт не выдавал неполный обход за полный.
       */
      const deadline = Date.now() + SCREEN_BUDGET_MS;
      let pressedHere = 0;
      let skipped = 0;
      for (const item of items) {
        if (pressedHere >= MAX_PER_SCREEN || Date.now() > deadline) {
          skipped = items.length - pressedHere;
          break;
        }
        pressedHere += 1;
        // Прогресс не теряется, если тест упрётся в предел: сохраняем по ходу, а не только в конце
        if (pressedHere % 25 === 0) save();
        await load(page, screen.url);
        const target = await locate(page, item.signature, null);
        if (!target) continue;
        if (item.disabled) {
          report.elements.push({
            page: screen.pattern,
            signature: item.signature,
            label: item.label,
            effect: ["недоступна"],
            note: item.disabled,
          });
          continue;
        }
        const before = await snapshot(page);
        const pressed = await press(page, context, target);
        if (pressed.external) {
          report.elements.push({
            page: screen.pattern,
            signature: item.signature,
            label: item.label,
            effect: ["внешняя ссылка"],
            note: pressed.note,
          });
          continue;
        }
        let { effect } = await effectOf(page, before, pressed.flags);
        if (!effect.length && item.selected) effect.push("уже выбрано");
        // Действие могло быть уже выполнено: «показать на листе» для позиции на экране. Сбросить
        // прокрутку всех областей и нажать снова — если вид вернулся, это прокрутка, а не пустая кнопка
        if (!effect.length) {
          await page.evaluate(() => {
            window.scrollTo(0, 0);
            for (const el of document.querySelectorAll("*")) {
              if (el.scrollHeight > el.clientHeight + 1) el.scrollTop = 0;
            }
          });
          await page.waitForTimeout(200);
          const again = await snapshot(page);
          const retry = await press(page, context, target);
          const second = await effectOf(page, again, retry.flags);
          if (second.effect.includes("прокрутка")) effect = ["прокрутка (вид был уже нужный)"];
        }
        await closePopups(context, page);
        report.elements.push({
          page: screen.pattern,
          signature: item.signature,
          label: item.label,
          effect,
          ...(pressed.note ? { note: pressed.note } : {}),
        });

        // Диалог открылся — нажать и его элементы: открыть заново, нажать внутренний
        if (effect.includes("диалог")) {
          const scope = "[role=dialog], [role=alertdialog]";
          const inner = (await catalog(page, scope)).slice(0, MAX_INNER);
          for (const child of inner) {
            await load(page, screen.url);
            const opener = await locate(page, item.signature, null);
            if (!opener) break;
            await press(page, context, opener);
            const innerTarget = await locate(page, child.signature, scope);
            if (!innerTarget) continue;
            if (child.disabled) {
              report.elements.push({
                page: `${screen.pattern} › ${item.label.slice(0, 40)}`,
                signature: child.signature,
                label: child.label,
                effect: ["недоступна"],
                note: child.disabled,
              });
              continue;
            }
            const innerBefore = await snapshot(page);
            const innerPressed = await press(page, context, innerTarget);
            const innerEffect = innerPressed.external
              ? { effect: ["внешняя ссылка"] }
              : await effectOf(page, innerBefore, innerPressed.flags);
            if (!innerEffect.effect.length && child.selected)
              innerEffect.effect.push("уже выбрано");
            await closePopups(context, page);
            report.elements.push({
              page: `${screen.pattern} › ${item.label.slice(0, 40)}`,
              signature: child.signature,
              label: child.label,
              effect: innerEffect.effect,
              ...(innerPressed.note ? { note: innerPressed.note } : {}),
            });
          }
        }
      }
      if (skipped > 0) {
        report.elements.push({
          page: screen.pattern,
          signature: "__budget__",
          label: `не обойдено: ещё ${skipped} однотипных элементов`,
          effect: ["предел обхода"],
          note: `нажато ${pressedHere} из ${items.length}; предел — ${MAX_PER_SCREEN} элементов или ${Math.round(SCREEN_BUDGET_MS / 60000)} мин на экран`,
        });
      }
    }

    save();
    await context.close();
  });
}
