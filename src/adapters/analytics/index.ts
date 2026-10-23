import type { AnalyticsPort } from "@/ports/analytics";

/**
 * Адаптеры аналитики (ADR-051). Метрика грузит свой скрипт только при создании адаптера,
 * а создаётся он только после согласия человека.
 */
export const noneAnalytics: AnalyticsPort = { kind: "none", track: () => undefined };

type Ym = ((id: number, method: string, ...args: unknown[]) => void) & { a?: unknown[][] };

export function metrikaAnalytics(id: string): AnalyticsPort {
  const counter = Number(id);
  const w = window as unknown as { ym?: Ym };
  if (!w.ym) {
    const queue: unknown[][] = [];
    const ym = ((...args: unknown[]) => queue.push(args)) as Ym;
    ym.a = queue;
    w.ym = ym;
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://mc.yandex.ru/metrika/tag.js";
    document.head.appendChild(script);
    w.ym(counter, "init", { clickmap: true, trackLinks: true, accurateTrackBounce: true });
  }
  return {
    kind: "metrika",
    track: (event, params) => w.ym?.(counter, "reachGoal", event, params),
  };
}
