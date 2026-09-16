import { createFileRoute } from "@tanstack/react-router";
import { ProjectChooser } from "@/components/project/ProjectChooser";

export const Route = createFileRoute("/materials")({
  head: () => ({ meta: [{ title: "Материалы — neeklo FieldOps" }] }),
  component: () => (
    <ProjectChooser
      title="Материалы"
      description="Реестр материалов ведётся по объекту. Выберите, по какому объекту смотреть, что требуется купить."
      section="materials"
      metric={(o) => [
        { label: "Позиций", value: o.specTotal },
        { label: "Проверено", value: o.specTotal - o.specUnverified },
        { label: "В закупке", value: o.inRequests },
      ]}
    />
  ),
});
