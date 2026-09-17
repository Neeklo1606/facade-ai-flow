import { Construction } from "lucide-react";
import { InsightBlock } from "./InsightBlock";
import { PageHeader } from "./PageHeader";
import { Panel } from "./Panel";

/** Экран-заглушка: каркас готов, содержимое приходит следующими шагами. */
export function PagePlaceholder({
  title,
  description,
  planned,
}: {
  title: string;
  description: string;
  planned: string[];
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <Panel title="Что будет на экране" data-main-zone>
        <ul className="grid gap-2 sm:grid-cols-2">
          {planned.map((p) => (
            <li
              key={p}
              className="flex items-start gap-2 rounded-md border border-border bg-subtle px-3 py-2 text-[13px]"
            >
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-text-3" aria-hidden />
              <span className="min-w-0">{p}</span>
            </li>
          ))}
        </ul>
      </Panel>
      <InsightBlock
        className="mt-4"
        icon={Construction}
        title="Раздел в работе"
        text="Данные появятся здесь без изменения структуры навигации и модели данных."
      />
    </>
  );
}
