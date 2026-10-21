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
      <h1 className="sr-only">Сегодня</h1>
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

      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 pt-1 lg:gap-5 lg:pt-2">
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

/** Приветствие по часу смены: время берётся из часов данных, а не из браузера */
function greetingOf(now: string) {
  const hour = Number(now.slice(11, 13));
  if (hour >= 5 && hour < 12) return "Доброе утро";
  if (hour >= 12 && hour < 18) return "Добрый день";
  return "Добрый вечер";
}

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

  return (
    <section
      aria-label="Смена сегодня"
      className="hero-field px-5 pt-5 pb-6 sm:px-8 sm:pt-7 sm:pb-8 lg:px-10 lg:pt-9 lg:pb-10"
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] lg:gap-10">
        <div className="min-w-0">
          <p className="text-[14px] leading-5 text-text-2 tnum">
            {WEEKDAYS[(day.getDay() + 6) % 7]} {format(day, "dd.MM")}
            {greetingName ? ` · ${greetingName}` : ""}
          </p>
          {/* Двухтоновый заголовок: приветствие и объект тише */}
          <p className="text-display mt-3 text-balance lg:text-wrap">
            {greetingOf(now)}.<span className="tone-2 block">{place}</span>
          </p>
        </div>

        {/* Полоса дней, как у календаря: сегодняшний день залит цветом главной кнопки */}
        <ol aria-label="Неделя" className="grid grid-cols-7 gap-1 self-start lg:pt-1">
          {week.map(({ label, date }) => {
            const current = isSameDay(date, day);
            return (
              <li
                key={label}
                aria-current={current ? "date" : undefined}
                className="flex flex-col items-center gap-2"
              >
                <span className="text-[12px] leading-4 text-text-3">{label}</span>
                <span
                  className={cn(
                    "grid size-10 place-items-center rounded-full text-[15px] font-medium tnum lg:size-11",
                    current ? "bg-pill text-pill-text" : "text-text-2",
                  )}
                >
                  {format(date, "d")}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="relative mt-8 lg:mt-12">
        {/* Шар Catalist: только за главной цифрой */}
        <span aria-hidden className="orb -top-12 -left-10 size-[200px] lg:size-[260px]" />
        {works === null ? (
          <div aria-hidden className="h-16 w-44 rounded-[var(--r-sm)] bg-surface-2/70" />
        ) : main ? (
          <>
            <p className="flex items-baseline gap-2">
              <span className="text-[72px] leading-[64px] font-semibold tracking-[-0.045em] tnum sm:text-[88px] sm:leading-[80px] lg:text-[104px] lg:leading-[92px]">
                {fmtNum(main.qty)}
              </span>
              <span className="text-[24px] leading-none font-medium text-text-2 lg:text-[30px]">
                {main.unit}
              </span>
            </p>
            <p className="mt-3 text-[15px] leading-5 text-text-2">
              заявлено за смену
              {rest.length > 0
                ? ` · ещё ${rest.map((item) => `${fmtNum(item.qty)} ${item.unit}`).join(", ")}`
                : ""}
              {review > 0 ? ` · ${fmtNum(review)} на проверке` : ""}
            </p>
          </>
        ) : (
          <>
            <p className="text-[72px] leading-[64px] font-semibold tracking-[-0.045em] tnum lg:text-[104px] lg:leading-[92px]">
              0
            </p>
            <p className="mt-3 text-[15px] leading-5 text-text-2">записей за смену пока нет</p>
          </>
        )}
      </div>
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
      className="card-v3 rounded-[var(--r-2xl)] p-5 sm:p-7"
    >
      <h2
        id="today-capture-title"
        className="text-[26px] leading-[30px] font-semibold tracking-[-0.02em] sm:text-[30px] sm:leading-[34px]"
      >
        Что произошло на объекте?
      </h2>
      <p className="mt-2 text-[15px] leading-[21px] text-text-2">
        Скажите или напишите своими словами, гайка разложит по отчёту.
      </p>
      <Link
        to="/capture"
        aria-label="Рассказать, что произошло: открыть запись"
        className="focus-ring press mt-5 flex min-h-16 items-center gap-3 rounded-full bg-surface-2 py-2 ps-5 pe-2"
      >
        <Plus className="size-5 shrink-0 text-text-3" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[16px] text-text-3">
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
          className="focus-ring press inline-flex min-h-12 items-center gap-2 rounded-full bg-surface-2 px-4 text-[15px] font-medium text-text"
        >
          <ClipboardList className="size-4 text-text-2" aria-hidden />
          Отчёт
        </Link>
        <Link
          to="/capture"
          search={{ scenario: "demo-supply" }}
          className="focus-ring press inline-flex min-h-12 items-center gap-2 rounded-full bg-surface-2 px-4 text-[15px] font-medium text-text"
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
                <span className="block text-[19px] leading-6 font-semibold tracking-[-0.01em] text-text">
                  {card.title}
                </span>
                <span className="mt-0.5 block text-[14px] leading-5 text-text-2">{card.hint}</span>
              </span>
              <span
                className={cn(
                  "shrink-0 text-[30px] leading-none font-semibold tracking-[-0.02em] tnum",
                  card.count > 0 ? "text-text" : "text-text-3",
                )}
              >
                {fmtNum(card.count)}
              </span>
            </>
          );
          const className =
            "card-v3 flex min-h-[84px] items-center gap-4 rounded-[var(--r-xl)] py-4 ps-4 pe-5";
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
        <h2
          id="today-works-title"
          className="text-[22px] leading-7 font-semibold tracking-[-0.02em]"
        >
          Зафиксировано сегодня
        </h2>
        <span className="text-[14px] text-text-3 tnum">
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
        <div className="card-v3 rounded-[var(--r-xl)] p-5">
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
        className="focus-ring press card-v3 flex items-stretch gap-4 rounded-[var(--r-xl)] py-4 ps-4 pe-5"
      >
        <span aria-hidden className={cn("w-1 shrink-0 rounded-full", tone[work.status].bar)} />
        <span className="min-w-0 flex-1">
          <span className="block text-[19px] leading-6 font-semibold tracking-[-0.01em] text-text">
            {work.workType}
          </span>
          {/* Метаданные одной строкой (правило 8 этапа D; заменяет чипы ADR-028, п. 5) */}
          <span className="mt-1 block text-[14px] leading-5 text-text-2">
            {metaLine(work.zoneName, shortName(work.projectName))}
          </span>
          <span className="mt-2 inline-flex items-center gap-2 text-[13px] leading-5 text-text-2">
            <span aria-hidden className={cn("size-2 rounded-full", tone[work.status].dot)} />
            {reportStatusLabel[work.status]}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-[26px] leading-7 font-semibold tracking-[-0.02em] tnum">
            {fmtNum(work.qty)}
          </span>
          <span className="mt-1 block text-[13px] text-text-3">{work.unit}</span>
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
            <div className="tnum text-[13px] font-medium">{fmtDate(delivery.expectedAt)}</div>
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
    <span className="inline-flex h-6 max-w-full items-center truncate rounded-[var(--r-xs)] bg-surface-2 px-2 text-[13px] leading-none text-text-2">
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
      className="card-v3 rounded-[var(--r-2xl)] p-5 sm:p-7"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="today-shift-title"
            className="text-[22px] leading-7 font-semibold tracking-[-0.02em]"
          >
            Сводка смены
          </h2>
          <p className="mt-1 text-[14px] leading-5 text-text-2">
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
              <div key={total.unit} className="rounded-[var(--r-lg)] bg-surface-2 p-4">
                <dt className="text-[13px] leading-5 text-text-2">Принято, {total.unit}</dt>
                <dd className="mt-1 text-[30px] leading-9 font-semibold tracking-[-0.02em] tnum">
                  {fmtNum(total.qty)}
                </dd>
              </div>
            ))}
            <div className="rounded-[var(--r-lg)] bg-surface-2 p-4">
              <dt className="text-[13px] leading-5 text-text-2">Людей на сменах</dt>
              <dd className="mt-1 text-[30px] leading-9 font-semibold tracking-[-0.02em] tnum">
                {fmtNum(summary.people)}
              </dd>
            </div>
          </dl>
          {summary.pending > 0 ? (
            <p className="mt-3 text-[13px] leading-5 text-text-3">
              Ещё {fmtNum(summary.pending)} на проверке: в сводку они попадут после приёмки.
            </p>
          ) : null}
          <button
            type="button"
            onClick={download}
            disabled={saving}
            className="focus-ring press mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-surface-2 px-5 text-[15px] font-medium text-text disabled:opacity-60 sm:w-auto"
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
