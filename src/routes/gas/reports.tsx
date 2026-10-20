import { completePageHead } from "@/lib/page-head";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { CustomerReport } from "@/components/gas-ops/CustomerReport";
import { ScreenHint } from "@/components/gas-ops/page";
import { AnalyticView } from "@/components/gas-ops/report/AnalyticView";
import { isNewRow } from "@/components/gas-ops/report/cell-text";
import { PeriodSwitch } from "@/components/gas-ops/report/PeriodSwitch";
import { ReconcileBlock } from "@/components/gas-ops/report/ReconcileBlock";
import { ReportHero } from "@/components/gas-ops/report/ReportHero";
import { ReportTree } from "@/components/gas-ops/report/ReportTree";
import { useReportHighlight } from "@/components/gas-ops/report/use-report-highlight";
import { useGasEntry, type ReportMode } from "@/api/gas-ops";
import { useGasReportView, type ReportPeriod } from "@/api/gas-report";
import { useMediaQuery } from "@/hooks/use-media-query";
import { gasTitle } from "@/lib/gas-ops/brand";
import { downloadCustomerXlsx } from "@/lib/gas-ops/export";
import { gasShowEvent } from "@/lib/gas-ops/show";
import { toast } from "@/lib/toast";

/**
 * Недельный отчёт (ТЗ, п. 9; ADR-044, F6). Итог недели крупно, сверка с файлом заказчика,
 * «Формат заказчика» (на десктопе таблица с закреплённым столбцом и шапкой, на телефоне
 * дерево) и аналитическая таблица. Выгрузка отдаёт тот же набор строк, что на экране.
 */
interface ReportsSearch {
  highlight?: string | undefined;
  /** «Показать на экране» из инструкции: читает оболочка */
  tour?: string | undefined;
}

export const Route = createFileRoute("/gas/reports")({
  validateSearch: (search: Record<string, unknown>): ReportsSearch => ({
    highlight:
      typeof search["highlight"] === "string" && search["highlight"]
        ? search["highlight"]
        : undefined,
    tour: typeof search["tour"] === "string" ? search["tour"] : undefined,
  }),
  head: () =>
    completePageHead(
      { meta: [{ title: gasTitle("Отчёт") }] },
      gasTitle("Отчёт"),
      "Недельный отчёт в формате заказчика, сверка с его файлом и выгрузка в Excel.",
    ),
  component: ReportsPage,
});

type View = "customer" | "analytic";

function ReportsPage() {
  const { highlight = null } = Route.useSearch();
  const phone = useMediaQuery("(max-width: 767px)", false);

  const [view, setView] = useState<View>("customer");
  const [mode, setMode] = useState<ReportMode>("confirmed");
  const [rawPeriod, setPeriod] = useState<ReportPeriod>("week");
  const [hideEmpty, setHideEmpty] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  // На телефоне нет «Итого недели»: неделя там и есть итог
  const period: ReportPeriod = phone && rawPeriod === "total" ? "week" : rawPeriod;

  // Запись из сценария ещё на проверке: показываем предварительный отчёт, иначе строки нет
  const highlighted = useGasEntry(highlight);
  useEffect(() => {
    if (highlighted?.entry.status === "pending") setMode("preliminary");
  }, [highlighted?.entry.status]);

  const report = useGasReportView({ mode, period, hideEmpty, highlight });

  // Телефон открывается свёрнутым до бригад: длинный список адресов не нужен с порога
  const phoneInit = useRef(false);
  useEffect(() => {
    if (!phone || phoneInit.current) return;
    phoneInit.current = true;
    setCollapsed(new Set(report.allRows.filter((r) => r.kind === "brigade").map((r) => r.id)));
  }, [phone, report.allRows]);

  const expand = useCallback((ids: string[]) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }, []);
  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const choosePeriod = useCallback((next: ReportPeriod) => setPeriod(next), []);

  const flashRowId = useReportHighlight({
    highlight,
    target: report.target,
    phone,
    setPeriod: choosePeriod,
    expand,
  });
  const tourRowId =
    report.target?.rowId ?? report.rows.find((row) => isNewRow(row, report.changed))?.id ?? null;

  const exportFile = async () => {
    setBusy(true);
    try {
      const name = await downloadCustomerXlsx({
        rows: report.rows,
        analytic: report.analytic,
        days: report.days.map((day) => day.iso),
        week: report.week,
        mode,
      });
      gasShowEvent("gasExport", { gasFile: name });
      toast.success("Файл выгружен", { description: name });
    } catch (error) {
      toast.error("Выгрузка не удалась", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const selectedDay = typeof period === "number" ? report.days[period] : undefined;
  const day =
    selectedDay && report.total && typeof period === "number"
      ? { label: selectedDay.label, cell: report.total.days[period]! }
      : null;

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <ScreenHint screen="reports" className="mb-0" />

      <ReportHero
        total={report.total}
        count={report.count}
        preliminary={mode === "preliminary"}
        day={day}
        busy={busy}
        onExport={() => void exportFile()}
      />

      <ReconcileBlock />

      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
        <Segments
          label="Вид отчёта"
          value={view}
          onChange={setView}
          items={[
            ["customer", "Формат заказчика"],
            ["analytic", "Аналитическая таблица"],
          ]}
        />
        <Segments
          label="Что включено"
          value={mode}
          onChange={setMode}
          items={[
            ["confirmed", "Только подтверждённые"],
            ["preliminary", "Предварительный"],
          ]}
        />
      </div>

      {mode === "preliminary" ? (
        <p className="flex items-start gap-3 rounded-[var(--r-lg)] bg-warn-bg px-4 py-3 text-[14px] leading-5 text-text-2">
          <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-warn" />
          <span>
            <span className="font-medium text-text">Предварительный отчёт.</span> В него включены
            записи, которые ещё ожидают проверки. В утверждённый отчёт идут только подтверждённые.
          </span>
        </p>
      ) : null}

      {view === "customer" ? (
        <section aria-labelledby="customer-title" className="flex flex-col gap-3">
          <h2 id="customer-title" className="sr-only">
            Формат заказчика
          </h2>
          <PeriodSwitch days={report.days} value={period} onChange={choosePeriod} compact={phone} />
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <ToolButton onClick={() => setCollapsed(new Set())} label="Развернуть всё" />
            <ToolButton
              onClick={() =>
                setCollapsed(
                  new Set(report.allRows.filter((r) => r.kind === "brigade").map((r) => r.id)),
                )
              }
              label="Свернуть до бригад"
            />
            <label className="inline-flex min-h-12 cursor-pointer items-center gap-3 rounded-full px-2 text-[14px] text-text-2 is-hover:text-text">
              <Checkbox
                checked={hideEmpty}
                onCheckedChange={(value) => setHideEmpty(value === true)}
                className="size-5 rounded-[6px] border-line-2"
              />
              Скрыть строки без значений в выбранном периоде
            </label>
          </div>
          {phone ? (
            <ReportTree
              rows={report.rows}
              period={period}
              collapsed={collapsed}
              onToggle={toggle}
              changed={report.changed}
              flashRowId={flashRowId}
              tourRowId={tourRowId}
            />
          ) : (
            <CustomerReport
              rows={report.rows}
              days={report.days}
              period={period}
              collapsed={collapsed}
              onToggle={toggle}
              changed={report.changed}
              flashRowId={flashRowId}
              tourRowId={tourRowId}
            />
          )}
        </section>
      ) : (
        <AnalyticView rows={report.analytic} days={report.days} phone={phone} />
      )}
    </div>
  );
}

function Segments<T extends string>({
  label,
  value,
  onChange,
  items,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  items: [T, string][];
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0">
      <div role="tablist" aria-label={label} className="seg">
        {items.map(([key, text]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={value === key}
            onClick={() => onChange(key)}
            className="seg-item focus-ring"
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function ToolButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-12 items-center rounded-full bg-surface-2 px-4 text-[14px] font-medium text-text-2 focus-ring is-hover:text-text lg:min-h-10"
    >
      {label}
    </button>
  );
}
