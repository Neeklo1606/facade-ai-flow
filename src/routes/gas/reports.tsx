import { completePageHead } from "@/lib/page-head";
import { track } from "@/lib/site/analytics";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, SlidersHorizontal } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/kit/controls";
import { FiltersSheet } from "@/components/ui/kit/sheet";
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
import { FinalCheckBlock, NormVsFactBlock } from "@/components/gas-ops/report/FinalCheckBlock";
import { normText, useGasReviewPolicy, useGasWorkCost } from "@/api/gas-estimates";
import { gasShowEvent } from "@/lib/gas-ops/show";
import { setMetricOrder, useMetricOrder } from "@/lib/gas-ops/report-view";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useIsClientContour } from "@/lib/gas-ops/contour";

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
  const clientContour = useIsClientContour();
  const phone = useMediaQuery("(max-width: 767px)", false);

  const [view, setView] = useState<View>("customer");
  const [mode, setMode] = useState<ReportMode>("confirmed");
  const [rawPeriod, setPeriod] = useState<ReportPeriod>("week");
  const [hideEmpty, setHideEmpty] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const order = useMetricOrder();
  // «Во весь экран»: Esc возвращает (5.7)
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);
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

  const policy = useGasReviewPolicy();
  const workCost = useGasWorkCost();
  const normRows = workCost.rows
    .filter((row) => row.confirmed && normText(row.norm))
    .map((row) => ({ id: row.object.id, label: row.object.label, text: normText(row.norm)! }));

  const exportFile = async () => {
    // Итоговая проверка обязательна перед выгрузкой утверждённого отчёта (ADR-053, 5)
    if (mode === "confirmed" && policy.finalList.length > 0) {
      toast.error("Сначала итоговая проверка", {
        description: `Без ручного подтверждения: ${policy.finalList.length}. Проверьте их в блоке выше.`,
      });
      document.getElementById("final-check")?.scrollIntoView({ block: "center" });
      return;
    }
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
      track("excel_download");
      toast.success("Файл выгружен", { description: name, duration: 2500 });
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

  const collapseToBrigades = () =>
    setCollapsed(new Set(report.allRows.filter((r) => r.kind === "brigade").map((r) => r.id)));
  const changedSettings =
    Number(mode !== "confirmed") + Number(hideEmpty) + Number(order !== "money");

  /* Настройки вида: на телефоне в шторке «Настроить вид», на компьютере строкой над таблицей */
  const settings = (
    <>
      <Segmented
        label="Что включено"
        value={mode}
        onChange={setMode}
        options={[
          { value: "confirmed", label: "Подтверждённые" },
          { value: "preliminary", label: "Предварительный" },
        ]}
      />
      <Segmented
        label="Порядок показателей"
        value={order}
        onChange={setMetricOrder}
        options={[
          { value: "money", label: "Сначала деньги" },
          { value: "time", label: "Сначала время" },
        ]}
      />
      {view === "customer" ? (
        <span className="flex flex-wrap items-center gap-1">
          <Button variant="quiet" className="px-2" onClick={() => setCollapsed(new Set())}>
            Развернуть всё
          </Button>
          <Button variant="quiet" className="px-2" onClick={collapseToBrigades}>
            Свернуть до бригад
          </Button>
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 px-2 text-body text-text-2">
            <Checkbox
              checked={hideEmpty}
              onCheckedChange={(value) => setHideEmpty(value === true)}
              className="size-5 rounded-[var(--r-xs)] border-line-2"
            />
            Скрыть пустые
          </label>
        </span>
      ) : null}
    </>
  );

  return (
    <div className="flex flex-col gap-block">
      <ScreenHint screen="reports" className="mb-0" />

      <ReportHero
        total={report.total}
        count={report.count}
        preliminary={mode === "preliminary"}
        day={day}
        busy={busy}
        onExport={() => void exportFile()}
      />

      <FinalCheckBlock />
      <NormVsFactBlock rows={normRows} />

      {/* Сверка с файлом заказчика только в его личном контуре (ADR-047) */}
      {clientContour ? <ReconcileBlock /> : null}

      {/* Одна строка управления (5.7) */}
      <div className="flex items-center justify-between gap-2">
        <div role="tablist" aria-label="Вид отчёта" className="seg min-w-0">
          {(
            [
              ["customer", "Формат заказчика"],
              ["analytic", "Аналитика"],
            ] as const
          ).map(([key, text]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={view === key}
              onClick={() => setView(key)}
              className="seg-item focus-ring"
            >
              {text}
            </button>
          ))}
        </div>
        {phone ? (
          <Button
            variant="outline"
            size="icon"
            className="relative shrink-0 rounded-control"
            aria-label={
              changedSettings ? `Настроить вид, изменено ${changedSettings}` : "Настроить вид"
            }
            onClick={() => setSettingsOpen(true)}
          >
            <SlidersHorizontal aria-hidden />
            {changedSettings ? (
              <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-orange-strong px-1 text-meta-strong text-on-orange tnum">
                {changedSettings}
              </span>
            ) : null}
          </Button>
        ) : view === "customer" ? (
          <Button variant="outline" onClick={() => setFullscreen(true)}>
            <Maximize2 aria-hidden />
            Во весь экран
          </Button>
        ) : null}
      </div>
      {phone ? null : <div className="flex flex-wrap items-center gap-2">{settings}</div>}

      {mode === "preliminary" ? (
        <p className="flex items-start gap-2 text-meta text-text-2">
          <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-warn" />
          Предварительный: включены записи, которые ещё ждут проверки. В утверждённый отчёт идут
          только подтверждённые.
        </p>
      ) : null}

      {view === "customer" ? (
        <section
          aria-labelledby="customer-title"
          className={cn(
            "flex flex-col gap-block",
            fullscreen && "fixed inset-0 z-[60] overflow-auto bg-void p-8",
          )}
        >
          <h2 id="customer-title" className={fullscreen ? "text-title" : "sr-only"}>
            Формат заказчика
          </h2>
          {fullscreen ? (
            <Button
              variant="outline"
              className="absolute top-6 right-8"
              onClick={() => setFullscreen(false)}
            >
              <Minimize2 aria-hidden />
              Свернуть, Esc
            </Button>
          ) : null}
          {/* Липкая полоса дней (5.7) */}
          <div className="sticky top-[calc(var(--topbar-h)+env(safe-area-inset-top))] z-20 -mx-gutter bg-void px-gutter py-1 lg:static lg:mx-0 lg:px-0">
            <PeriodSwitch
              days={report.days}
              value={period}
              onChange={choosePeriod}
              compact={phone}
            />
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

      <FiltersSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        count={report.count}
        onReset={() => {
          setMode("confirmed");
          setHideEmpty(false);
          setMetricOrder("money");
        }}
      >
        <div className="flex flex-col items-start gap-block">{settings}</div>
      </FiltersSheet>
    </div>
  );
}
