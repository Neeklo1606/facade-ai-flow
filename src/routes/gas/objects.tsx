import { completePageHead } from "@/lib/page-head";
import { ScreenHint } from "@/components/gas-ops/page";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FiltersButton, SearchBar } from "@/components/ui/kit/controls";
import { DataTable, MetricCard, type TableColumn } from "@/components/ui/kit/data";
import { ListRow } from "@/components/ui/kit/list";
import { FiltersSheet, Sheet, SidePanel } from "@/components/ui/kit/sheet";
import { Chip } from "@/components/ui/kit/status";
import { EmptyBlock } from "@/components/ui/kit/states";
import { FlagList, SourceMark } from "@/components/gas-ops/marks";
import { useIsDesktop, useIsWide } from "@/components/gas-ops/review/use-layout";
import { fmtShortDay } from "@/components/gas-ops/review/rules";
import { fmtHours, fmtRate, fmtRub, useGasObjects, type ObjectCard } from "@/api/gas-ops";
import { plural } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useGasBrand, useIsClientContour } from "@/lib/gas-ops/contour";

/**
 * Реестр объектов (ТЗ, п. 8; вид ADR-045, 5.9). Адрес не единственный ключ: у объекта есть
 * номер. Наличие стоимости видно сразу: «14 700 ₽» или «нет сметы» янтарным, по объектам
 * без неё доходность не считается. Список приходит из недельного графика заказчика
 * (демо: формирование графика вне договора).
 */
export const Route = createFileRoute("/gas/objects")({
  head: () =>
    completePageHead(
      { meta: [{ title: "Объекты · Учёт выработки бригад" }] },
      "Объекты · Учёт выработки бригад",
      "Реестр объектов: адрес, вид работ, бригады, стоимость и записи времени.",
    ),
  component: ObjectsPage,
});

type EstimateFilter = "all" | "with" | "without";

function costText(card: ObjectCard): { text: string; missing: boolean } {
  if (card.estimate?.status === "confirmed")
    return { text: fmtRub(card.estimate.amountRub), missing: false };
  if (card.estimate?.status === "manual-pending")
    return { text: "ждёт подтверждения", missing: true };
  return { text: "нет сметы", missing: true };
}

function ObjectsPage() {
  const brand = useGasBrand();
  const clientContour = useIsClientContour();
  const cards = useGasObjects();
  const desktop = useIsDesktop();
  // С 768 деталь панелью справа, таблица с 1024 (ADR-045, V7)
  const wide = useIsWide();
  const [search, setSearch] = useState("");
  const [brigade, setBrigade] = useState("all");
  const [workType, setWorkType] = useState("all");
  const [estimate, setEstimate] = useState<EstimateFilter>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const brigades = useMemo(
    () => [...new Map(cards.flatMap((c) => c.brigades).map((b) => [b.id, b])).values()],
    [cards],
  );
  const workTypes = useMemo(
    () => [...new Set(cards.map((c) => c.object.workType).filter((w): w is string => !!w))],
    [cards],
  );

  const rows = useMemo(() => {
    const text = search.trim().toLowerCase();
    return cards
      .filter((c) => (brigade === "all" ? true : c.brigades.some((b) => b.id === brigade)))
      .filter((c) => (workType === "all" ? true : c.object.workType === workType))
      .filter((c) =>
        estimate === "all"
          ? true
          : estimate === "with"
            ? c.estimate?.status === "confirmed"
            : c.estimate?.status !== "confirmed",
      )
      .filter((c) =>
        text
          ? c.object.label.toLowerCase().includes(text) ||
            c.object.code.toLowerCase().includes(text)
          : true,
      );
  }, [cards, search, brigade, workType, estimate]);

  const active =
    Number(brigade !== "all") + Number(workType !== "all") + Number(estimate !== "all");
  const resetFilters = () => {
    setBrigade("all");
    setWorkType("all");
    setEstimate("all");
  };
  const chips = [
    brigade !== "all"
      ? {
          key: "b",
          label: brigades.find((b) => b.id === brigade)?.name ?? brigade,
          clear: () => setBrigade("all"),
        }
      : null,
    workType !== "all" ? { key: "w", label: workType, clear: () => setWorkType("all") } : null,
    estimate !== "all"
      ? {
          key: "e",
          label: estimate === "with" ? "Есть смета" : "Нет сметы",
          clear: () => setEstimate("all"),
        }
      : null,
  ].filter((c): c is { key: string; label: string; clear: () => void } => !!c);

  const columns: TableColumn<ObjectCard>[] = [
    { key: "code", title: "Номер", cell: (c) => c.object.code },
    {
      key: "label",
      title: "Адрес",
      cell: (c) => (
        <span className="block max-w-[360px] truncate" title={c.object.label}>
          {c.object.label}
        </span>
      ),
    },
    { key: "work", title: "Вид работ", cell: (c) => c.object.workType ?? "не указан" },
    {
      key: "brigades",
      title: "Бригады",
      cell: (c) => c.brigades.map((b) => b.name).join(", ") || "–",
    },
    { key: "hours", title: "Часы", numeric: true, cell: (c) => fmtHours(c.totals.hours) },
    {
      key: "cost",
      title: "Стоимость работ",
      numeric: true,
      cell: (c) => {
        const cost = costText(c);
        return <span className={cost.missing ? "text-warn" : undefined}>{cost.text}</span>;
      },
    },
    { key: "flags", title: "Признаки", cell: (c) => <FlagList flags={c.flags} /> },
  ];

  const current = cards.find((card) => card.object.id === open) ?? null;
  const option = (on: boolean, label: string, pick: () => void) => (
    <button
      key={label}
      type="button"
      aria-pressed={on}
      onClick={pick}
      className={cn(
        "inline-flex min-h-11 items-center rounded-full border px-3 text-body focus-ring",
        on ? "border-orange-strong bg-orange-dim text-text" : "border-line-2 text-text-2",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-block">
      <ScreenHint screen="objects" className="mb-0" />
      <p className="text-meta text-text-3">
        Объекты из графика на неделю {brand.periodLabel}
        {/* Граница договора заказчика называется только в его личном контуре (L3) */}
        {clientContour ? " · демо: формирование графика вне договора" : " · график недели: демо"}
      </p>

      <div className="flex items-center gap-2">
        <SearchBar
          className="min-w-0 flex-1"
          label="Поиск объекта"
          placeholder="Адрес или номер объекта"
          value={search}
          onChange={setSearch}
        />
        <FiltersButton active={active} onClick={() => setFiltersOpen(true)} />
      </div>
      {chips.length ? (
        <ul className="flex flex-wrap gap-1" aria-label="Активные фильтры">
          {chips.map((chip) => (
            <li key={chip.key}>
              <Chip tone="neutral" onRemove={chip.clear}>
                {chip.label}
              </Chip>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-meta text-text-2 tnum">
        {rows.length} {plural(rows.length, "объект", "объекта", "объектов")} из {cards.length}
      </p>

      {rows.length === 0 ? (
        <EmptyBlock
          icon={SearchX}
          title={search ? `Ничего не найдено по «${search}»` : "Ничего не найдено"}
          text="Проверьте адрес или номер объекта"
          action={
            <Button
              variant="outline"
              onClick={() => {
                setSearch("");
                resetFilters();
              }}
            >
              Сбросить поиск
            </Button>
          }
        />
      ) : desktop ? (
        <DataTable
          label="Объекты"
          rows={rows}
          columns={columns}
          rowKey={(c) => c.object.id}
          activeKey={open}
          onRowClick={(c) => setOpen(c.object.id)}
        />
      ) : (
        <ul className="surface-1 overflow-hidden [&>li+li]:border-t [&>li+li]:border-line">
          {rows.map((card) => {
            const cost = costText(card);
            return (
              <li key={card.object.id}>
                <ListRow
                  title={card.object.label}
                  meta={[card.object.workType ?? "вид работ не указан", card.brigades[0]?.name]
                    .filter(Boolean)
                    .join(" · ")}
                  value={
                    <span className={cost.missing ? "font-normal text-warn" : undefined}>
                      {cost.text}
                    </span>
                  }
                  valueMeta={card.object.code}
                  onClick={() => setOpen(card.object.id)}
                />
              </li>
            );
          })}
        </ul>
      )}

      {current ? <Detail desktop={wide} card={current} onClose={() => setOpen(null)} /> : null}

      <FiltersSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        count={rows.length}
        noun={["объект", "объекта", "объектов"]}
        onReset={resetFilters}
      >
        <section>
          <h3 className="text-meta-strong text-text-2">Смета</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {option(estimate === "all", "Все", () => setEstimate("all"))}
            {option(estimate === "with", "Есть смета", () => setEstimate("with"))}
            {option(estimate === "without", "Нет сметы", () => setEstimate("without"))}
          </div>
        </section>
        <section>
          <h3 className="text-meta-strong text-text-2">Бригада</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {option(brigade === "all", "Все", () => setBrigade("all"))}
            {brigades.map((b) => option(brigade === b.id, b.name, () => setBrigade(b.id)))}
          </div>
        </section>
        <section>
          <h3 className="text-meta-strong text-text-2">Вид работ</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {option(workType === "all", "Все", () => setWorkType("all"))}
            {workTypes.map((w) => option(workType === w, w, () => setWorkType(w)))}
          </div>
        </section>
      </FiltersSheet>
    </div>
  );
}

/** Карточка объекта: шторка на телефоне, панель справа на компьютере (4.13) */
function Detail({
  desktop,
  card,
  onClose,
}: {
  desktop: boolean;
  card: ObjectCard;
  onClose: () => void;
}) {
  const cost = costText(card);
  const body: ReactNode = (
    <div className="flex flex-col gap-section">
      <div className="grid grid-cols-2 gap-block">
        <MetricCard label="Подтверждено" value={fmtRub(card.totals.amountRub)} />
        <MetricCard label="Часы" value={fmtHours(card.totals.hours)} />
        <MetricCard label="Доходность" value={fmtRate(card.totals.revenuePerHour)} />
        <MetricCard label="Дней в работе" value={String(card.days.length)} />
      </div>
      <section>
        <h3 className="text-meta-strong text-text-2">Стоимость работ</h3>
        <p className={cn("mt-1 text-body", cost.missing && "text-warn")}>
          {card.estimate?.status === "confirmed"
            ? `${fmtRub(card.estimate.amountRub)}, версия ${card.estimate.version}`
            : cost.text}
        </p>
        {card.estimate?.note ? (
          <p className="mt-1 text-meta text-text-3">{card.estimate.note}</p>
        ) : null}
        {card.days.length > 1 ? (
          <p className="mt-2 text-meta text-text-2">
            Требует согласования: по объекту работали несколько дней, как распределять стоимость по
            дням и бригадам: открытый вопрос ТЗ. Сумма не распределяется.
          </p>
        ) : null}
      </section>
      <section>
        <h3 className="text-meta-strong text-text-2">Записи времени</h3>
        <ul className="mt-1 divide-y divide-line">
          {card.entries.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block text-body tnum">
                  {entry.number} · {fmtShortDay(entry.day)}
                </span>
                <span className="block text-meta text-text-3 tnum">
                  {entry.minutes} мин · <SourceMark source={entry.source} />
                </span>
              </span>
              <span className="shrink-0 text-body-strong tnum">
                {entry.amountRub === null ? "нет суммы" : fmtRub(entry.amountRub)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
  const eyebrow = `${card.object.code} · ${card.object.workType ?? "вид работ не указан"}`;
  return desktop ? (
    <SidePanel
      open
      onOpenChange={(next) => (next ? undefined : onClose())}
      eyebrow={eyebrow}
      title={card.object.label}
    >
      {body}
    </SidePanel>
  ) : (
    <Sheet
      open
      onOpenChange={(next) => (next ? undefined : onClose())}
      id="object"
      size="full"
      eyebrow={eyebrow}
      title={card.object.label}
    >
      {body}
    </Sheet>
  );
}
