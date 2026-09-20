import { createFileRoute } from "@tanstack/react-router";
import { employeeRoleLabel, type EmployeeRole } from "@/contracts";
import { ACCESS, MATRIX_ROLES, SECTIONS, sectionLabel, type Section } from "@/api/access";
import { StatusBadge } from "@/components/common/StatusBadge";

export const Route = createFileRoute("/access")({
  head: () => ({
    meta: [
      { title: "Права доступа — neeklo FieldOps" },
      {
        name: "description",
        content:
          "Матрица прав: разделы в строках, роли в столбцах — запись, чтение или нет доступа.",
      },
    ],
  }),
  component: AccessPage,
});

type Cell = { text: string; tone: "ok" | "neutral" | "muted" };

/** Ячейка матрицы: уровень и область «свои объекты» */
function cellOf(role: EmployeeRole, section: Section): Cell {
  const grant = ACCESS[role][section];
  const own = grant.own ? ", свои объекты" : "";
  if (grant.level === "write") return { text: `Запись${own}`, tone: "ok" };
  if (grant.level === "read") return { text: `Чтение${own}`, tone: "neutral" };
  return { text: "Нет доступа", tone: "muted" };
}

function CellText({ cell }: { cell: Cell }) {
  if (cell.tone === "muted") return <span className="text-text-3">{cell.text}</span>;
  return <StatusBadge tone={cell.tone}>{cell.text}</StatusBadge>;
}

/**
 * Матрица прав (ADR-012, п. 7): та же таблица, что проверяют серверные функции и адаптер.
 * Только чтение: права, которые меняются без кода, требуют хранения и журнала изменений.
 */
function AccessPage() {
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="sr-only">Права доступа</h1>
        <p className="text-[13px] text-text-2">
          Что может каждая роль в каждом разделе. Эту же таблицу проверяет сервер при каждом
          действии: без права запись отклоняется, раздел не открывается, кнопка не показывается.
        </p>
      </div>

      {/* Таблица длиннее экрана: область фокусируема, иначе прокрутить её с клавиатуры нечем */}
      <div
        tabIndex={0}
        role="region"
        aria-label="Матрица прав"
        className="focus-ring card-surface hidden overflow-x-auto lg:block"
      >
        <table className="w-full text-table">
          <caption className="sr-only">Права ролей по разделам</caption>
          <thead>
            <tr className="h-10 border-b border-line text-left">
              <th scope="col" className="px-4 text-[12px] font-normal text-text-3">
                Раздел
              </th>
              {MATRIX_ROLES.map((role) => (
                <th key={role} scope="col" className="px-4 text-[12px] font-normal text-text-3">
                  {employeeRoleLabel[role]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SECTIONS.map((section) => (
              <tr key={section} className="h-12 border-b border-line last:border-0">
                <th scope="row" className="px-4 py-2 text-left font-medium text-text">
                  {sectionLabel[section]}
                </th>
                {MATRIX_ROLES.map((role) => (
                  <td key={role} className="px-4 py-2 align-middle">
                    <CellText cell={cellOf(role, section)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Телефон: раздел — карточка, роли — строки. Список фокусируемый: на экране нет ни одной
          ссылки, и без этого прокрутить его с клавиатуры было бы нечем */}
      <ul
        tabIndex={0}
        className="focus-ring grid gap-3 rounded-[var(--r-md)] lg:hidden"
        aria-label="Права ролей по разделам"
      >
        {SECTIONS.map((section) => (
          <li key={section} className="card-surface px-4 py-3">
            <h2 className="text-[14px] font-medium text-text">{sectionLabel[section]}</h2>
            <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-[13px]">
              {MATRIX_ROLES.map((role) => (
                <div key={role} className="contents">
                  <dt className="text-text-2">{employeeRoleLabel[role]}</dt>
                  <dd className="text-right">
                    <CellText cell={cellOf(role, section)} />
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
