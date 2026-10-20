import { completePageHead } from "@/lib/page-head";
import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { WidgetCard, WidgetCardHeader } from "@/components/common/WidgetCard";
import { WidgetTable, type WidgetColumn } from "@/components/common/WidgetTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { HoursCell, Num, SourceMark } from "@/components/gas-ops/marks";
import { useGasEmployees, type EmployeeRow } from "@/api/gas-ops";

/**
 * Сотрудники бригад (ТЗ, п. 11). Сотрудник отделён от бригады: в бригаде 7 два человека,
 * часы складываются, а сумма числится за одним — поэтому в отчёте она не удваивается.
 *
 * Идентификатор MAX показан как имитация: канал не подключён.
 */
export const Route = createFileRoute("/gas/employees")({
  head: () =>
    completePageHead(
      { meta: [{ title: "Сотрудники — гайка" }] },
      "Сотрудники — гайка",
      "Состав бригад, роли и связанные записи времени.",
    ),
  component: EmployeesPage,
});

function EmployeesPage() {
  const rows = useGasEmployees();

  const columns: WidgetColumn<EmployeeRow>[] = [
    { key: "name", header: "Сотрудник", cell: (row) => row.name },
    { key: "brigade", header: "Бригада", cell: (row) => row.brigadeName },
    {
      key: "role",
      header: "Роль",
      cell: (row) => (
        <StatusBadge tone={row.isLead ? "accent" : "neutral"}>
          {row.isLead ? "Бригадир" : "В составе"}
        </StatusBadge>
      ),
    },
    {
      key: "max",
      header: "MAX ID",
      cell: (row) => (
        <span className="flex items-center gap-2">
          <Num className="text-text-3">{row.maxId ?? "—"}</Num>
          <StatusBadge tone="warn">имитация</StatusBadge>
        </span>
      ),
    },
    { key: "entries", header: "Записей", align: "right", cell: (row) => <Num>{row.entries}</Num> },
    {
      key: "hours",
      header: "Часы",
      align: "right",
      cell: (row) => <HoursCell minutes={row.minutes} />,
    },
    { key: "source", header: "Данные", cell: (row) => <SourceMark source={row.source} /> },
  ];

  return (
    <div className="flex flex-col gap-6">
      <WidgetCard>
        <WidgetCardHeader
          icon={Users}
          title="Сотрудники"
          hint={`${rows.length} человек и составов бригад`}
          level={2}
        />
        <div className="mt-4">
          <WidgetTable columns={columns} rows={rows} />
        </div>
      </WidgetCard>

      <p className="text-[13px] text-text-3">
        ФИО обезличены: в отчёте заказчика они настоящие, в прототип перенесены роли. Идентификатор
        в MAX показан как имитация — канал не подключён, ни одного сообщения система не отправляет.
      </p>
    </div>
  );
}
