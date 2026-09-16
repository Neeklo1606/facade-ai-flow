import { createFileRoute } from "@tanstack/react-router";
import { ProjectChooser } from "@/components/project/ProjectChooser";

export const Route = createFileRoute("/field-reports")({
  head: () => ({ meta: [{ title: "Отчёты с площадки — neeklo FieldOps" }] }),
  component: () => (
    <ProjectChooser
      title="Отчёты с площадки"
      description="Отчёты прорабов ведутся по объекту. Выберите объект, чтобы проверить отчёты за смену."
      section="field-reports"
      metric={(o) => [
        { label: "Нет отчёта", value: o.missingReports },
        { label: "Позиций", value: o.specTotal },
        { label: "Изменений", value: o.openChanges },
      ]}
    />
  ),
});
