import { buildXlsx } from "@/adapters/export/xlsx";
import type { TeamPerson } from "@/domain/work-progress";

/** Выгрузка команды объекта в Excel: те же колонки, что на экране (TASK-A2) */
export function exportTeam(project: string, people: TeamPerson[]) {
  return buildXlsx(
    [
      { header: "Объект", width: 28, value: () => project },
      { header: "Сотрудник", width: 26, value: (row: TeamPerson) => row.name },
      { header: "Должность", width: 22, value: (row: TeamPerson) => row.position },
      { header: "Бригада", width: 20, value: (row: TeamPerson) => row.crewName ?? "—" },
      { header: "Телефон", width: 18, value: (row: TeamPerson) => row.phone },
      { header: "Telegram", width: 18, value: (row: TeamPerson) => row.telegram ?? "—" },
      {
        header: "Последний отчёт",
        width: 30,
        value: (row: TeamPerson) =>
          row.lastReport ? `${row.lastReport.at.slice(0, 10)} · ${row.lastReport.zoneName}` : "—",
      },
      { header: "Объектов", width: 12, value: (row: TeamPerson) => String(row.projectCount) },
    ],
    people,
  );
}

export function teamFileName(projectCode: string, date = new Date()) {
  return `Команда_${projectCode}_${date.toISOString().slice(0, 10)}.xlsx`;
}
