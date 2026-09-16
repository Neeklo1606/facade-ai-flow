import { createFileRoute } from "@tanstack/react-router";
import { ProjectChooser } from "@/components/project/ProjectChooser";

export const Route = createFileRoute("/audit")({
  head: () => ({ meta: [{ title: "История и решения — neeklo FieldOps" }] }),
  component: () => (
    <ProjectChooser
      title="История и решения"
      description="История ведётся по объекту. Выберите объект, чтобы увидеть события и принятые решения."
      section="timeline"
      metric={(o) => [
        { label: "Запросов", value: o.activeRequests },
        { label: "Изменений", value: o.openChanges },
        { label: "Заказано", value: o.ordered },
      ]}
    />
  ),
});
