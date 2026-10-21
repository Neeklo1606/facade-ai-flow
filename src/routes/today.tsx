import { completePageHead } from "@/lib/page-head";
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { addDays, format, isSameDay, parseISO, startOfWeek } from "date-fns";
import {
  ClipboardList,
  FileSpreadsheet,
  HardHat,
  Mic,
  PackageCheck,
  Plus,
  TriangleAlert,
} from "lucide-react";
import {
  CountPill,
  EmptyState,
  StatusBadge,
  WidgetCard,
  WidgetCardHeader,
} from "@/components/common";
import { ScreenGate, ScreenSkeleton } from "@/components/common/ScreenStates";
import { PageActions, PageCaption } from "@/components/layout/PageActions";
import { Button } from "@/components/ui/button";
import { useToday } from "@/api/today";
import { useCanWrite } from "@/api/access";
import { useDirectory } from "@/api/directory";
import { queries } from "@/api/queries";
import { prefetch } from "@/api/prefetch";
import { deliveryStatusLabel, reportStatusLabel } from "@/contracts";
import { fmtDate, metaLine, shortName, fmtNum, plural } from "@/lib/format";
import { useScreenState } from "@/lib/screen-state";
import { legacyModulesEnabled } from "@/lib/legacy-modules";
import { recordAction } from "@/lib/guide/telemetry";
import { saveShiftFile, useShift } from "@/api/capture";
import { toast } from "@/lib/toast";
import { useCurrentUser, useProjectId } from "@/lib/project-scope";
import { cn } from "@/lib/utils";
import type { TodayDelivery, TodayReturn, TodayWork } from "@/api/types";

/**
 * «Сегодня» — рабочий экран прораба (ADR-028, п. 2): что зафиксировано сменой, что едет
 * на площадку и что вернули на уточнение. Главное действие — завести отчёт.
 *
 * Блока «план на сегодня» здесь нет и не будет, пока плана нет в данных: пустое обещание
 * хуже отсутствующего блока.
 */
export const Route = createFileRoute("/today")({
  loader: async ({ context }) => {
    await prefetch(context.queryClient, queries.projects());
  },
  head: () =>
    completePageHead(
      {
        meta: [
          { title: "Сегодня — гайка" },
          {
            name: "description",
            content: "Смена на площадке: что зафиксировано, какие поставки ждут и что вернули.",
          },
        ],
      },
      "Сегодня — гайка",
      "Смена на площадке, записи и статусы проверки.",
    ),
  component: TodayPage,
});

function TodayPage() {
  const projectId = useProjectId();
  const today = useToday(projectId);
  const user = useCurrentUser();
  const screen = useScreenState({
    pending: today.pending,
    error: today.error,
    empty:
      !today.pending &&
      today.works.length === 0 &&
      today.deliveries.length === 0 &&
      today.returned.length === 0,
  });
  // Куда ведёт «Зафиксировать работу»: объект из чипа, иначе первый доступный
  const target = projectId ?? today.projects[0]?.project.id ?? null;
  /*
   * Отчёт за смену заводят прораб, ПТО и руководитель; директору матрица даёт отчёты только
   * на чтение (ADR-012). Экран ему открыт — смену видно, — а кнопка записи вела бы в форму,
   * которую он не отправит: кнопка без действия хуже отсутствующей (ADR-015).
   * Это удобство, а не защита: право всё равно проверяется на сервере.
   */
  const canRecord = useCanWrite("field-reports") && target !== null;
  const ready = screen !== "loading" && screen !== "error" && screen !== "forbidden";
  const place = projectId
    ? shortName(today.projects.find((row) => row.project.id === projectId)?.project.name ?? "")
    : today.projects.length === 1 && today.projects[0]
      ? shortName(today.projects[0].project.name)
      : "Все объекты";

  return (
    <>
      {/*
        Заголовок экрана для чтения с экрана: на телефоне его место занимает цветовое поле
        с приветствием, на десктопе название показывает шапка (как у PageHeader).
      */}
      {canRecord ? (
        // На десктопе полосы над панелью нет: главное действие живёт в шапке экрана
        <PageActions>
          <Button variant="accent" asChild>
            <Link
              to="/projects/$id/field-reports"
              params={{ id: target }}
              search={{ new: "report" }}
            >
              <HardHat className="size-4" /> Зафиксировать работу
            </Link>
          </Button>
        </PageActions>
      ) : null}
      <PageCaption>
        <span className="truncate">
          {fmtDate(today.now)}
          {today.works.length > 0 &&
            ` · ${fmtNum(today.works.length)} ${plural(today.works.length, "запись", "записи", "записей")} за смену`}
        </span>
      </PageCaption>

      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-3 pt-1 lg:gap-5 lg:pt-2">
        {screen !== "forbidden" ? (
          <TodayHero
            now={today.now}
            greetingName={user?.name ?? null}
            place={place}
            works={ready ? today.works : null}
          />
        ) : null}

        {/*
          Телефон: ввод, статусы, записи, сводка — одной колонкой в этом порядке (колонки
          раскрыты через `contents`). Десктоп: ввод и записи слева, статусы и сводка справа.
        */}
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start lg:gap-5">
          <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-5">
            {canRecord && screen !== "forbidden" ? (
              <div className="order-1 min-w-0 lg:order-none">
                <CaptureCard />
              </div>
            ) : null}
            <div className="order-3 min-w-0 lg:order-none">
              <ScreenGate
                state={screen}
                onRetry={today.refetch}
                skeleton={<ScreenSkeleton kind="feed" />}
                copy={{
                  section: "Сегодня",
                  roles: "прорабу и тем, кто ведёт площадку",
                  errorTitle: "Не удалось загрузить смену",
                  empty: {
                    icon: HardHat,
                    title: "За сегодня записей нет",
                    description:
                      "Как только работа зафиксирована, она появится здесь вместе с ожидаемыми поставками.",
                  },
                }}
              >
                <WorksSection works={today.works} />
              </ScreenGate>
            </div>
          </div>

          {ready ? (
            <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-5">
              <div className="order-2 min-w-0 lg:order-none">
                <StatusCards works={today.works} returned={today.returned} projectId={target} />
              </div>

              {/* Сводка смены и файл результата (ADR-037, сценарий 1) */}
              {target ? (
                <div className="order-4 min-w-0 lg:order-none">
                  <ShiftCard projectId={target} date={today.now.slice(0, 10)} />
                </div>
              ) : null}

              {/* Поставки — модуль за флагом legacy_modules (ADR-034, п. 4) */}
              {legacyModulesEnabled() && (
                <WidgetCard className="order-5 lg:order-none">
                  <WidgetCardHeader
                    level={2}
                    icon={PackageCheck}
                    title="Ожидаются поставки"
                    hint="по дате прибытия"
                    aside={<CountPill>{fmtNum(today.deliveries.length)}</CountPill>}
                  />
                  {today.deliveries.length ? (
                    <ul className="mt-2 divide-y divide-line">
                      {today.deliveries.map((delivery) => (
                        <DeliveryRow key={delivery.id} delivery={delivery} />
                      ))}
                    </ul>
                  ) : (
                    <EmptyState
                      title="Поставок в пути нет"
                      description="Здесь появятся поставки, по которым выбран поставщик и назначена дата."
                    />
                  )}
                </WidgetCard>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/*
        Закреплённой «Зафиксировать работу» больше нет: главное действие экрана — голосовая
        капсула панели, две главные кнопки на одном экране спорили (правило 1 этапа D).
      */}
    </>
  );
}

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;

/** Итог смены по единицам: разные единицы не складываются, главная — где больше записей */
function shiftTotals(works: TodayWork[]) {
  const byUnit = new Map<string, { unit: string; qty: number; rows: number }>();
  for (const work of works) {
    const item = byUnit.get(work.unit) ?? { unit: work.unit, qty: 0, rows: 0 };
    item.qty += work.qty;
    item.rows += 1;
    byUnit.set(work.unit, item);
  }
  return [...byUnit.values()].sort((a, b) => b.rows - a.rows || b.qty - a.qty);
}

/**
 * Цветовое поле экрана (дизайн-система, раздел 8; v3 — `hero-field`): приветствие и объект
 * двухтоновым заголовком, полоса дней недели как у календаря и главная цифра смены.
 * Единственный большой градиент кадра; шар стоит только за главной цифрой.
 */
function TodayHero({
  now,
  greetingName,
  place,
  works,
}: {
  now: string;
  greetingName: string | null;
  place: string;
  works: TodayWork[] | null;
}) {
  const day = parseISO(now.slice(0, 10));
  const monday = startOfWeek(day, { weekStartsOn: 1 });
  const week = WEEKDAYS.map((label, index) => ({ label, date: addDays(monday, index) }));
  const totals = works ? shiftTotals(works) : [];
  const main = totals[0];
  const rest = totals.slice(1);
  const review = works?.filter((work) => work.status === "review").length ?? 0;

  /*
   * ADR-045, 5.13: заголовок «Сегодня» и дата, полоса недели 44, итог дня одной строкой.
   * Без градиента и шара: тихий фон, громкое содержание. Число итога text-title, а не 48+.
   */
  return (
    <section aria-label="Смена сегодня" className="flex flex-col gap-block">
      <div>
        <h1 className="text-title">Сегодня</h1>
        <p className="text-meta text-text-3 tnum">
          {WEEKDAYS[(day.getDay() + 6) % 7]} {format(day, "dd.MM")} · {place}
          {greetingName ? ` · ${greetingName}` : ""}
        </p>
      </div>

      <ol aria-label="Неделя" className="grid grid-cols-7 gap-1 lg:max-w-[420px]">
        {week.map(({ label, date }) => {
          const current = isSameDay(date, day);
          return (
            <li
              key={label}
              aria-current={current ? "date" : undefined}
              className={cn(
                "flex min-h-control flex-col items-center justify-center rounded-control",
                // Один акцент на экран (принцип 5): он у главной кнопки, день — тёмной заливкой
                current ? "bg-pill text-pill-text" : "text-text-2",
              )}
            >
              <span className={cn("text-meta", current ? "text-pill-text" : "text-text-3")}>
                {label}
              </span>
              <span className="text-body-strong tnum">{format(date, "d")}</span>
            </li>
          );
        })}
      </ol>

      {works === null ? (
        <div aria-hidden className="skeleton h-8 w-56 rounded-[var(--r-xs)]" />
      ) : (
        <p className="flex flex-wrap items-baseline gap-x-1.5 text-body text-text-2">
          <span className="text-title text-text tnum">{fmtNum(main?.qty ?? 0)}</span>
          {main ? <span className="text-meta text-text-3">{main.unit}</span> : null}
          <span>
            {main ? "заявлено" : "записей за смену пока нет"}
            {rest.length > 0
              ? ` · ещё ${rest.map((item) => `${fmtNum(item.qty)} ${item.unit}`).join(", ")}`
              : ""}
            {review > 0 ? ` · ${fmtNum(review)} на проверке` : ""}
          </span>
        </p>
      )}
    </section>
  );
}

/**
 * «Что произошло на объекте?»: стеклянная капсула ввода, как у Catalist. Касание ведёт
 * на экран записи — туда же, куда голосовая кнопка панели. Чипы — только сценарии, которые
 * работают в показе: «Задача» отложена решением 18.10 (ADR-038), её здесь нет.
 */
function CaptureCard() {
  return (
    <section
      aria-labelledby="today-capture-title"
      className="card-v3 rounded-[var(--r-xl)] p-4 sm:p-6"
    >
      <h2 id="today-capture-title" className="text-heading">
        Что произошло на объекте?
      </h2>
      <p className="text-body mt-2 text-text-2">
        Скажите или напишите своими словами, гайка разложит по отчёту.
      </p>
      <Link
        to="/capture"
        aria-label="Рассказать, что произошло: открыть запись"
        className="focus-ring press mt-5 flex min-h-16 items-center gap-3 rounded-full bg-surface-2 py-2 ps-5 pe-2"
      >
        <Plus className="size-5 shrink-0 text-text-3" aria-hidden />
        <span className="text-body min-w-0 flex-1 truncate text-text-3">
          Смена, объём, нехватка…
        </span>
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-pill text-pill-text">
          <Mic className="size-5" aria-hidden />
        </span>
      </Link>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          to="/capture"
          search={{ scenario: "demo-shift" }}
          className="text-body-strong focus-ring press inline-flex min-h-12 items-center gap-2 rounded-full bg-surface-2 px-4 font-medium text-text"
        >
          <ClipboardList className="size-4 text-text-2" aria-hidden />
          Отчёт
        </Link>
        <Link
          to="/capture"
          search={{ scenario: "demo-supply" }}
          className="text-body-strong focus-ring press inline-flex min-h-12 items-center gap-2 rounded-full bg-surface-2 px-4 font-medium text-text"
        >
          <TriangleAlert className="size-4 text-risk" aria-hidden />
          Проблема
        </Link>
      </div>
    </section>
  );
}

const tone = {
  review: { bar: "bg-warn", dot: "bg-warn" },
  returned: { bar: "bg-risk", dot: "bg-risk" },
  accepted: { bar: "bg-ok", dot: "bg-ok" },
} as const;

/**
 * Три карточки статусов, как события календаря: цветная полоса слева, крупное название,
 * цифра справа. Больше трёх до прокрутки не ставим (правило 3 этапа D).
 */
function StatusCards({
  works,
  returned,
  projectId,
}: {
  works: TodayWork[];
  returned: TodayReturn[];
  projectId: string | null;
}) {
  const review = works.filter((work) => work.status === "review");
  const accepted = works.filter((work) => work.status === "accepted");
  const cards = [
    {
      key: "returned" as const,
      title: "Вернули на уточнение",
      hint: returned[0] ? returned[0].workType : "ничего не вернули",
      count: returned.length,
    },
    {
      key: "review" as const,
      title: "На проверке",
      hint: review.length ? "ждут решения ПТО" : "всё проверено",
      count: review.length,
    },
    {
      key: "accepted" as const,
      title: "Принято сегодня",
      hint: accepted.length ? "уже в сводке смены" : "пока ничего",
      count: accepted.length,
    },
  ];
  return (
    <section aria-label="Статусы записей">
      <ul className="flex flex-col gap-3">
        {cards.map((card) => {
          const body = (
            <>
              <span
                aria-hidden
                className={cn(
                  "w-1 shrink-0 self-stretch rounded-full",
                  card.count > 0 ? tone[card.key].bar : "bg-surface-3",
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="text-heading block text-text">{card.title}</span>
                <span className="text-body mt-0.5 block text-text-2">{card.hint}</span>
              </span>
              <span
                className={cn(
                  "text-title shrink-0 tnum",
                  card.count > 0 ? "text-text" : "text-text-3",
                )}
              >
                {fmtNum(card.count)}
              </span>
            </>
          );
          const className =
            "card-v3 flex min-h-[64px] items-center gap-3 rounded-[var(--r-lg)] py-3 ps-3.5 pe-4";
          return (
            <li key={card.key}>
              {projectId ? (
                <Link
                  to="/projects/$id/field-reports"
                  params={{ id: projectId }}
                  search={{ status: card.key }}
                  className={cn("focus-ring press", className)}
                >
                  {body}
                </Link>
              ) : (
                <div className={className}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** «Зафиксировано сегодня»: записи смены карточками событий */
function WorksSection({ works }: { works: TodayWork[] }) {
  return (
    <section aria-labelledby="today-works-title" className="pt-2">
      <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
        <h2 id="today-works-title" className="text-heading">
          Зафиксировано сегодня
        </h2>
        <span className="text-body text-text-3 tnum">
          {fmtNum(works.length)} {plural(works.length, "запись", "записи", "записей")}
        </span>
      </div>
      {works.length ? (
        <ul className="flex flex-col gap-3">
          {works.map((work) => (
            <WorkRow key={work.id} work={work} />
          ))}
        </ul>
      ) : (
        <div className="card-v3 rounded-[var(--r-lg)] p-4">
          <EmptyState
            title="Сегодня ничего не зафиксировано"
            description="Это не значит, что работ не было: расскажите о смене в карточке выше."
          />
        </div>
      )}
    </section>
  );
}

/** Запись смены: полоса статуса слева, вид работ крупно, объём справа */
function WorkRow({ work }: { work: TodayWork }) {
  return (
    <li>
      <Link
        to="/projects/$id/field-reports"
        params={{ id: work.projectId }}
        className="focus-ring press card-v3 flex items-stretch gap-3 rounded-[var(--r-lg)] py-3 ps-3.5 pe-4"
      >
        <span aria-hidden className={cn("w-1 shrink-0 rounded-full", tone[work.status].bar)} />
        <span className="min-w-0 flex-1">
          <span className="text-heading block text-text">{work.workType}</span>
          {/* Метаданные одной строкой (правило 8 этапа D; заменяет чипы ADR-028, п. 5) */}
          <span className="text-body mt-1 block text-text-2">
            {metaLine(work.zoneName, shortName(work.projectName))}
          </span>
          <span className="text-meta mt-2 inline-flex items-center gap-2 text-text-2">
            <span aria-hidden className={cn("size-2 rounded-full", tone[work.status].dot)} />
            {reportStatusLabel[work.status]}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="text-title block tnum">{fmtNum(work.qty)}</span>
          <span className="text-meta mt-1 block text-text-3">{work.unit}</span>
        </span>
      </Link>
    </li>
  );
}

/** Строка поставки: от кого, когда ждём и не опоздала ли */
function DeliveryRow({ delivery }: { delivery: TodayDelivery }) {
  const { counterpartyName: supplierName } = useDirectory();
  return (
    <li className="py-3">
      <Link
        to="/projects/$id/deliveries"
        params={{ id: delivery.projectId }}
        className="focus-ring -mx-2 block rounded-[var(--r-sm)] px-2 py-1 transition-fast is-hover:bg-surface-2"
      >
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-card-title">{supplierName(delivery.supplierId)}</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Chip>{delivery.projectName}</Chip>
              <Chip>
                {fmtNum(delivery.items)} {plural(delivery.items, "позиция", "позиции", "позиций")}
              </Chip>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-meta-strong tnum font-medium">{fmtDate(delivery.expectedAt)}</div>
            <div className="mt-1.5">
              <StatusBadge tone={delivery.overdue ? "danger" : "neutral"}>
                {delivery.overdue ? "Срок прошёл" : deliveryStatusLabel[delivery.status]}
              </StatusBadge>
            </div>
          </div>
        </div>
      </Link>
    </li>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-meta inline-flex h-6 max-w-full items-center truncate rounded-[var(--r-xs)] bg-surface-2 px-2 text-text-2">
      {children}
    </span>
  );
}

/**
 * Сводка смены: что принято за день и файл результата (ADR-037, сценарий 1).
 *
 * В сводку идут только принятые отчёты — неподтверждённое в ней не появляется. Разные единицы
 * не складываются: итог считается по каждой отдельно. Люди стоят отдельным показателем,
 * а не прибавляются к объёму.
 */
function ShiftCard({ projectId, date }: { projectId: string; date: string }) {
  const shift = useShift(projectId, date, true);
  const [saving, setSaving] = useState(false);
  const summary = shift.data;

  const download = () => {
    setSaving(true);
    void saveShiftFile({ projectId, date: summary?.date ?? date }, "shift")
      .then(() => recordAction("downloadShift"))
      .catch((error: Error) => toast.error("Файл не собрался", { description: error.message }))
      .finally(() => setSaving(false));
  };

  return (
    <section
      aria-labelledby="today-shift-title"
      className="card-v3 rounded-[var(--r-xl)] p-4 sm:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="today-shift-title" className="text-heading">
            Сводка смены
          </h2>
          <p className="text-body mt-1 text-text-2">
            {summary && summary.date !== date
              ? `последняя смена с принятыми записями: ${fmtDate(summary.date)}`
              : "только принятые записи"}
          </p>
        </div>
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-surface-2 text-text-2">
          <FileSpreadsheet className="size-5" aria-hidden />
        </span>
      </div>
      {summary && summary.rows.length > 0 ? (
        <>
          <dl className="mt-6 grid grid-cols-2 gap-3">
            {summary.totals.map((total) => (
              <div key={total.unit} className="rounded-[var(--r-md)] bg-surface-2 p-3">
                <dt className="text-meta text-text-2">Принято, {total.unit}</dt>
                <dd className="text-title mt-0.5 tnum">{fmtNum(total.qty)}</dd>
              </div>
            ))}
            <div className="rounded-[var(--r-md)] bg-surface-2 p-3">
              <dt className="text-meta text-text-2">Людей на сменах</dt>
              <dd className="text-title mt-0.5 tnum">{fmtNum(summary.people)}</dd>
            </div>
          </dl>
          {summary.pending > 0 ? (
            <p className="text-meta mt-3 text-text-3">
              Ещё {fmtNum(summary.pending)} на проверке: в сводку они попадут после приёмки.
            </p>
          ) : null}
          <button
            type="button"
            onClick={download}
            disabled={saving}
            className="text-body-strong focus-ring press mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-surface-2 px-5 font-medium text-text disabled:opacity-60 sm:w-auto"
          >
            <FileSpreadsheet className="size-4" aria-hidden /> Скачать Excel
          </button>
        </>
      ) : (
        <EmptyState
          title="За смену ещё нечего сводить"
          description="В сводку попадают принятые записи: примите факт в «Проверке», и он появится здесь."
        />
      )}
    </section>
  );
}
