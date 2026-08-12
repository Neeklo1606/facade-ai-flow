import { Construction } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";

export function PagePlaceholder({
  title,
  description,
  note,
}: {
  title: string;
  description: string;
  note?: string;
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="card-surface">
        <EmptyState
          icon={Construction}
          title="Экран в разработке"
          description={note ?? "Раздел появится на следующем шаге прототипа. Дизайн-система и данные уже готовы."}
          actionLabel="Вернуться к дашборду"
        />
      </div>
    </>
  );
}
