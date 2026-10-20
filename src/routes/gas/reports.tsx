import { completePageHead } from "@/lib/page-head";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Download, FileSpreadsheet, TriangleAlert } from "lucide-react";
import { PillTabs } from "@/components/common/PillTabs";
import { StatusBadge } from "@/components/common/StatusBadge";
import { WidgetCard, WidgetCardHeader } from "@/components/common/WidgetCard";
import { WidgetTable, type WidgetColumn } from "@/components/common/WidgetTable";
import { CustomerReport } from "@/components/gas-ops/CustomerReport";
import {
  EntryStatusBadge,
  HoursCell,
  MoneyCell,
  Num,
  RateCell,
  SourceMark,
} from "@/components/gas-ops/marks";
import { Button } from "@/components/ui/button";
import {
  fmtHours,
  fmtRate,
  fmtRub,
  useGasReport,
  type AnalyticRow,
  type ReportMode,
} from "@/api/gas-ops";
import { downloadCustomerXlsx } from "@/lib/gas-ops/export";
import { fmtDate } from "@/lib/format";
import { toast } from "@/lib/toast";

/**
 * Недельный отчёт (ТЗ, п. 9). Два вида: структура файла заказчика и плоская таблица
 * с фильтрами. Переключатель «только подтверждённые / предварительный» помечает,
 * что именно показано.
 */
export const Route = createFileRoute("/gas/reports")({
  head: () =>
    completePageHead(
      { meta: [{ title: "Недельный отчёт — гайка" }] },
      "Недельный отчёт — гайка",
      "Отчёт в формате заказчика и аналитическая таблица с выгрузкой XLSX.",
    ),
  component: ReportsPage,
});

type View = "customer" | "analytic";

function ReportsPage() {
  const [view, setView] = useState<View>("customer");
  const [mode, setMode] = useState<ReportMode>("confirmed");
  const [busy, setBusy] = useState(false);

  const report = useGasReport(mode);
  const { rows, analytic: flat, days, week } = report;
  const total = rows.find((row) => row.id === "total");

  const columns: WidgetColumn<AnalyticRow & { id: string }>[] = [
    { key: "day", header: "Дата", cell: (row) => <Num>{fmtDate(row.day)}</Num> },
    { key: "group", header: "Подразделение", cell: (row) => row.groupName },
    { key: "brigade", header: "Бригада", cell: (row) => row.brigadeName },
    { key: "employee", header: "Сотрудник", cell: (row) => row.employeeName },
    { key: "object", header: "Объект", cell: (row) => row.objectLabel },
    { key: "work", header: "Вид работ", cell: (row) => row.workType ?? "—" },
    {
      key: "minutes",
      header: "Минуты",
      align: "right",
      cell: (row) => <Num>{row.minutes}</Num>,
    },
    {
      key: "hours",
      header: "Часы",
      align: "right",
      cell: (row) => <HoursCell minutes={row.minutes} />,
    },
    {
      key: "amount",
      header: "Сумма",
      align: "right",
      cell: (row) => <MoneyCell value={row.amountRub} />,
    },
    {
      key: "rate",
      header: "Доходность",
      align: "right",
      cell: (row) => <RateCell value={row.revenue} />,
    },
    { key: "status", header: "Статус", cell: (row) => <EntryStatusBadge status={row.status} /> },
    { key: "source", header: "Данные", cell: (row) => <SourceMark source={row.source} /> },
  ];

  const exportFile = async () => {
    setBusy(true);
    try {
      const name = await downloadCustomerXlsx({ rows, analytic: flat, days, week, mode });
      toast.success("Файл выгружен", { description: name });
    } catch (error) {
      toast.error("Выгрузка не удалась", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* На телефоне наборы вкладок прокручиваются внутри себя, а не уезжают за край */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="-mx-1 overflow-x-auto px-1">
          <PillTabs
            label="Вид отчёта"
            variant="primary"
            value={view}
            onChange={setView}
            tabs={[
              { value: "customer", label: "Формат заказчика" },
              { value: "analytic", label: "Аналитическая таблица", count: flat.length },
            ]}
          />
        </div>
        <div className="-mx-1 overflow-x-auto px-1">
          <PillTabs
            label="Что включено"
            value={mode}
            onChange={setMode}
            tabs={[
              { value: "confirmed", label: "Только подтверждённые" },
              { value: "preliminary", label: "Предварительный" },
            ]}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void exportFile()}
          className="self-start lg:ms-auto"
        >
          <Download className="size-4" aria-hidden />
          {busy ? "Готовлю файл" : "Выгрузить XLSX"}
        </Button>
      </div>

      {mode === "preliminary" && (
        <p className="flex flex-wrap items-center gap-2 rounded-[var(--r-sm)] border border-warn/40 bg-warn-bg px-4 py-3 text-[13px]">
          <StatusBadge tone="warn">Предварительный отчёт</StatusBadge>
          <span className="text-text-2">
            В него включены записи, которые ещё не проверил человек. В утверждённый отчёт идут
            только подтверждённые.
          </span>
        </p>
      )}

      <WidgetCard>
        <WidgetCardHeader
          icon={FileSpreadsheet}
          title={view === "customer" ? "Формат заказчика" : "Аналитическая таблица"}
          hint={`Неделя ${fmtDate(week.from)} — ${fmtDate(week.to)}, записей в отчёте: ${report.count}`}
          level={2}
        />

        {/* Итог строкой под заголовком: справа от названия он на телефоне ломал шапку карточки */}
        {total && (
          <p className="mt-2 text-[13px] tabular-nums text-text-2">
            Итог недели: {fmtRub(total.total.amountRub ?? 0)} ·{" "}
            {fmtHours((total.total.minutes ?? 0) / 60)} · {fmtRate(total.total.revenue)}
          </p>
        )}

        <div className="mt-4">
          {view === "customer" ? (
            <CustomerReport rows={rows} days={days} />
          ) : (
            <WidgetTable
              columns={columns}
              rows={flat.map((row) => ({ ...row, id: row.entryId }))}
            />
          )}
        </div>
      </WidgetCard>

      <div className="rounded-[var(--r-md)] border border-line bg-surface p-4 text-[13px] text-text-2">
        <p className="flex items-center gap-2 font-medium text-text">
          <TriangleAlert className="size-4 text-warn" aria-hidden />
          Чем этот отчёт отличается от файла заказчика
        </p>
        <ul className="mt-2 flex list-disc flex-col gap-1 ps-5">
          <li>
            Итоги считаются снизу вверх, из адресных строк. Числа из файла в расчёт не берутся:
            иначе ошибка выгрузки стала бы правдой системы.
          </li>
          <li>
            Доходность считается от минут, а не от округлённых часов: 44 847 ₽ за 395 мин это 6 812
            ₽/ч, а не 6 816 ₽/ч.
          </li>
          <li>
            Сумма видимых строк недели — 1 524 132 ₽. В строке «Итого» файла стоит 5 165 357 ₽: в
            выгрузку не попали подразделения 2 и 4. Разница по дням сходится точно; это вопрос к
            заказчику, а не расхождение расчёта.
          </li>
          <li>Строка рамки смены показывает границу дня и не несёт денег и часов работы.</li>
        </ul>
      </div>
    </div>
  );
}
