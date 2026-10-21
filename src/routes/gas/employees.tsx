import { completePageHead } from "@/lib/page-head";
import { ScreenHint } from "@/components/gas-ops/page";
import { createFileRoute } from "@tanstack/react-router";
import { ListRow } from "@/components/ui/kit/list";
import { SourceMark } from "@/components/gas-ops/marks";
import { fmtHours, useGasEmployees } from "@/api/gas-ops";
import { plural } from "@/lib/format";

/**
 * Сотрудники бригад (ТЗ, п. 11). Сотрудник отделён от бригады: в бригаде 7 два человека,
 * часы складываются, а сумма числится за одним — поэтому в отчёте она не удваивается.
 *
 * Идентификатор MAX показан как имитация: канал не подключён. Вид ADR-045, 5.11: строки
 * с ролью и бригадой, справа часы и число записей.
 */
export const Route = createFileRoute("/gas/employees")({
  head: () =>
    completePageHead(
      { meta: [{ title: "Сотрудники — Учёт выработки бригад" }] },
      "Сотрудники — Учёт выработки бригад",
      "Состав бригад, роли и связанные записи времени.",
    ),
  component: EmployeesPage,
});

function EmployeesPage() {
  const rows = useGasEmployees();
  return (
    <div className="flex flex-col gap-block">
      <ScreenHint screen="employees" className="mb-0" />
      <p className="text-meta text-text-2 tnum">
        {rows.length} {plural(rows.length, "сотрудник", "сотрудника", "сотрудников")} и составов
        бригад
      </p>
      <ul className="surface-1 overflow-hidden [&>li+li]:border-t [&>li+li]:border-line">
        {rows.map((row) => (
          <li key={row.id}>
            <ListRow
              leading={
                <span className="avatar bg-surface-2 text-text-2" aria-hidden>
                  {row.name.slice(0, 1)}
                </span>
              }
              title={row.name}
              meta={
                <>
                  {row.isLead ? "Бригадир" : "В составе"} · {row.brigadeName} · MAX{" "}
                  {row.maxId ?? "—"} (имитация)
                </>
              }
              value={row.minutes ? fmtHours(row.minutes / 60) : "—"}
              valueMeta={
                <>
                  {row.entries} {plural(row.entries, "запись", "записи", "записей")} ·{" "}
                  <SourceMark source={row.source} />
                </>
              }
            />
          </li>
        ))}
      </ul>
      <p className="text-meta text-text-3">
        ФИО обезличены: в отчёте заказчика они настоящие, в прототип перенесены роли. Идентификатор
        в MAX показан как имитация: канал не подключён, ни одного сообщения система не отправляет.
      </p>
    </div>
  );
}
