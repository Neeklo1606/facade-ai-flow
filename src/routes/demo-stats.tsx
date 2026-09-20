import { useSyncExternalStore } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/common/PageHeader";
import { WidgetCard, WidgetCardHeader } from "@/components/common/WidgetCard";
import { Button } from "@/components/ui/button";
import { scenarioById } from "@/lib/guide/scenarios";
import { useGuide } from "@/lib/guide/store";
import {
  clearTelemetry,
  onTelemetry,
  summarize,
  telemetryEvents,
  type TelemetryEvent,
} from "@/lib/guide/telemetry";

/**
 * Статистика сессии (ADR-010): скрытый экран, в меню его нет. Показывает журнал этой вкладки —
 * пройденные шаги, время по экранам, действия, ошибки, обратную связь, точку выхода.
 */
export const Route = createFileRoute("/demo-stats")({
  head: () => ({
    meta: [
      { title: "Статистика сессии — neeklo FieldOps" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DemoStatsPage,
});

const empty: readonly TelemetryEvent[] = [];
let snapshot: readonly TelemetryEvent[] = empty;
function subscribe(listener: () => void) {
  snapshot = [...telemetryEvents()];
  return onTelemetry(() => {
    snapshot = [...telemetryEvents()];
    listener();
  });
}

function useTelemetry() {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => empty,
  );
}

const minutes = (ms: number) => {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m ? `${m} мин ${s} с` : `${s} с`;
};
const clock = (at: number) =>
  new Date(at).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

function DemoStatsPage() {
  const events = useTelemetry();
  const guide = useGuide();
  const scenario = scenarioById(guide.scenarioId);
  const stats = summarize(events);
  const role = [...events].reverse().find((e) => e.t === "role");
  const done = scenario ? scenario.steps.filter((s) => guide.status[s.id] === "done").length : 0;
  const skipped = scenario
    ? scenario.steps.filter((s) => guide.status[s.id] === "skipped").length
    : 0;

  return (
    <>
      <PageHeader
        title="Статистика сессии"
        description="Журнал этой вкладки: где посетитель провёл время, что сделал и где остановился. Данные живут только в этой вкладке."
        actions={
          <Button variant="secondary" size="sm" onClick={clearTelemetry} disabled={!events.length}>
            Очистить
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-4">
        <Tile label="Время в сессии" value={events.length ? minutes(stats.durationMs) : "—"} />
        <Tile
          label="Шаги сценария"
          value={scenario ? `${done} из ${scenario.steps.length}` : "—"}
          hint={
            scenario
              ? `${scenario.title}${skipped ? `, пропущено ${skipped}` : ""}`
              : "Роль не выбрана"
          }
        />
        <Tile label="Действий" value={String(stats.actions.reduce((n, a) => n + a.count, 0))} />
        <Tile
          label="Ошибок"
          value={String(stats.errors.length)}
          hint={
            stats.lastExit
              ? `Последний уход: «${nameOf(events, stats.lastExit.screen)}»`
              : undefined
          }
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <WidgetCard>
          <WidgetCardHeader level={2} title="Время по экранам" />
          <Table
            empty="Экраны ещё не открывались"
            head={["Экран", "Заходов", "Время"]}
            rows={stats.screens.map((s) => [s.name, String(s.visits), minutes(s.ms)])}
          />
        </WidgetCard>
        <WidgetCard>
          <WidgetCardHeader level={2} title="Действия" />
          <Table
            empty="Действий пока не было"
            head={["Действие", "Раз", "Последнее"]}
            rows={stats.actions.map((a) => [a.label, String(a.count), clock(a.lastAt)])}
          />
        </WidgetCard>
        <WidgetCard>
          <WidgetCardHeader
            level={2}
            title="Шаги сценария"
            {...(role && role.t === "role" ? { hint: `Роль выбрана в ${clock(role.at)}` } : {})}
          />
          <Table
            empty="Шаги ещё не засчитывались"
            head={["Шаг", "Итог", "Когда"]}
            rows={stats.steps.map((s) => [
              scenarioById(s.scenario)?.steps.find((step) => step.id === s.step)?.text ?? s.step,
              s.status === "done" ? "Выполнен" : "Пропущен",
              clock(s.at),
            ])}
          />
        </WidgetCard>
        <WidgetCard>
          <WidgetCardHeader level={2} title="Ошибки и обратная связь" />
          <Table
            empty="Ошибок и отзывов нет"
            head={["Что", "Экран", "Когда"]}
            rows={[
              ...stats.errors.map((e) => ({
                at: e.at,
                row: [`Ошибка: ${e.message}`, nameOf(events, e.screen), clock(e.at)],
              })),
              ...stats.feedback.map((f) => ({
                at: f.at,
                row: [`Непонятно: ${f.text}`, nameOf(events, f.screen), clock(f.at)],
              })),
            ]
              .sort((a, b) => a.at - b.at)
              .map((item) => item.row)}
          />
        </WidgetCard>
      </div>
    </>
  );
}

/** Название экрана по ключу — из событий открытия, а не из словаря: заглушки делят один ключ */
function nameOf(events: readonly TelemetryEvent[], screen: string) {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event?.t === "screen" && event.screen === screen) return event.name;
  }
  return screen;
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string | undefined }) {
  return (
    <WidgetCard>
      <p className="text-[13px] text-text-2">{label}</p>
      <p className="mt-1 text-[24px] leading-[1.2] font-semibold text-text tnum">{value}</p>
      {hint && <p className="mt-1 text-[12px] leading-[1.4] text-text-3">{hint}</p>}
    </WidgetCard>
  );
}

function Table({
  head,
  rows,
  empty: emptyText,
}: {
  head: string[];
  rows: string[][];
  empty: string;
}) {
  if (!rows.length) return <p className="py-4 text-[13px] text-text-3">{emptyText}</p>;
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-line text-text-3">
            {head.map((cell, i) => (
              <th
                key={cell}
                scope="col"
                className={i ? "px-1 py-2 text-right font-normal" : "px-1 py-2 font-normal"}
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="border-b border-line last:border-0">
              {row.map((cell, i) => (
                <td
                  key={i}
                  className={
                    i
                      ? "px-1 py-2 text-right text-text-2 tnum whitespace-nowrap"
                      : "px-1 py-2 text-text"
                  }
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
