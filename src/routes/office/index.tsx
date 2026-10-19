import { completePageHead } from "@/lib/page-head";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, ChevronRight, PlugZap } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { useAccess } from "@/api/access";

/**
 * Обзор кабинета: только то, что работает (ADR-039). Разделы, описанные в ADR и ещё
 * не сделанные, здесь не обещаются.
 */
export const Route = createFileRoute("/office/")({
  head: () =>
    completePageHead(
      { meta: [{ title: "Кабинет компании — гайка" }] },
      "Кабинет компании — гайка",
      "Управление справочниками и подключениями.",
    ),
  component: OfficeHome,
});

const sections = [
  {
    to: "/office/catalogs",
    section: "catalogs",
    icon: BookOpen,
    title: "Справочники",
    text: "Номенклатура материалов, синонимы и категории: из них гайка выбирает, а не угадывает.",
  },
  {
    to: "/office/connections",
    section: "office",
    icon: PlugZap,
    title: "Подключения",
    text: "Модель разбора, распознавание речи, Telegram и вход по телефону: что включено сейчас.",
  },
] as const;

function OfficeHome() {
  const { can } = useAccess();
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Кабинет компании"
        description="Данные, которые читает полевое приложение: здесь их настраивают, на объекте ими пользуются."
      />
      <ul className="grid gap-3 md:grid-cols-2">
        {sections
          .filter((section) => can(section.section))
          .map((section) => (
            <li key={section.to}>
              <Link
                to={section.to}
                className="focus-ring press flex min-h-[120px] items-start gap-4 rounded-[var(--r-lg)] bg-surface p-6"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-[var(--r-sm)] bg-surface-2">
                  <section.icon className="size-5 text-text-2" strokeWidth={1.5} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-card-title">{section.title}</span>
                  <span className="mt-1 block text-body text-text-2">{section.text}</span>
                </span>
                <ChevronRight className="mt-2 size-4 shrink-0 text-text-3" />
              </Link>
            </li>
          ))}
      </ul>
    </div>
  );
}
