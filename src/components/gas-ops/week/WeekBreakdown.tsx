/**
 * Разбивка недели (ADR-066): «Объекты» или «Бригады» одним переключателем. У строки
 * начислено, часы и доходность часа, а полоса показывает долю в начислении недели: где
 * деньги, видно без чтения таблицы. Цифры только по принятым записям, как во всей «Неделе».
 */
import { useState, type CSSProperties } from "react";
import { fmtManHours, fmtRub, useGasBrigades, type GasWeekView } from "@/api/gas-ops";
import { Segmented } from "@/components/ui/kit/controls";
import { StatusChip } from "@/components/ui/mono";
import { plural } from "@/lib/format";

const PREVIEW = 8;

interface Line {
  id: string;
  label: string;
  meta: string;
  amount: number;
  badge?: { tone: "up" | "caution"; text: string } | undefined;
}

export function WeekBreakdown({ view }: { view: GasWeekView }) {
  const [mode, setMode] = useState<"objects" | "brigades">("objects");
  const [all, setAll] = useState(false);
  const brigades = useGasBrigades("confirmed");

  const lines: Line[] =
    mode === "objects"
      ? view.objects.map((o) => ({
          id: o.id,
          label: o.label,
          meta: [
            o.code,
            o.manMinutes === null ? "чел.-ч не рассчитаны" : fmtManHours(o.manMinutes, "чел.-ч"),
            o.outputPerHour === null ? "нет часов" : `${fmtRub(o.outputPerHour)}/ч`,
          ].join(" · "),
          amount: o.accruedRub,
          badge: o.ready ? { tone: "up", text: "Готов" } : { tone: "caution", text: "Уточнение" },
        }))
      : brigades
          .filter((b) => b.totals.count > 0)
          .sort((a, b) => b.totals.amountRub - a.totals.amountRub)
          .map((b) => ({
            id: b.brigade.id,
            label: b.brigade.name,
            meta: [
              `${b.totals.hours.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ч`,
              b.totals.revenuePerHour === null
                ? "нет часов"
                : `${fmtRub(b.totals.revenuePerHour)}/ч`,
              `${b.objects.length} ${plural(b.objects.length, "объект", "объекта", "объектов")}`,
            ].join(" · "),
            amount: b.totals.amountRub,
            badge: b.pending ? { tone: "caution", text: `ждут ${b.pending}` } : undefined,
          }));
  const total = lines.reduce((a, l) => a + l.amount, 0);
  const max = Math.max(1, ...lines.map((l) => l.amount));
  const shown = all ? lines : lines.slice(0, PREVIEW);

  return (
    <section aria-labelledby="week-breakdown" className="card-v3 flex flex-col gap-4 p-5 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="week-breakdown" className="type-card">
          Где начислено
        </h2>
        <Segmented
          label="Разбивка недели"
          value={mode}
          onChange={(next) => {
            setMode(next);
            setAll(false);
          }}
          options={[
            { value: "objects", label: "Объекты" },
            { value: "brigades", label: "Бригады" },
          ]}
        />
      </div>
      {lines.length === 0 ? (
        <p className="type-text text-ink-3">Принятых записей за неделю нет.</p>
      ) : (
        <ol
          aria-label={mode === "objects" ? "Объекты недели" : "Бригады недели"}
          className="flex flex-col divide-y divide-line"
        >
          {shown.map((line) => {
            const share = total ? Math.round((line.amount / total) * 100) : 0;
            return (
              <li key={line.id} className="flex flex-col gap-1.5 py-3 first:pt-0">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body-strong">{line.label}</p>
                    <p className="truncate type-small text-ink-3 tnum">{line.meta}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-body-strong tnum">{fmtRub(line.amount)}</span>
                    {line.badge ? (
                      <StatusChip tone={line.badge.tone}>{line.badge.text}</StatusChip>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-2" aria-hidden>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-pill bg-panel-2">
                    <span
                      className="share-bar block h-full rounded-pill bg-ink"
                      style={{ "--share": `${(line.amount / max) * 100}%` } as CSSProperties}
                    />
                  </span>
                  <span className="w-9 text-right type-small text-ink-3 tnum">{share}%</span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {lines.length > PREVIEW ? (
        <button
          type="button"
          className="min-h-11 self-start type-label text-ink-2 underline underline-offset-4 focus-ring"
          onClick={() => setAll(!all)}
        >
          {all ? "Свернуть" : `Показать все: ${lines.length}`}
        </button>
      ) : null}
      <p className="type-small text-ink-3">
        Доходность часа = начислено ÷ часы записей, как в Excel заказчика. Человеко-часы: часы
        каждого человека суммой; без состава не рассчитываются.
      </p>
    </section>
  );
}
