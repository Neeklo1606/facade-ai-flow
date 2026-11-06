import { completePageHead } from "@/lib/page-head";
import { track } from "@/lib/site/analytics";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Columns3,
  Maximize2,
  Minimize2,
  Rows3,
  Table2,
  TriangleAlert,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/ui/kit/controls";
import {
  ActiveChip,
  FilterChip,
  FilterGroup,
  FilterPanel,
  FilterRow,
  ToggleChip,
} from "@/components/gas-ops/filters/FilterChip";
import { ExportMenu } from "@/components/gas-ops/tabel/ExportMenu";
import { EmptyBlock } from "@/components/ui/kit/states";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Grid,
  type GridCell,
  type GridColumn,
  type GridRow,
} from "@/components/gas-ops/tabel/Grid";
import { CellDialog } from "@/components/gas-ops/tabel/CellDialog";
import { ReconcileBlock } from "@/components/gas-ops/report/ReconcileBlock";
import { NormVsFactBlock } from "@/components/gas-ops/report/FinalCheckBlock";
import {
  METRIC_LABEL,
  METRIC_SHORT,
  fmtHours,
  fmtRub,
  metricOrder,
  metricValue,
  peopleTotals,
  pushWeekSheet,
  sheetStatus,
  sheetSync,
  useGasActor,
  useGasDirectory,
  useGasTabel,
  useGasWeekView,
  useWeekExport,
  visibleTabelRows,
  type Metric,
  type TabelCell,
  type TabelRow,
} from "@/api/gas-ops";
import { normText, useGasReviewPolicy, useGasWorkCost } from "@/api/gas-estimates";
import { useMediaQuery } from "@/hooks/use-media-query";
import { gasTitle } from "@/lib/gas-ops/brand";
import { useIsClientContour } from "@/lib/gas-ops/contour";
import { setMetricOrder, useMetricOrder } from "@/lib/gas-ops/report-view";
import { recordShow } from "@/lib/gas-ops/show";
import { plural } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/**
 * «Табель» (ADR-061, 11; раздел 4.5): рабочая сетка недели на всю высоту окна. Над сеткой
 * только панель инструментов. Цвет ячеек вместо переключателя «Подтверждённые /
 * Предварительный», выделение и копирование как в Google Таблицах, исходные записи и правка
 * через окно ячейки. Телефон: список «бригада → объект → день» и «Открыть как таблицу».
 */
interface TabelSearch {
  /** Запись из сценария: её ячейка выделяется */
  highlight?: string | undefined;
  tour?: string | undefined;
}

export const Route = createFileRoute("/gas/tabel")({
  validateSearch: (search: Record<string, unknown>): TabelSearch => ({
    highlight:
      typeof search["highlight"] === "string" && search["highlight"]
        ? search["highlight"]
        : undefined,
    tour: typeof search["tour"] === "string" ? search["tour"] : undefined,
  }),
  head: () =>
    completePageHead(
      { meta: [{ title: gasTitle("Табель") }] },
      gasTitle("Табель"),
      "Табель недели в формате заказчика и по людям: выделение, копирование, выгрузка в Excel.",
    ),
  component: TabelPage,
});

type View = "customer" | "people";
type Density = "compact" | "normal";

const WEEKDAY = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const dayLabel = (iso: string) =>
  `${WEEKDAY[new Date(`${iso}T00:00:00`).getDay()] ?? ""} ${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

const ALL_METRICS: Metric[] = ["amount", "hours", "rate", "man"];
const METRIC_WIDTH: Record<Metric, number> = { amount: 116, hours: 64, rate: 88, man: 64 };

function metricText(cell: TabelCell, metric: Metric): string {
  const value = metricValue(cell, metric);
  if (value === null) return "";
  switch (metric) {
    case "amount":
      return fmtRub(value);
    case "rate":
      return value.toLocaleString("ru-RU");
    default:
      return value.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}

function TabelPage() {
  const { highlight = null } = Route.useSearch();
  const actor = useGasActor();
  const tabel = useGasTabel();
  const directory = useGasDirectory();
  const exportWeek = useWeekExport();
  const weekView = useGasWeekView();
  const policy = useGasReviewPolicy();
  const workCost = useGasWorkCost();
  const clientContour = useIsClientContour();
  const phone = useMediaQuery("(max-width: 767px)", false);
  const order = useMetricOrder();

  const [view, setView] = useState<View>("customer");
  const [metrics, setMetrics] = useState<Metric[]>(
    actor.canSeeMoney ? ["amount", "hours", "rate"] : ["hours", "man"],
  );
  const [density, setDensity] = useState<Density>("compact");
  const [fullscreen, setFullscreen] = useState(false);
  const [search, setSearch] = useState("");
  const [groupId, setGroupId] = useState("all");
  const [brigadeId, setBrigadeId] = useState("all");
  const [onlyDraft, setOnlyDraft] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [labelWidth, setLabelWidth] = useState(320);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<{ title: string; entryIds: string[] } | null>(null);
  const [asTable, setAsTable] = useState(false);
  const [busy, setBusy] = useState(false);

  // Бригадир денег не видит (ТЗ, п. 5.6): показатели с суммой из колонок убираются
  const shown = metricOrder(
    metrics.filter((m) => actor.canSeeMoney || (m !== "amount" && m !== "rate")),
    order,
  );

  /* ---------------- Строки вида «Формат заказчика» ---------------- */
  const filtered = useMemo(() => {
    const text = search.trim().toLowerCase();
    const byId = new Map(tabel.rows.map((r) => [r.id, r]));
    const ancestors = (row: TabelRow): TabelRow[] => {
      const list: TabelRow[] = [];
      for (
        let p = row.parentId ? byId.get(row.parentId) : undefined;
        p;
        p = p.parentId ? byId.get(p.parentId) : undefined
      )
        list.push(p);
      return list;
    };
    const keep = new Set<string>();
    for (const row of tabel.rows) {
      if (row.kind === "total") continue;
      const chain = [row, ...ancestors(row)];
      if (groupId !== "all" && !chain.some((r) => r.id === `g-${groupId}`)) continue;
      if (brigadeId !== "all" && !chain.some((r) => r.id === `b-${brigadeId}`)) continue;
      if (onlyDraft && row.kind === "address" && row.total.status !== "draft") continue;
      if (onlyDraft && row.kind !== "address") continue;
      if (
        text &&
        row.kind === "address" &&
        !chain.some((r) => r.label.toLowerCase().includes(text))
      )
        continue;
      if (text && row.kind !== "address") continue;
      for (const r of chain) keep.add(r.id);
    }
    // Агрегаты показываются, если под ними что-то осталось; без фильтров — все строки
    const active = text || groupId !== "all" || brigadeId !== "all" || onlyDraft;
    return tabel.rows.filter((row) => row.kind === "total" || !active || keep.has(row.id));
  }, [tabel.rows, search, groupId, brigadeId, onlyDraft]);

  const visible = useMemo(() => visibleTabelRows(filtered, collapsed), [filtered, collapsed]);

  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const customerColumns: GridColumn[] = useMemo(
    () =>
      [
        ...tabel.days.map((day) => ({ key: day, group: dayLabel(day) })),
        { key: "total", group: "Итого недели" },
      ].flatMap((part) =>
        shown.map((metric) => ({
          key: `${part.key}:${metric}`,
          group: part.group,
          title: METRIC_SHORT[metric],
          width: widths[`${part.key}:${metric}`] ?? METRIC_WIDTH[metric],
        })),
      ),
    [tabel.days, shown, widths],
  );

  const customerCell = useCallback(
    (r: number, c: number): GridCell => {
      const row = visible[r]!;
      const dayIndex = Math.floor(c / shown.length);
      const metric = shown[c % shown.length]!;
      const cell = dayIndex < tabel.days.length ? row.days[dayIndex]! : row.total;
      return {
        value: metricValue(cell, metric),
        text: metricText(cell, metric),
        // Итоги недели и строка «Итого» не красятся отсутствием записи: это сумма, а не день
        status: dayIndex < tabel.days.length || cell.status === "draft" ? cell.status : null,
        manual: metric === "amount" && cell.manual,
        noEstimate: metric === "amount" && cell.noEstimate,
        entryIds: cell.entryIds,
      };
    },
    [visible, shown, tabel.days.length],
  );

  const gridRows: GridRow[] = visible.map((row) => ({
    id: row.id,
    label: row.label,
    level: row.level,
    kind: row.kind,
    collapsible: row.hasChildren,
    collapsed: collapsed.has(row.id),
    tour: !!highlight && row.kind === "address" && row.total.entryIds.includes(highlight),
  }));

  /* ---------------- Вид «По людям» ---------------- */
  const people = tabel.people.filter(
    (p) =>
      (brigadeId === "all" || p.brigadeId === brigadeId) &&
      (!search.trim() || p.label.toLowerCase().includes(search.trim().toLowerCase())),
  );
  const peopleSum = peopleTotals(people, tabel.days);
  const peopleRows: GridRow[] = [
    ...people.map((p) => ({
      id: p.id,
      label: p.label,
      level: 0,
      kind: "person",
      collapsible: false,
      collapsed: false,
    })),
    {
      id: "people-total",
      label: "Итого",
      level: 0,
      kind: "total",
      collapsible: false,
      collapsed: false,
    },
  ];
  const peopleColumns: GridColumn[] = [
    ...tabel.days.map((day) => ({
      key: day,
      group: dayLabel(day),
      title: "Часы",
      width: widths[day] ?? 72,
    })),
    { key: "total", group: "Итого недели", title: "Часы", width: widths["total"] ?? 80 },
  ];
  const peopleCell = useCallback(
    (r: number, c: number): GridCell => {
      const person = people[r];
      const minutes = person
        ? c < tabel.days.length
          ? person.days[c]!
          : person.total
        : c < tabel.days.length
          ? peopleSum[c] || null
          : peopleSum.reduce((a, v) => a + v, 0) || null;
      const value = minutes === null ? null : Math.round((minutes / 60) * 100) / 100;
      const day = tabel.days[c];
      const weekend = day ? [0, 6].includes(new Date(`${day}T00:00:00`).getDay()) : false;
      return {
        value,
        text: value === null ? "" : value.toLocaleString("ru-RU", { minimumFractionDigits: 2 }),
        status: value === null && weekend ? "off" : null,
        entryIds: person && c < tabel.days.length ? person.entryIds[c]! : [],
      };
    },
    [people, peopleSum, tabel.days],
  );

  /* ---------------- Переход из сценария: ячейка записи ---------------- */
  const [focus, setFocus] = useState<{ row: number; col: number } | null>(null);
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!highlight || handled.current === highlight) return;
    const address = tabel.rows.find(
      (r) => r.kind === "address" && r.total.entryIds.includes(highlight),
    );
    if (!address) return;
    handled.current = highlight;
    // Раскрыть родителей, затем выделить ячейку дня записи
    setCollapsed(new Set());
    const dayIndex = address.days.findIndex((d) => d.entryIds.includes(highlight));
    window.setTimeout(() => {
      const row = visibleTabelRows(filtered, new Set()).findIndex((r) => r.id === address.id);
      if (row >= 0) setFocus({ row, col: Math.max(0, dayIndex) * shown.length });
    }, 0);
  }, [highlight, tabel.rows, filtered, shown.length]);

  /*
   * Переход по ссылке на запись (`?highlight=`): прокрутка к строке один раз, когда она
   * отрисована. Строка помечена `data-tour="report-row"` и в сетке, и в списке телефона
   */
  useEffect(() => {
    if (!highlight) return;
    const frame = requestAnimationFrame(() =>
      document.querySelector('[data-tour="report-row"]')?.scrollIntoView({ block: "center" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [highlight, phone]);

  /* ---------------- Высота сетки до низа окна ---------------- */
  const gridBox = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(240);
  useLayoutEffect(() => {
    // Верх сетки от начала страницы: высота не зависит от прокрутки
    const measure = () =>
      setTop((gridBox.current?.getBoundingClientRect().top ?? 240) + window.scrollY);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [fullscreen, phone, asTable]);
  // Под сеткой строка итогов выделенного и легенда
  const gridHeight = `max(320px, calc(100dvh - ${Math.round(fullscreen ? 96 : top)}px - 72px))`;

  // «Во весь экран»: Esc возвращает, если не открыто окно ячейки
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !open && !document.querySelector("[role='dialog']"))
        setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen, open]);

  /* ---------------- Выгрузка ---------------- */
  const download = async (kind: "approved" | "draft") => {
    // Итоговая проверка обязательна перед утверждённой выгрузкой (ADR-053, 5): она на «Неделе»
    if (kind === "approved" && policy.finalList.length > 0) {
      toast.error("Сначала итоговая проверка", {
        description: `Без ручного подтверждения: ${policy.finalList.length}. Она на экране «Неделя».`,
      });
      return;
    }
    setBusy(true);
    try {
      const name = await exportWeek(kind);
      recordShow({ gasFile: name });
      track("excel_download");
      toast.success(kind === "approved" ? "Утверждённый файл выгружен" : "Черновик выгружен", {
        description: name,
        duration: 2500,
      });
    } catch (error) {
      toast.error("Выгрузка не удалась", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };
  const sync = async () => {
    const result = await pushWeekSheet({
      weekFrom: tabel.week.from,
      weekTo: tabel.week.to,
      days: tabel.days,
      rows: tabel.rows,
    });
    if (result.ok) toast.success(sheetStatus(), { description: result.url });
    else toast.info("Таблица не обновлена", { description: result.reason });
  };

  const activeCount = Number(groupId !== "all") + Number(brigadeId !== "all") + Number(onlyDraft);
  const resetFilters = () => {
    setGroupId("all");
    setBrigadeId("all");
    setOnlyDraft(false);
  };
  const shownRows = visible.filter((r) => r.kind === "address").length;
  const exportMenu = (wide: boolean) => (
    <ExportMenu
      wide={wide}
      confirmed={weekView.metrics.confirmed}
      unchecked={weekView.metrics.pending + weekView.metrics.clarify}
      finalLeft={policy.finalList.length}
      busy={busy}
      onDownload={(kind) => void download(kind)}
      sheetStatus={sheetStatus()}
      sheetConnected={sheetSync.connected}
      onSync={() => void sync()}
    />
  );

  const filterChips = (
    <FilterRow active={activeCount} onReset={resetFilters}>
      {view === "customer" ? (
        <FilterChip
          label="Подразделение"
          value={groupId}
          onChange={setGroupId}
          options={directory.groups.map((g) => ({ value: g.id, label: g.name }))}
        />
      ) : null}
      <FilterChip
        label="Бригада"
        value={brigadeId}
        onChange={setBrigadeId}
        options={directory.brigades.map((b) => ({ value: b.id, label: b.name }))}
      />
      {view === "customer" ? (
        <ToggleChip pressed={onlyDraft} onChange={setOnlyDraft}>
          Только непроверенные
        </ToggleChip>
      ) : null}
    </FilterRow>
  );

  // Компьютер: одна кнопка «Фильтры» с окном и выбранные фильтры чипами в той же панели
  const filterPanel = (
    <>
      <FilterPanel
        active={activeCount}
        onReset={resetFilters}
        summary={`Показано ${shownRows} ${plural(shownRows, "строка", "строки", "строк")}`}
      >
        {view === "customer" ? (
          <FilterGroup
            label="Подразделение"
            value={groupId}
            onChange={setGroupId}
            options={directory.groups.map((g) => ({ value: g.id, label: g.name }))}
          />
        ) : null}
        <FilterGroup
          label="Бригада"
          value={brigadeId}
          onChange={setBrigadeId}
          options={directory.brigades.map((b) => ({ value: b.id, label: b.name }))}
        />
        {view === "customer" ? (
          <section className="px-2">
            <h3 className="pt-1 pb-1.5 type-small text-ink-3">Статус</h3>
            <ToggleChip pressed={onlyDraft} onChange={setOnlyDraft}>
              Только непроверенные
            </ToggleChip>
          </section>
        ) : null}
      </FilterPanel>
      {groupId !== "all" ? (
        <ActiveChip
          label={directory.groups.find((g) => g.id === groupId)?.name ?? "Подразделение"}
          onClear={() => setGroupId("all")}
        />
      ) : null}
      {brigadeId !== "all" ? (
        <ActiveChip
          label={directory.brigades.find((b) => b.id === brigadeId)?.name ?? "Бригада"}
          onClear={() => setBrigadeId("all")}
        />
      ) : null}
      {onlyDraft ? (
        <ActiveChip label="Только непроверенные" onClear={() => setOnlyDraft(false)} />
      ) : null}
    </>
  );

  const people_enabled = tabel.people.length > 0;
  const normRows = workCost.rows
    .filter((row) => row.confirmed && normText(row.norm))
    .map((row) => ({ id: row.object.id, label: row.object.label, text: normText(row.norm)! }));
  const period = `${tabel.week.from.slice(8, 10)}.${tabel.week.from.slice(5, 7)}–${tabel.week.to.slice(8, 10)}.${tabel.week.to.slice(5, 7)}`;

  const openCell =
    (rows: GridRow[], cell: (r: number, c: number) => GridCell, columns: GridColumn[]) =>
    (r: number, c: number) => {
      const column = columns[c];
      const row = rows[r];
      if (!column || !row) return;
      setOpen({
        title: `${row.label} · ${column.group}`,
        entryIds: cell(r, c).entryIds,
      });
    };

  /* ---------------- Панель инструментов: одна строка (4.5) ---------------- */
  const toolbar = (
    <div
      role="toolbar"
      aria-label="Панель табеля"
      data-tour="tabel-toolbar"
      className="flex flex-wrap items-center gap-1.5"
    >
      {phone ? (
        <Button variant="outline" onClick={() => setAsTable(false)}>
          Списком
        </Button>
      ) : null}
      <span className="flex items-center gap-1">
        <Button variant="quiet" size="icon" aria-label="Прошлая неделя: в данных её нет" disabled>
          <ChevronLeft aria-hidden />
        </Button>
        <span className="text-body-strong tnum">Неделя {period}</span>
        <Button variant="quiet" size="icon" aria-label="Следующая неделя: в данных её нет" disabled>
          <ChevronRight aria-hidden />
        </Button>
      </span>
      <div role="tablist" aria-label="Вид табеля" className="seg">
        <button
          type="button"
          role="tab"
          aria-selected={view === "customer"}
          onClick={() => setView("customer")}
          className="seg-item focus-ring"
        >
          Формат заказчика
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "people"}
          aria-disabled={!people_enabled}
          title={people_enabled ? undefined : "В записях недели нет поимённого состава"}
          onClick={() => people_enabled && setView("people")}
          className={cn("seg-item focus-ring", !people_enabled && "opacity-50")}
        >
          По людям
        </button>
      </div>
      <SearchBar
        className="w-[148px]"
        label="Поиск по адресу и ФИО"
        placeholder="Адрес, ФИО"
        value={search}
        onChange={setSearch}
      />
      {filterPanel}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">
            <Columns3 aria-hidden />
            Колонки
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 rounded-inset p-3 shadow-floating">
          <p className="text-meta-strong text-text-2">Показатели в днях</p>
          <ul className="mt-1" aria-label="Показатели">
            {ALL_METRICS.filter((m) => actor.canSeeMoney || (m !== "amount" && m !== "rate")).map(
              (m) => (
                <li key={m}>
                  <label className="flex min-h-control-sm cursor-pointer items-center gap-2 text-body">
                    <input
                      type="checkbox"
                      checked={metrics.includes(m)}
                      disabled={metrics.length === 1 && metrics.includes(m)}
                      onChange={(e) =>
                        setMetrics((prev) =>
                          e.target.checked ? [...prev, m] : prev.filter((x) => x !== m),
                        )
                      }
                      className="size-4 accent-[var(--orange-strong)]"
                    />
                    {METRIC_LABEL[m]}
                  </label>
                </li>
              ),
            )}
          </ul>
          <p className="mt-3 text-meta-strong text-text-2">Порядок</p>
          <div role="radiogroup" aria-label="Порядок показателей" className="mt-1 flex gap-2">
            {(
              [
                ["money", "Сначала деньги"],
                ["time", "Сначала время"],
              ] as const
            ).map(([value, text]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={order === value}
                onClick={() => setMetricOrder(value)}
                className={`inline-flex min-h-control-sm items-center rounded-full px-3 text-body focus-ring ${
                  order === value ? "bg-pill text-pill-text" : "bg-surface-2 text-text"
                }`}
              >
                {text}
              </button>
            ))}
          </div>
          <Button
            variant="quiet"
            className="mt-3 px-0"
            onClick={() => {
              setWidths({});
              setLabelWidth(320);
            }}
          >
            Сбросить ширину колонок
          </Button>
        </PopoverContent>
      </Popover>
      {/* Плотность и «Во весь экран» значками: панель остаётся одной строкой на 1440 */}
      <Button
        variant="outline"
        size="icon"
        aria-pressed={density === "normal"}
        aria-label={density === "compact" ? "Плотность: плотно" : "Плотность: свободно"}
        title={density === "compact" ? "Плотность: плотно" : "Плотность: свободно"}
        onClick={() => setDensity(density === "compact" ? "normal" : "compact")}
      >
        <Rows3 aria-hidden />
      </Button>
      <Button
        variant="outline"
        size="icon"
        aria-label={fullscreen ? "Свернуть, Esc" : "Во весь экран"}
        title={fullscreen ? "Свернуть, Esc" : "Во весь экран"}
        onClick={() => setFullscreen(!fullscreen)}
      >
        {fullscreen ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
      </Button>
      <span className="ms-auto">{exportMenu(false)}</span>
    </div>
  );

  const legend = (
    <ul
      aria-label="Легенда"
      className="flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-text-2"
    >
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="size-4 rounded-sm border border-line" /> принято
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="size-4 rounded-sm bg-warn-bg" /> ждёт проверки (черновик)
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="size-4 rounded-sm shadow-[inset_0_0_0_1.5px_var(--danger)]" />{" "}
        нет записи по графику
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="size-4 rounded-sm bg-surface-2" /> выходной или день без
        графика
      </li>
      <li>✎ ручная сумма</li>
      <li className="flex items-center gap-1.5">
        <TriangleAlert aria-hidden className="size-4 text-warn" /> нет сметы
      </li>
    </ul>
  );

  /* ---------------- Телефон: список «бригада → объект → день» ---------------- */
  if (phone && !asTable) {
    return (
      <div className="flex flex-col gap-block">
        <div className="flex items-center gap-2">
          <SearchBar
            className="min-w-0 flex-1"
            label="Поиск по адресу и ФИО"
            placeholder="Адрес, ФИО"
            value={search}
            onChange={setSearch}
          />
          <Button
            variant="outline"
            size="icon"
            className="size-11 shrink-0"
            aria-label="Открыть как таблицу"
            title="Открыть как таблицу"
            onClick={() => setAsTable(true)}
          >
            <Table2 aria-hidden />
          </Button>
        </div>
        {filterChips}
        <PhoneList
          rows={filtered}
          days={tabel.days}
          money={actor.canSeeMoney}
          highlight={highlight}
        />
        {legend}
        {/* Сверка с файлом заказчика только в его личном контуре (ADR-047) */}
        {clientContour ? <ReconcileBlock /> : null}
        {exportMenu(true)}
      </div>
    );
  }

  const body =
    view === "people" ? (
      people.length ? (
        <Grid
          label="Табель по людям"
          rows={peopleRows}
          columns={peopleColumns}
          cell={peopleCell}
          labelTitle="Сотрудник"
          labelWidth={labelWidth}
          onLabelWidth={setLabelWidth}
          onColumnWidth={(key, w) => setWidths((prev) => ({ ...prev, [key]: w }))}
          rowHeight={density === "compact" ? 32 : 40}
          onToggle={() => undefined}
          onOpen={openCell(peopleRows, peopleCell, peopleColumns)}
          height={gridHeight}
        />
      ) : (
        <EmptyBlock
          icon={Users}
          title="Поимённого состава нет"
          text="Вид включается, когда бригадир отмечает людей в записи."
        />
      )
    ) : (
      <Grid
        label="Табель в формате заказчика"
        rows={gridRows}
        columns={customerColumns}
        cell={customerCell}
        labelTitle="Подразделение, бригада, бригадир, объект"
        labelWidth={labelWidth}
        onLabelWidth={setLabelWidth}
        onColumnWidth={(key, w) => setWidths((prev) => ({ ...prev, [key]: w }))}
        rowHeight={density === "compact" ? 32 : 40}
        onToggle={toggle}
        onOpen={openCell(gridRows, customerCell, customerColumns)}
        focus={focus}
        height={gridHeight}
      />
    );

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-3",
        fullscreen && "fixed inset-0 z-[60] bg-void p-4",
      )}
    >
      {toolbar}
      <div ref={gridBox} className="min-w-0">
        {body}
      </div>
      {legend}
      <p className="text-meta text-text-3">
        {tabel.rows.find((r) => r.kind === "total")?.total.entryIds.length ?? 0}{" "}
        {plural(
          tabel.rows.find((r) => r.kind === "total")?.total.entryIds.length ?? 0,
          "запись",
          "записи",
          "записей",
        )}{" "}
        в сетке: принятые и ждущие проверки. В утверждённый Excel идут только принятые.{" "}
        <Link
          to="/gas/week"
          className="inline-flex min-h-control-sm items-center text-meta-strong text-orange focus-ring"
        >
          Закрытие недели
        </Link>
      </p>
      {fullscreen ? null : (
        <>
          <NormVsFactBlock rows={normRows} />
          {/* Сверка с файлом заказчика только в его личном контуре (ADR-047) */}
          {clientContour ? <ReconcileBlock /> : null}
        </>
      )}

      {open ? (
        <CellDialog
          title={open.title}
          entryIds={open.entryIds}
          locked={tabel.locked}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </div>
  );
}

/** Телефон (4.5): «бригада → объект → день» с тремя числами */
function PhoneList({
  rows,
  days,
  money,
  highlight,
}: {
  rows: TabelRow[];
  days: string[];
  money: boolean;
  highlight: string | null;
}) {
  const [day, setDay] = useState<string | null>(null);
  const brigades = rows.filter((r) => r.kind === "brigade");
  const under = (id: string): TabelRow[] => {
    const children = rows.filter((r) => r.parentId === id);
    return children.flatMap((c) => (c.kind === "address" ? [c] : under(c.id)));
  };
  const triple = (cell: TabelCell) =>
    [
      money && cell.amountRub !== null ? fmtRub(cell.amountRub) : null,
      cell.minutes !== null ? fmtHours(cell.minutes / 60) : null,
      money && cell.revenue !== null ? `${fmtRub(cell.revenue)}/ч` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  if (!brigades.length)
    return <EmptyBlock icon={Users} title="Ничего не найдено" text="Измените поиск." />;
  // Полоса дней (ADR-065): часы всех бригад за день столбиком, касание оставляет один день
  const dayMinutes = days.map((_, i) =>
    brigades.reduce((sum, b) => sum + (b.days[i]?.minutes ?? 0), 0),
  );
  const maxDay = Math.max(1, ...dayMinutes);
  const pickedIndex = day === null ? -1 : days.indexOf(day);
  return (
    <div className="flex flex-col gap-block">
      <div role="group" aria-label="День недели" className="card-v3 flex gap-1 p-1.5">
        {days.map((d, i) => {
          const on = day === d;
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              aria-label={`${dayLabel(d)}: ${dayMinutes[i] ? fmtHours(dayMinutes[i]! / 60) : "записей нет"}`}
              onClick={() => setDay(on ? null : d)}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-control px-1 py-2.5 transition-colors focus-ring",
                on ? "bg-inverse text-on-inverse" : "is-hover:bg-surface-2",
              )}
            >
              <span className="type-small opacity-70">{dayLabel(d).slice(0, 2)}</span>
              <span className="flex h-12 w-full max-w-7 items-end overflow-hidden rounded-control bg-surface-2">
                <span
                  className={cn(
                    "bar-gas block w-full rounded-control",
                    on ? "bg-flame" : "bg-ink-3",
                  )}
                  style={{ "--bar": `${(dayMinutes[i]! / maxDay) * 100}%` } as CSSProperties}
                />
              </span>
              <span className="type-small font-semibold tnum">
                {dayMinutes[i] ? Math.round(dayMinutes[i]! / 60) : "–"}
              </span>
            </button>
          );
        })}
      </div>
      <ul className="flex flex-col gap-block" aria-label="Табель по бригадам">
        {brigades.map((brigade) => (
          <li key={brigade.id}>
            <details
              className="surface-1 group"
              data-tabel-brigade={brigade.id}
              open={!!highlight && brigade.total.entryIds.includes(highlight)}
            >
              <summary className="flex min-h-row-compact cursor-pointer list-none items-center justify-between gap-3 px-row focus-ring [&::-webkit-details-marker]:hidden">
                <span className="text-body-strong">{brigade.label}</span>
                <span className="text-meta text-text-2 tnum">
                  {pickedIndex >= 0
                    ? triple(brigade.days[pickedIndex]!) || "нет записей"
                    : triple(brigade.total)}
                </span>
              </summary>
              <ul className="border-t border-line">
                {under(brigade.id).map((address) => (
                  <li
                    key={address.id}
                    data-tour={
                      highlight && address.total.entryIds.includes(highlight)
                        ? "report-row"
                        : undefined
                    }
                    className="border-b border-line px-row py-2 last:border-b-0"
                  >
                    <p className="text-body">{address.label}</p>
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {address.days.map((cell, i) =>
                        cell.entryIds.length && (pickedIndex < 0 || pickedIndex === i) ? (
                          <li
                            key={days[i]}
                            className={cn(
                              "flex justify-between gap-2 rounded-sm px-1 text-meta tnum",
                              cell.status === "draft" && "bg-warn-bg italic",
                            )}
                          >
                            <span className="text-text-2">{dayLabel(days[i]!)}</span>
                            <span>{triple(cell)}</span>
                          </li>
                        ) : null,
                      )}
                    </ul>
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
