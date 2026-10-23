/**
 * Стек экранов внутри вкладки телефона (ADR-048, 01_SPEC 4.1), как в Telegram и ВКонтакте:
 * - у каждой вкладки своя история: уходя, запоминаем адрес и прокрутку, касание вкладки
 *   возвращает туда же;
 * - повторное касание активной вкладки прокручивает к началу, а если уже наверху, ведёт к корню;
 * - «Назад» на вложенном экране идёт по истории, если пришли изнутри приложения, иначе к корню.
 *
 * Хранилище вкладки (`sessionStorage`) может быть недоступно: тогда вкладка просто ведёт к корню.
 */
import { useCallback, useEffect, useRef } from "react";
import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router";

export interface TabDef {
  key: string;
  /** Корень вкладки */
  root: string;
}

interface Saved {
  href: string;
  scroll: number;
}

const STORE = "neeklo-tab-stack-v1";

function readAll(scope: string): Record<string, Saved> {
  try {
    const raw = window.sessionStorage.getItem(`${STORE}:${scope}`);
    return raw ? (JSON.parse(raw) as Record<string, Saved>) : {};
  } catch {
    return {};
  }
}

function writeAll(scope: string, value: Record<string, Saved>) {
  try {
    window.sessionStorage.setItem(`${STORE}:${scope}`, JSON.stringify(value));
  } catch {
    // Приватный режим: история вкладок живёт до перезагрузки только в памяти роутера
  }
}

/** Что прокручивается: основная область приложения или окно */
export function scrollRoot(): { get: () => number; set: (top: number, smooth?: boolean) => void } {
  const el = document.querySelector<HTMLElement>("[data-scroll-root]");
  const own = el && el.scrollHeight > el.clientHeight + 1 ? el : null;
  return {
    get: () => (own ? own.scrollTop : window.scrollY),
    set: (top, smooth = false) => {
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const behavior: ScrollBehavior = smooth && !reduced ? "smooth" : "auto";
      if (own) own.scrollTo({ top, behavior });
      else window.scrollTo({ top, behavior });
    },
  };
}

/**
 * Вкладки панели: какая активна сейчас и что делать при касании.
 * `ownerOf` решает, какой вкладке принадлежит адрес; экран вне вкладок принадлежит «Ещё».
 */
export function useTabStack(
  scope: string,
  tabs: readonly TabDef[],
  ownerOf: (path: string) => string,
  /** Адреса-переходы, которые сразу уводят дальше (`/app`, старт показа): их не запоминаем */
  transient: readonly string[] = [],
) {
  const navigate = useNavigate();
  const location = useRouterState({ select: (s) => s.location });
  const href = location.pathname + (location.searchStr ?? "");
  const active = ownerOf(location.pathname);
  const restoring = useRef<number | null>(null);

  // Запомнить адрес активной вкладки; прокрутку запоминаем при уходе (см. select)
  useEffect(() => {
    if (transient.includes(location.pathname)) return;
    const all = readAll(scope);
    const prev = all[active];
    all[active] = { href, scroll: prev?.href === href ? prev.scroll : 0 };
    writeAll(scope, all);
    if (restoring.current !== null) {
      const top = restoring.current;
      restoring.current = null;
      // Экран дорисовывается после перехода: прокрутка восстанавливается на следующем кадре
      requestAnimationFrame(() => requestAnimationFrame(() => scrollRoot().set(top)));
    }
    // transient задаётся константой в месте вызова
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, active, href, location.pathname]);

  const select = useCallback(
    (tab: TabDef) => {
      const all = readAll(scope);
      const scroller = scrollRoot();
      if (tab.key === active) {
        // Повторное касание: наверх, а если уже наверху, к корню вкладки
        if (scroller.get() > 4) scroller.set(0, true);
        else if (location.pathname !== tab.root) void navigate({ to: tab.root });
        return;
      }
      all[active] = { href, scroll: scroller.get() };
      writeAll(scope, all);
      const saved = all[tab.key];
      if (saved && ownerOf(saved.href.split("?")[0]!) === tab.key) {
        restoring.current = saved.scroll;
        void navigate({ href: saved.href });
      } else {
        void navigate({ to: tab.root });
      }
    },
    [scope, active, href, location.pathname, navigate, ownerOf],
  );

  return { active, select };
}

/**
 * «Назад» вложенного экрана: по истории, если предыдущий экран внутри приложения,
 * иначе к корню вкладки. Глубина истории роутера хранится в `history.state`.
 */
export function useBack(fallback: string) {
  const router = useRouter();
  const navigate = useNavigate();
  return useCallback(() => {
    const index = (window.history.state as { __TSR_index?: number } | null)?.__TSR_index ?? 0;
    if (index > 0) router.history.back();
    else void navigate({ to: fallback });
  }, [router, navigate, fallback]);
}
