import { completePageHead } from "@/lib/page-head";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Building2, Search } from "lucide-react";
import { WidgetCard, WidgetCardHeader } from "@/components/common/WidgetCard";
import { WidgetTable, type WidgetColumn } from "@/components/common/WidgetTable";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  FlagList,
  HoursCell,
  MoneyCell,
  Num,
  RateCell,
  SourceMark,
} from "@/components/gas-ops/marks";
import { Button } from "@/components/ui/button";
import { fmtHours, fmtRub, useGasObjects, type ObjectCard } from "@/api/gas-ops";
import { fmtDate, plural } from "@/lib/format";

/**
 * Реестр объектов (ТЗ, п. 8). Адрес не единственный ключ: у объекта есть номер.
 * Наличие подтверждённой стоимости видно сразу — по объектам без неё доходность не считается.
 */
export const Route = createFileRoute("/gas/objects")({
  head: () =>
    completePageHead(
      { meta: [{ title: "Объекты — гайка" }] },
      "Объекты — гайка",
      "Реестр объектов: адрес, вид работ, бригады, стоимость и записи времени.",
    ),
  component: ObjectsPage,
});

interface Row {
  id: string;
  code: string;
  label: string;
  settlement: string;
  workType: string;
  brigades: string;
  days: number;
  minutes: number;
  amountRub: number | null;
  revenue: number | null;
  estimate: string;
  card: ObjectCard;
}

function ObjectsPage() {
  const cards = useGasObjects();
  const [search, setSearch] = useState("");
  const [onlyWithoutEstimate, setOnlyWithoutEstimate] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const rows: Row[] = useMemo(
    () =>
      cards
        .filter((card) => (onlyWithoutEstimate ? card.estimate?.status !== "confirmed" : true))
        .filter((card) =>
          search.trim()
            ? card.object.label.toLowerCase().includes(search.trim().toLowerCase()) ||
              card.object.code.toLowerCase().includes(search.trim().toLowerCase())
            : true,
        )
        .map((card) => ({
          id: card.object.id,
          code: card.object.code,
          label: card.object.label,
          settlement: card.object.settlement ?? "—",
          workType: card.object.workType ?? "не указан",
          brigades: card.brigades.map((b) => b.name).join(", ") || "—",
          days: card.days.length,
          minutes: card.totals.minutes,
          amountRub: card.totals.amountRub === 0 ? null : card.totals.amountRub,
          revenue: card.totals.revenuePerHour,
          estimate:
            card.estimate?.status === "confirmed"
              ? `${fmtRub(card.estimate.amountRub)}`
              : card.estimate?.status === "manual-pending"
                ? "ждёт ручного ввода"
                : "не передана",
          card,
        })),
    [cards, search, onlyWithoutEstimate],
  );

  /* Колонки парами: номер с адресом, дни с часами, сумма с доходностью. Одиннадцать
     столбцов ломали числа на две строки и читались по складам */
  const columns: WidgetColumn<Row>[] = [
    {
      key: "object",
      header: "Объект",
      cell: (row) => (
        <span className="block min-w-[220px]">
          <span className="block">{row.label}</span>
          <span className="block text-text-3">
            <Num>{row.code}</Num>
            {row.workType === "не указан" ? "" : ` · ${row.workType}`}
          </span>
        </span>
      ),
    },
    { key: "brigades", header: "Бригады", cell: (row) => row.brigades },
    {
      key: "time",
      header: "Дней и часов",
      align: "right",
      cell: (row) => (
        <span className="block whitespace-nowrap">
          <Num className="block">
            {row.days} {plural(row.days, "день", "дня", "дней")}
          </Num>
          <span className="block text-text-3">
            <HoursCell minutes={row.minutes} />
          </span>
        </span>
      ),
    },
    {
      key: "money",
      header: "Начислено и доходность",
      align: "right",
      cell: (row) => (
        <span className="block whitespace-nowrap">
          <MoneyCell value={row.amountRub} />
          <span className="block text-text-3">
            <RateCell value={row.revenue} />
          </span>
        </span>
      ),
    },
    {
      key: "estimate",
      header: "Стоимость работ",
      cell: (row) => <span className="whitespace-nowrap">{row.estimate}</span>,
    },
    {
      key: "flags",
      header: "Признаки",
      cell: (row) => (
        <span className="flex flex-col items-start gap-1">
          <FlagList flags={row.card.flags} />
          <SourceMark source={row.card.object.source} />
        </span>
      ),
    },
  ];

  const current = cards.find((card) => card.object.id === open) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <WidgetCard>
        <WidgetCardHeader
          icon={Building2}
          title="Объекты"
          hint={`${rows.length} ${plural(rows.length, "объект", "объекта", "объектов")} из ${cards.length}`}
          level={2}
        />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="relative block min-w-[260px] flex-1">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-text-3"
              aria-hidden
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Адрес или номер объекта"
              aria-label="Поиск объекта"
              className="h-12 w-full rounded-[var(--r-sm)] border border-line bg-surface ps-9 pe-3 text-[13px] focus-ring sm:h-10"
            />
          </label>
          <Button
            variant={onlyWithoutEstimate ? "default" : "outline"}
            size="sm"
            aria-pressed={onlyWithoutEstimate}
            onClick={() => setOnlyWithoutEstimate((value) => !value)}
            className="min-h-12 w-full sm:min-h-10 sm:w-auto"
          >
            Без подтверждённой стоимости
          </Button>
        </div>
        <div className="mt-4">
          {rows.length === 0 ? (
            <EmptyState variant="filtered" title="Ничего не найдено" />
          ) : (
            <WidgetTable columns={columns} rows={rows} onRowClick={(row) => setOpen(row.id)} />
          )}
        </div>
      </WidgetCard>

      {current && (
        <WidgetCard>
          <WidgetCardHeader
            icon={Building2}
            title={current.object.label}
            hint={`${current.object.code} · ${current.object.workType ?? "вид работ не указан"}`}
            level={2}
            aside={
              <Button variant="ghost" size="sm" onClick={() => setOpen(null)}>
                Закрыть
              </Button>
            }
          />
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <dl className="text-[13px]">
              <Line label="Населённый пункт">{current.object.settlement ?? "—"}</Line>
              <Line label="Бригады">{current.brigades.map((b) => b.name).join(", ") || "—"}</Line>
              <Line label="Дней в работе">{current.days.length}</Line>
              <Line label="Подтверждено">
                {fmtRub(current.totals.amountRub)} · {fmtHours(current.totals.hours)}
              </Line>
              <Line label="Стоимость работ">
                {current.estimate?.status === "confirmed"
                  ? `${fmtRub(current.estimate.amountRub)}, версия ${current.estimate.version}`
                  : current.estimate?.status === "manual-pending"
                    ? "ждёт ручного ввода менеджером"
                    : "не передана"}
              </Line>
            </dl>
            <div>
              <p className="text-[13px] font-medium">Записи времени</p>
              <ul className="mt-2 flex flex-col gap-2">
                {current.entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-center gap-2 rounded-[var(--r-sm)] bg-surface-2 p-2 text-[13px]"
                  >
                    <Num>{entry.number}</Num>
                    <Num className="text-text-3">{fmtDate(entry.day)}</Num>
                    <span>{entry.minutes} мин</span>
                    <MoneyCell value={entry.amountRub} />
                    <SourceMark source={entry.source} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {current.days.length > 1 && (
            <p className="mt-4 flex flex-wrap items-center gap-2 text-[13px]">
              <StatusBadge tone="warn">Требует согласования</StatusBadge>
              <span className="text-text-2">
                По объекту работали несколько дней. Как распределять стоимость объекта по дням и
                бригадам — открытый вопрос ТЗ. Сумма не распределяется.
              </span>
            </p>
          )}
        </WidgetCard>
      )}
    </div>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line py-2 last:border-0">
      <dt className="text-text-3">{label}</dt>
      <dd className="text-end tabular-nums">{children}</dd>
    </div>
  );
}
