import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Check, Search } from "lucide-react";
import { employeeRoleLabel, type EmployeeRole } from "@/contracts";
import { helpArticles, searchHelp, sortForRole, type HelpArticle } from "@/lib/help/articles";
import { useCurrentUser } from "@/lib/project-scope";
import { EmptyState, WidgetCard } from "@/components/common";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/help")({
  /** Адрес статьи можно отправить коллеге: `/help?article=delivery` */
  validateSearch: (search: Record<string, unknown>): { article?: string } => {
    const id = typeof search["article"] === "string" ? search["article"] : undefined;
    return id && helpArticles.some((item) => item.id === id) ? { article: id } : {};
  },
  head: () => ({
    meta: [
      { title: "Справка — neeklo FieldOps" },
      {
        name: "description",
        content:
          "Как работать в системе: загрузка документации, запросы поставщикам, приёмка, отчёты с площадки, права и частые вопросы.",
      },
    ],
  }),
  component: HelpPage,
});

/**
 * Справка (ADR-019): статьи по задачам, а не по экранам. Шаги ведут на живой экран —
 * снимок устарел бы в день выпуска. Статьи роли идут первыми, но ничего не прячется.
 */
function HelpPage() {
  const user = useCurrentUser();
  const search = Route.useSearch();
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(
    search.article ?? helpArticles[0]?.id ?? null,
  );

  const role: EmployeeRole | null = user?.role ?? null;
  const found = useMemo(() => sortForRole(searchHelp(query), role), [query, role]);
  const article = found.find((item) => item.id === openId) ?? found[0] ?? null;

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="sr-only">Справка</h1>
        <p className="text-[13px] leading-[1.5] text-text-2">
          Как работать в системе — по задачам, а не по экранам. Шаги ведут на живой экран
          демонстрации: можно читать и сразу делать.
          {role && ` Ваша роль — ${employeeRoleLabel[role].toLowerCase()}, её статьи сверху.`}
        </p>
      </div>

      <label className="relative block max-w-[420px]">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-3"
          strokeWidth={1.5}
          aria-hidden
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск по справке: приёмка, запрос, объём…"
          aria-label="Поиск по справке"
          className="pl-9"
        />
      </label>

      {found.length === 0 ? (
        <WidgetCard>
          <EmptyState
            icon={BookOpen}
            variant="filtered"
            title="По этому запросу статей нет"
            description="Поиск идёт по заголовку, цели, шагам и ключевым словам. Попробуйте одно слово: приёмка, запрос, объём, роли."
            actionLabel="Показать все статьи"
            onAction={() => setQuery("")}
          />
        </WidgetCard>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr] lg:items-start">
          <nav aria-label="Статьи справки" className="grid gap-1.5">
            {found.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setOpenId(item.id)}
                aria-current={article?.id === item.id ? "true" : undefined}
                className={cn(
                  "focus-ring min-h-11 rounded-[var(--r-sm)] border px-3 py-2.5 text-left transition-fast",
                  article?.id === item.id
                    ? "border-line-2 bg-surface-2"
                    : "border-line is-hover:bg-surface-2",
                )}
              >
                <span className="block text-[14px] leading-[1.35] font-medium text-text">
                  {item.title}
                </span>
                <span className="mt-0.5 block text-[12px] leading-[1.4] text-text-3">
                  {item.roles.map((role) => employeeRoleLabel[role]).join(", ")}
                </span>
              </button>
            ))}
          </nav>

          {article && <ArticleView article={article} />}
        </div>
      )}
    </div>
  );
}

function ArticleView({ article }: { article: HelpArticle }) {
  return (
    <WidgetCard>
      <article className="grid gap-4">
        <header>
          <h2 className="text-[18px] leading-[1.25] font-semibold text-text">{article.title}</h2>
          <p className="mt-1 text-[14px] leading-[1.45] text-text-2">{article.goal}</p>
        </header>

        <ol className="grid gap-2.5">
          {article.steps.map((step, index) => (
            <li key={step.text} className="flex gap-3">
              <span className="tnum mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-line text-[12px] text-text-3">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] leading-[1.5] text-text">{step.text}</span>
                {step.to && (
                  <Link
                    to={step.to as string}
                    search={{}}
                    className="focus-ring mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-[var(--r-xs)] text-[13px] font-medium text-text-2 transition-fast is-hover:text-text lg:min-h-0"
                  >
                    Открыть экран <ArrowRight className="size-3.5" strokeWidth={1.75} aria-hidden />
                  </Link>
                )}
              </span>
            </li>
          ))}
        </ol>

        <div className="grid gap-2 rounded-[var(--r-sm)] border border-line bg-surface-2 p-3">
          <p className="flex gap-2 text-[13px] leading-[1.45] text-text">
            <Check className="mt-0.5 size-4 shrink-0 text-ok" strokeWidth={2} aria-hidden />
            <span>
              <span className="font-medium">Что проверить: </span>
              {article.check}
            </span>
          </p>
          <p className="text-[13px] leading-[1.45] text-text-2">
            <span className="font-medium text-text">Куда дальше: </span>
            {article.next}
          </p>
        </div>
      </article>
    </WidgetCard>
  );
}
