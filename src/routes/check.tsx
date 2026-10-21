import { completePageHead } from "@/lib/page-head";
import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, ClipboardCheck, FileSearch } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/common";
import { ScreenGate, ScreenSkeleton } from "@/components/common/ScreenStates";
import { PageCaption } from "@/components/layout/PageActions";
import { CheckSheet } from "@/components/check/CheckSheet";
import { FactCard } from "@/components/check/FactCard";
import { FactDetail } from "@/components/check/FactDetail";
import { ShiftFiles } from "@/components/check/ShiftFiles";
import { dayLabel, useIsDesktop, type FactRow } from "@/components/check/model";
import { useCheckQueue } from "@/api/check";
import { queries } from "@/api/queries";
import { prefetch } from "@/api/prefetch";
import { useAccess } from "@/api/access";
import { useNow } from "@/api/clock";
import { fmtDayTitle, fmtNum, plural } from "@/lib/format";
import { useScreenState } from "@/lib/screen-state";
import { legacyModulesEnabled } from "@/lib/legacy-modules";
import { useGuide } from "@/lib/guide/store";
import { useProjectId } from "@/lib/project-scope";
import { cn } from "@/lib/utils";

type Tab = "facts" | "positions";
type Filter = "all" | "new";

/** Новым считается факт, пришедший за последние сутки по часам источника данных */
const FRESH_MS = 24 * 60 * 60 * 1000;

/**
 * «Проверка» — рабочий экран ПТО (ADR-028, п. 3): очередь фактов с площадки и объекты,
 * где ждут проверки позиции спецификации.
 *
 * Вид v3 (ADR-044): главная цифра очереди в тёплой шапке, вкладки капсулами, карточки фактов
 * как события календаря, детали — листом с плавающей капсулой решения (на десктопе — панелью
 * справа). Решение применяется сразу, отмена живёт 6 секунд.
 */
export const Route = createFileRoute("/check")({
  validateSearch: (search: Record<string, unknown>): { tab?: Tab | undefined } => ({
    tab: search["tab"] === "positions" ? "positions" : undefined,
  }),
  loader: async ({ context }) => {
    await prefetch(context.queryClient, queries.projects());
  },
  head: () =>
    completePageHead(
      {
        meta: [
          { title: "Проверка — гайка" },
          {
            name: "description",
            content: "Очередь проверки: факты с площадки и позиции спецификации, ждущие решения.",
          },
        ],
      },
      "Проверка — гайка",
      "Отчёты с площадки, ожидающие проверки человеком.",
    ),
  component: CheckPage,
});

function CheckPage() {
  const { tab = "facts" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const projectId = useProjectId();
  const data = useCheckQueue(projectId);
  const guide = useGuide();
  const now = useNow();
  const { can } = useAccess();
  const [filter, setFilter] = useState<Filter>("all");
  const queueProject = data.queue[0]?.card.report.projectId ?? null;
  const [lastProject, setLastProject] = useState<string | null>(null);
  useEffect(() => {
    if (queueProject) setLastProject(queueProject);
  }, [queueProject]);
  const statementProject = projectId ?? queueProject ?? lastProject;

  const screen = useScreenState({
    pending: data.pending,
    error: data.error,
    empty:
      !data.pending &&
      data.queue.length === 0 &&
      (!legacyModulesEnabled() || data.positions.length === 0),
  });

  const rows = chainFirst(data.queue, guide.chain.reportId);
  const nowMs = Date.parse(now);
  const fresh = rows.filter((row) => {
    const sent = Date.parse(row.card.report.sentAt);
    return Number.isFinite(sent) && nowMs - sent <= FRESH_MS;
  });
  const showTabs = can("documents") && legacyModulesEnabled();
  const count = data.queue.length;
  const shown = filter === "new" ? fresh : rows;

  /*
   * Десктоп: панель деталей справа на всю высоту, рядом с шапкой и очередью. Решённый факт
   * уходит из очереди, и панель сама переходит к следующему.
   */
  const desktop = useIsDesktop();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const factsTab = !(tab === "positions" && legacyModulesEnabled());
  const selected = shown.find((row) => row.card.report.id === selectedId) ?? shown[0] ?? null;
  const panel = desktop && factsTab && screen === "normal" ? selected : null;

  return (
    <div
      className={cn(
        "min-w-0",
        panel &&
          "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.85fr)] lg:items-start lg:gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,500px)]",
      )}
    >
      <div className="min-w-0">
        <PageHeader title="Проверка" />

        <PageCaption>
          <span className="truncate">
            {count > 0
              ? `Осталось ${fmtNum(count)} ${plural(count, "факт", "факта", "фактов")}`
              : "Очередь фактов пуста"}
          </span>
        </PageCaption>

        {/*
        Главная цифра экрана — сколько фактов ждёт решения. Рядом файлы смены: черновик
        ведомости объёмов — результат ПТО (ADR-037, сценарий 2). Объект берётся из чипа,
        а когда чип молчит — из очереди; последний объект запоминается, иначе кнопки
        исчезали ровно после приёмки последнего факта.
      */}
        <section
          aria-label="Очередь проверки"
          className="hero-field mb-5 p-5 sm:p-6 lg:p-7 xl:flex xl:items-end xl:justify-between xl:gap-8"
        >
          <div className="relative min-w-0">
            <span aria-hidden className="orb -top-14 -left-12 size-48" />
            <p className="flex items-end gap-3">
              {data.pending ? (
                <span aria-hidden className="h-12 w-20 animate-pulse rounded-[14px] bg-surface-2" />
              ) : (
                <span className="text-hero-num">{fmtNum(count)}</span>
              )}
              <span className="text-heading pb-1 text-text">
                {plural(count, "факт ждёт", "факта ждут", "фактов ждут")}
                <span className="block text-text-2">вашего решения</span>
              </span>
            </p>
            <p className="text-body mt-3 max-w-[48ch] text-text-2 lg:hidden">
              Свайп вправо принимает, влево возвращает на уточнение. Кнопки делают то же самое.
            </p>
            <p className="text-body mt-3 hidden max-w-[52ch] text-text-2 lg:block">
              Выберите факт в очереди: исходная фраза, поля и решение откроются справа.
            </p>
          </div>
          {statementProject ? (
            <div className="mt-5 xl:mt-0">
              <ShiftFiles projectId={statementProject} />
            </div>
          ) : null}
        </section>

        <div className="-mx-[var(--content-pad)] mb-5 overflow-x-auto px-[var(--content-pad)] [scrollbar-width:none] lg:mx-0 lg:px-0">
          <div className="flex w-max items-center gap-2">
            {/* Позиции спецификации живут в документации — модуле за флагом (ADR-034, п. 4) */}
            {showTabs ? (
              <Capsules
                label="Что проверяем"
                value={tab}
                onChange={(next) =>
                  navigate({
                    search: () => ({ tab: next === "positions" ? "positions" : undefined }),
                    replace: true,
                    resetScroll: false,
                  })
                }
                items={[
                  { value: "facts", label: "Факты", count: count },
                  { value: "positions", label: "Позиции", count: data.positions.length },
                ]}
              />
            ) : null}
            {tab === "facts" || !legacyModulesEnabled() ? (
              <Capsules
                label="Какие факты"
                value={filter}
                onChange={setFilter}
                items={[
                  { value: "all", label: "Все", count: rows.length },
                  { value: "new", label: "Новые", count: fresh.length, dot: fresh.length > 0 },
                ]}
              />
            ) : null}
          </div>
        </div>

        <ScreenGate
          state={screen}
          onRetry={data.refetch}
          skeleton={<ScreenSkeleton kind="feed" />}
          copy={{
            section: "Проверка",
            roles: "ПТО, руководителю проекта и директору",
            errorTitle: "Не удалось загрузить очередь",
            empty: {
              icon: ClipboardCheck,
              title: "Проверять нечего",
              description:
                "Факты с площадки и позиции спецификации, ждущие решения, появятся здесь сразу после поступления.",
            },
          }}
        >
          {tab === "positions" && legacyModulesEnabled() ? (
            <PositionsTab rows={data.positions} />
          ) : (
            <FactsQueue
              rows={shown}
              filtered={filter === "new"}
              onShowAll={() => setFilter("all")}
              selected={panel}
              onSelect={setSelectedId}
            />
          )}
        </ScreenGate>
      </div>

      {panel ? (
        <aside
          aria-labelledby="fact-detail-title"
          className="card-v3 sticky top-0 hidden max-h-[calc(100dvh-var(--topbar-h)-32px)] flex-col overflow-hidden rounded-[var(--r-2xl)] lg:flex"
        >
          <FactDetail
            key={panel.card.report.id}
            row={panel}
            layout="panel"
            position={`${fmtNum(shown.indexOf(panel) + 1)} из ${fmtNum(shown.length)}`}
          />
        </aside>
      ) : null}
    </div>
  );
}

/** Капсульные вкладки, как «All / New (3)» в референсе: активная в цвет главной кнопки */
function Capsules<T extends string>({
  label,
  value,
  onChange,
  items,
}: {
  label: string;
  value: T;
  onChange: (next: T) => void;
  items: { value: T; label: string; count: number; dot?: boolean }[];
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 rounded-full bg-surface-2 p-1">
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              "text-body-strong relative inline-flex min-h-12 items-center gap-1.5 rounded-full px-5 font-medium whitespace-nowrap transition-fast focus-ring press lg:min-h-10",
              active ? "bg-pill text-pill-text" : "text-text-2 is-hover:text-text",
              item.dot && "pr-7",
            )}
          >
            {item.label}
            <span className="tnum">{item.value === "new" ? `(${item.count})` : item.count}</span>
            {item.dot ? (
              <span
                aria-hidden
                className="absolute top-2.5 right-3.5 size-2 rounded-full bg-warn"
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Очередь фактов группами по дню, как «Earlier today · 2 events» в календаре. На телефоне
 * касание карточки открывает лист деталей, на десктопе — панель справа.
 */
function FactsQueue({
  rows,
  filtered,
  onShowAll,
  selected,
  onSelect,
}: {
  rows: FactRow[];
  filtered: boolean;
  onShowAll: () => void;
  /** Факт в панели деталей; null — панели нет (телефон, планшет) */
  selected: FactRow | null;
  onSelect: (id: string) => void;
}) {
  const now = useNow();
  const desktop = !!selected;
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<string[]>([]);

  if (!rows.length) {
    return (
      <div className="card-v3">
        <EmptyState
          icon={ClipboardCheck}
          title={filtered ? "Новых фактов нет" : "Фактов на проверке нет"}
          description={
            filtered
              ? "За последние сутки с площадки ничего не пришло. Остальная очередь — во вкладке «Все»."
              : "Как только прораб сдаст смену, отчёт появится здесь."
          }
          {...(filtered ? { actionLabel: "Показать все", onAction: onShowAll } : {})}
        />
      </div>
    );
  }

  const idOf = (row: FactRow) => row.card.report.id;
  // Решённый факт уходит из очереди: лист закрывается сам
  const sheetRow = rows.find((row) => idOf(row) === sheetId) ?? null;
  const position = (row: FactRow) => `${fmtNum(rows.indexOf(row) + 1)} из ${fmtNum(rows.length)}`;

  // Порядок очереди сохраняется: группа встаёт туда, где появился её первый факт
  const groups: { key: string; rows: FactRow[] }[] = [];
  for (const row of rows) {
    const key = dayLabel(fmtDayTitle(row.card.report.date, now));
    const group = groups.find((item) => item.key === key);
    if (group) group.rows.push(row);
    else groups.push({ key, rows: [row] });
  }

  const open = (row: FactRow) => {
    onSelect(idOf(row));
    if (!desktop) setSheetId(idOf(row));
  };

  return (
    <>
      <div className="flex min-w-0 flex-col gap-5">
        {" "}
        {groups.map((group) => {
          const shut = collapsed.includes(group.key);
          return (
            <section key={group.key} aria-label={group.key} className="flex flex-col gap-2.5">
              <button
                type="button"
                aria-expanded={!shut}
                onClick={() =>
                  setCollapsed((list) =>
                    shut ? list.filter((key) => key !== group.key) : [...list, group.key],
                  )
                }
                className="flex min-h-12 w-full items-center justify-between gap-3 rounded-[20px] bg-surface-2 px-4 text-left transition-fast focus-ring press is-hover:bg-surface-3"
              >
                <span className="text-body-strong font-semibold">{group.key}</span>
                <span className="text-body inline-flex items-center gap-1.5 text-text-2 tnum">
                  {fmtNum(group.rows.length)} {plural(group.rows.length, "факт", "факта", "фактов")}
                  <ChevronDown
                    aria-hidden
                    className={cn("size-4 transition-fast", shut && "-rotate-90")}
                  />
                </span>
              </button>
              {shut ? null : (
                <ul className="flex flex-col gap-2.5">
                  {group.rows.map((row) => (
                    <FactCard
                      key={idOf(row)}
                      row={row}
                      current={row === rows[0]}
                      selected={row === selected}
                      accent={!desktop}
                      onOpen={() => open(row)}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {desktop ? null : (
        <CheckSheet
          open={!!sheetRow}
          onClose={() => setSheetId(null)}
          labelledBy="fact-detail-title"
        >
          {sheetRow ? (
            <FactDetail
              key={idOf(sheetRow)}
              row={sheetRow}
              layout="sheet"
              position={position(sheetRow)}
              onClose={() => setSheetId(null)}
            />
          ) : null}
        </CheckSheet>
      )}
    </>
  );
}

/** Вторая вкладка: где ждут проверки позиции спецификации */
function PositionsTab({
  rows,
}: {
  rows: { projectId: string; projectName: string; unverified: number; total: number }[];
}) {
  if (!rows.length) {
    return (
      <div className="card-v3">
        <EmptyState
          icon={FileSearch}
          title="Позиций на проверке нет"
          description="Загруженная спецификация попадает сюда, пока её позиции не сверены с номенклатурой."
        />
      </div>
    );
  }
  return (
    <section aria-labelledby="positions-title" className="flex flex-col gap-2.5">
      <div className="flex min-h-12 items-center justify-between gap-3 rounded-[20px] bg-surface-2 px-4">
        <h2 id="positions-title" className="text-body-strong font-semibold">
          Позиции спецификации
        </h2>
        <span className="text-body text-text-2">сверка с номенклатурой</span>
      </div>
      <ul className="flex flex-col gap-2.5">
        {rows.map((row) => (
          <li key={row.projectId}>
            <Link
              to="/projects/$id/documents"
              params={{ id: row.projectId }}
              className="card-v3 flex min-h-12 items-center gap-3 px-4 py-4 transition-fast focus-ring press is-hover:bg-surface-2 sm:px-5"
            >
              <span aria-hidden className="w-[3px] self-stretch rounded-full bg-warn" />
              <span className="min-w-0 flex-1">
                <span className="text-heading block">{row.projectName}</span>
                <span className="text-body mt-1 block text-text-2">
                  из {fmtNum(row.total)} {plural(row.total, "позиции", "позиций", "позиций")}
                </span>
              </span>
              <span className="text-title tnum">{fmtNum(row.unverified)}</span>
              <ChevronRight aria-hidden className="size-5 text-text-3" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Цепочка показа (ADR-038): отчёт, созданный записью в этой вкладке, стоит в очереди первым —
 * ПТО в сценарии 2 видит именно его. Остальной порядок не меняется.
 */
function chainFirst<T extends { card: { report: { id: string } } }>(
  rows: T[],
  id: string | undefined,
) {
  if (!id) return rows;
  const index = rows.findIndex((row) => row.card.report.id === id);
  return index <= 0 ? rows : [rows[index]!, ...rows.slice(0, index), ...rows.slice(index + 1)];
}
