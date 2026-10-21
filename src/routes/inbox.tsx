import { completePageHead } from "@/lib/page-head";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRightCircle,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Inbox,
  PackageSearch,
  Scale,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BottomSheet } from "@/components/common/BottomSheet";
import { SlideToConfirm } from "@/components/gaika";
import { PageHeader } from "@/components/common";
import { ScreenGate, ScreenSkeleton } from "@/components/common/ScreenStates";
import { PageCaption } from "@/components/layout/PageActions";
import { useInbox } from "@/api/inbox";
import { useMaterialRequests, useDecideMaterialRequest } from "@/api/capture";
import { useAccess } from "@/api/access";
import { useDirectory } from "@/api/directory";
import { useGuide } from "@/lib/guide/store";
import {
  materialRequestStatusLabel,
  type MaterialRequest,
  type MaterialRequestStatus,
} from "@/contracts";
import { toast } from "@/lib/toast";
import { prefetch } from "@/api/prefetch";
import { queries } from "@/api/queries";
import { fmtDate, fmtDateTime, fmtNum, metaLine, plural, shortName } from "@/lib/format";
import { useProjectId } from "@/lib/project-scope";
import { useScreenState } from "@/lib/screen-state";
import { cn } from "@/lib/utils";

/**
 * «Входящие» (ADR-034, п. 3; раздел 6 GAIKA_PRODUCT_UX) — четвёртая позиция панели.
 * Здесь то, что ждёт этого человека: заявки на материал, возвраты автору, очередь проверки
 * и решения. Каждый блок стоит на работающих данных; пустые блоки не показываются.
 *
 * Вид v3 (ADR-044): вкладки капсулами «Все / Новые», группы как «Earlier today» в календаре,
 * карточки как события с цветной полосой статуса слева.
 */
export const Route = createFileRoute("/inbox")({
  loader: async ({ context }) => {
    await prefetch(context.queryClient, queries.projects());
  },
  head: () =>
    completePageHead(
      {
        meta: [
          { title: "Входящие — гайка" },
          {
            name: "description",
            content: "Что ждёт вас: вернули на доработку, очередь проверки и решения.",
          },
          { property: "og:title", content: "Входящие — гайка" },
          { property: "og:type", content: "website" },
        ],
      },
      "Входящие — гайка",
      "Проверка, уточнения и решения по объектам.",
    ),
  component: InboxPage,
});

type Filter = "all" | "new";
type Tone = "warn" | "info" | "sand" | "ok" | "danger";

const TONE_BAR: Record<Tone, string> = {
  warn: "bg-warn",
  info: "bg-info",
  sand: "bg-sand",
  ok: "bg-ok",
  danger: "bg-danger",
};

const REQUEST_TONE: Record<MaterialRequestStatus, Tone> = {
  new: "warn",
  accepted: "info",
  ordered: "sand",
  closed: "ok",
  declined: "danger",
};

function InboxPage() {
  const projectId = useProjectId();
  const inbox = useInbox(projectId);
  /* Заявки считаются вместе с остальным: иначе экран говорил бы «пусто» над очередью заявок */
  const requests = useMaterialRequests(projectId);
  const guide = useGuide();
  const [filter, setFilter] = useState<Filter>("all");
  // Заявка, созданная записью в этой вкладке, стоит первой: снабжение видит именно её (ADR-038)
  const requestRows = [...(requests.data ?? [])].sort(
    (a, b) => Number(b.id === guide.chain.requestId) - Number(a.id === guide.chain.requestId),
  );
  const screen = useScreenState({
    pending: inbox.pending || requests.isPending,
    error: inbox.error || requests.isError,
    empty: !inbox.pending && inbox.count === 0 && requestRows.length === 0,
  });

  // «Новые» — то, что ещё ждёт действия: решённые заявки остаются только во «Всех»
  const freshRequests = requestRows.filter((row) => row.status === "new");
  const total = inbox.count + requestRows.length;
  const fresh = inbox.count + freshRequests.length;
  const shownRequests = filter === "new" ? freshRequests : requestRows;

  return (
    <>
      <PageHeader title="Входящие" />
      <PageCaption>
        <span className="truncate">
          {total > 0
            ? `${fmtNum(total)} ${plural(total, "запись", "записи", "записей")} ждут вас`
            : "Ничего не ждёт"}
        </span>
      </PageCaption>

      {total > 0 ? (
        <div className="-mx-[var(--content-pad)] mb-6 overflow-x-auto px-[var(--content-pad)] [scrollbar-width:none] lg:mx-0 lg:px-0">
          <div
            role="tablist"
            aria-label="Что показать"
            className="flex w-max gap-1 rounded-full bg-surface-2 p-1"
          >
            {(
              [
                { value: "all", label: "Все", count: total },
                { value: "new", label: "Новые", count: fresh },
              ] as const
            ).map((item) => {
              const active = filter === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(item.value)}
                  className={cn(
                    "text-body-strong relative inline-flex min-h-12 min-w-[104px] items-center justify-center gap-1.5 rounded-full px-5 font-medium whitespace-nowrap transition-fast focus-ring press lg:min-h-10",
                    active ? "bg-pill text-pill-text" : "text-text-2 is-hover:text-text",
                    item.value === "new" && item.count > 0 && "pr-7",
                  )}
                >
                  {item.label}
                  <span className="tnum">
                    {item.value === "new" ? `(${fmtNum(item.count)})` : fmtNum(item.count)}
                  </span>
                  {item.value === "new" && item.count > 0 ? (
                    <span
                      aria-hidden
                      className="absolute top-2.5 right-3.5 size-2 rounded-full bg-warn"
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <ScreenGate
        state={screen}
        onRetry={inbox.refetch}
        skeleton={<ScreenSkeleton kind="feed" />}
        copy={{
          section: "Входящие",
          roles: "всем, кто ведёт площадку",
          errorTitle: "Не удалось загрузить входящие",
          empty: {
            icon: Inbox,
            title: "Входящих нет",
            description: "Возвраты, очередь проверки и решения появятся здесь, когда будут.",
          },
        }}
      >
        <div className="flex flex-col gap-8">
          {/* Заявки на материал: очередь снабжения и движение статуса (ADR-037, сценарий 3) */}
          <MaterialRequests rows={shownRequests} />

          {inbox.queue.length > 0 && (
            <Group
              id="inbox-queue"
              title="Ждут вашей проверки"
              hint="факты с площадки"
              count={`${fmtNum(inbox.queue.length)} ${plural(inbox.queue.length, "факт", "факта", "фактов")}`}
            >
              {inbox.queue.slice(0, 6).map((row) => (
                <li key={row.card.report.id}>
                  <EventLink to="/check" tone="warn" status="На проверке">
                    <EventHead
                      title={row.card.report.workType}
                      aside={
                        <>
                          <span className="text-title block tnum">
                            {fmtNum(row.card.report.declaredQty ?? 0)}
                          </span>
                          <span className="text-meta block text-text-3">
                            {row.card.report.unit}
                          </span>
                        </>
                      }
                    />
                    <p className="text-body mt-1 text-text-2">
                      {metaLine(row.zoneName, shortName(row.projectName))}
                    </p>
                  </EventLink>
                </li>
              ))}
            </Group>
          )}

          {inbox.returned.length > 0 && (
            <Group
              id="inbox-returned"
              title="Вернули на доработку"
              hint="ждут вашего уточнения"
              count={`${fmtNum(inbox.returned.length)} ${plural(inbox.returned.length, "отчёт", "отчёта", "отчётов")}`}
            >
              {inbox.returned.map((row) => (
                <li key={row.id}>
                  <EventLink
                    to="/projects/$id/field-reports"
                    params={{ id: row.projectId }}
                    tone="danger"
                    status="Требует уточнения"
                  >
                    <EventHead title={row.workType} />
                    <p className="text-body mt-1 text-text-2">
                      {metaLine(row.zoneName, shortName(row.projectName))}
                    </p>
                    <p className="text-body mt-2 line-clamp-2 rounded-[16px] bg-surface-2 px-3 py-2.5 text-text">
                      «{row.summary}»
                    </p>
                  </EventLink>
                </li>
              ))}
            </Group>
          )}

          {inbox.decisions.length > 0 && (
            <Group
              id="inbox-decisions"
              title="Ждут вашего решения"
              hint="с переходом к источнику"
              count={`${fmtNum(inbox.decisions.length)} ${plural(inbox.decisions.length, "решение", "решения", "решений")}`}
            >
              {inbox.decisions.map((row) => (
                <li key={row.id}>
                  <EventLink
                    to={row.to}
                    tone={
                      row.severity === "danger"
                        ? "danger"
                        : row.severity === "warn"
                          ? "warn"
                          : "info"
                    }
                    status={row.due ?? "Без срока"}
                  >
                    <EventHead title={row.title} />
                    <ul className="mt-3 flex flex-col rounded-[20px] bg-surface-2 p-1.5">
                      <Answer icon={CircleAlert} label="На что влияет">
                        {row.reason}
                      </Answer>
                      <Answer icon={ArrowRightCircle} label="Что будет после">
                        Откроется раздел «{shortName(row.projectName)}», где решение принимается по
                        источнику
                      </Answer>
                    </ul>
                  </EventLink>
                </li>
              ))}
            </Group>
          )}
        </div>
      </ScreenGate>
    </>
  );
}

/** Группа, как «Earlier today · 2 events ˅» в календаре: заголовок сворачивает список */
function Group({
  id,
  title,
  hint,
  count,
  children,
  footer,
}: {
  id: string;
  title: string;
  hint: string;
  count: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2.5">
      <h2 id={id} className="m-0">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex min-h-14 w-full items-center justify-between gap-3 rounded-[20px] bg-surface-2 px-4 py-2 text-left transition-fast focus-ring press is-hover:bg-surface-3"
        >
          <span className="min-w-0">
            <span className="text-heading block">{title}</span>
            <span className="text-meta block font-normal text-text-2">{hint}</span>
          </span>
          <span className="text-body inline-flex shrink-0 items-center gap-1.5 font-normal text-text-2 tnum">
            {count}
            <ChevronDown
              aria-hidden
              className={cn("size-4 transition-fast", !open && "-rotate-90")}
            />
          </span>
        </button>
      </h2>
      {open ? (
        <>
          <ul className="grid gap-2.5 lg:grid-cols-2 lg:items-start lg:gap-3">{children}</ul>
          {footer}
        </>
      ) : null}
    </section>
  );
}

/** Статус один, текстом с цветной точкой (v3, правило 8) */
function Status({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className="text-meta-strong inline-flex items-center gap-1.5 font-medium text-text-2">
      <span aria-hidden className={cn("size-2 rounded-full", TONE_BAR[tone])} />
      {children}
    </span>
  );
}

/** Шапка карточки-события: заголовок крупно, справа то, что у события на месте времени */
function EventHead({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <h3 className="text-heading min-w-0 flex-1 text-balance">{title}</h3>
      {aside ? <div className="shrink-0 text-right">{aside}</div> : null}
    </div>
  );
}

/** Карточка-событие целиком ведёт туда, где с записью работают */
function EventLink({
  tone,
  status,
  children,
  ...link
}: {
  tone: Tone;
  status: string;
  children: ReactNode;
  to: string;
  params?: Record<string, string>;
}) {
  return (
    <Link
      {...(link as { to: string })}
      className="card-v3 flex min-h-12 gap-3 px-4 py-4 transition-fast focus-ring press is-hover:bg-surface-2 sm:px-5"
    >
      <span aria-hidden className={cn("w-[3px] shrink-0 rounded-full", TONE_BAR[tone])} />
      <div className="min-w-0 flex-1">
        <span className="mb-1.5 block">
          <Status tone={tone}>{status}</Status>
        </span>
        {children}
      </div>
      <ChevronRight aria-hidden className="mt-0.5 size-5 shrink-0 self-center text-text-3" />
    </Link>
  );
}

/** Ответ на один из четырёх вопросов карточки решения: иконка в плашке, подпись, значение */
function Answer({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 px-2 py-2">
      <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-surface text-text-2">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-meta block text-text-3">{label}</span>
        <span className="text-body mt-0.5 block text-text">{children}</span>
      </span>
    </li>
  );
}

/**
 * Заявки на материал (ADR-037, сценарий 3). Снабжение видит очередь и меняет статус руками:
 * принять, заказать, закрыть, отклонить с причиной. Автор видит, что с его заявкой стало.
 * Карточка решения отвечает на четыре вопроса: что случилось, на что влияет, кто предлагает,
 * что будет после нажатия.
 *
 * Ничего не заказывается автоматически — это правило продукта, а не ограничение демонстрации.
 */
function MaterialRequests({ rows }: { rows: MaterialRequest[] }) {
  const decide = useDecideMaterialRequest();
  const { can } = useAccess();
  const { employeeName } = useDirectory();
  const mayDecide = can("procurement", "write");
  const [declining, setDeclining] = useState<MaterialRequest | null>(null);
  const [reason, setReason] = useState("");
  if (rows.length === 0) return null;

  const run = (row: MaterialRequest, status: MaterialRequestStatus, decision: string) =>
    decide.mutate(
      { id: row.id, status, decision },
      {
        onError: (error: Error) =>
          toast.error("Решение не записано", { description: error.message }),
      },
    );

  /* Следующий шаг после принятия: заказ и закрытие — обычными кнопками, решение уже есть */
  const after: Partial<
    Record<MaterialRequestStatus, { to: MaterialRequestStatus; label: string }>
  > = {
    accepted: { to: "ordered", label: "Отметить заказанной" },
    ordered: { to: "closed", label: "Закрыть" },
  };

  /* Что произойдёт дальше — словами, по статусу и по тому, кто смотрит */
  const next: Record<MaterialRequestStatus, string> = {
    new: mayDecide
      ? "Статус «Принята» сразу увидит прораб. Заказ и закрытие вы отметите сами."
      : "Снабжение примет заявку или отклонит с причиной, статус придёт сюда.",
    accepted: "Следующий шаг — отметить заказанной, когда заказ оформлен.",
    ordered: "Когда материал на объекте, заявку закрывают.",
    closed: "Материал на объекте, заявка закрыта.",
    declined: "Причина ушла прорабу вместе со статусом.",
  };

  const openDecline = (row: MaterialRequest) => {
    setReason("");
    setDeclining(row);
  };

  return (
    <Group
      id="inbox-requests"
      title="Заявки на материал"
      hint={mayDecide ? "решение за снабжением" : "что с вашими заявками"}
      count={`${fmtNum(rows.length)} ${plural(rows.length, "заявка", "заявки", "заявок")}`}
      footer={
        <p className="text-meta px-1 text-text-3">
          Ничего не заказывается автоматически: статус меняет человек, и решение записывается с
          автором.
        </p>
      }
    >
      {rows.map((row) => {
        const tone = REQUEST_TONE[row.status];
        const pending = row.status === "new";
        return (
          <li key={row.id} className="card-v3 flex gap-3 px-4 py-4 sm:px-5">
            <span aria-hidden className={cn("w-[3px] shrink-0 rounded-full", TONE_BAR[tone])} />
            <div className="min-w-0 flex-1">
              <span className="mb-1.5 block">
                <Status tone={tone}>{materialRequestStatusLabel[row.status]}</Status>
              </span>
              <EventHead
                title={row.name}
                aside={
                  <>
                    <span className="text-title block tnum">{fmtNum(row.qty)}</span>
                    <span className="text-meta block text-text-3 tnum">
                      {row.unit} · к {fmtDate(row.neededBy).slice(0, 5)}
                    </span>
                  </>
                }
              />

              <ul className="mt-3 flex flex-col rounded-[20px] bg-surface-2 p-1.5">
                {pending ? (
                  <Answer icon={PackageSearch} label="Что случилось">
                    <span className="tnum">
                      Площадка просит {fmtNum(row.qty)} {row.unit} к {fmtDate(row.neededBy)}
                    </span>
                  </Answer>
                ) : null}
                {pending && row.note ? (
                  <Answer icon={CircleAlert} label="На что влияет">
                    {row.note}
                  </Answer>
                ) : null}
                <Answer icon={UserRound} label="Кто предлагает">
                  {employeeName(row.authorId)}
                  <span className="text-text-2 tnum"> · {fmtDateTime(row.requestedAt)}</span>
                </Answer>
                {row.decision ? (
                  <Answer icon={Scale} label="Решение">
                    {row.decision}
                  </Answer>
                ) : null}
                <Answer icon={ArrowRightCircle} label="Что будет после">
                  {next[row.status]}
                </Answer>
              </ul>

              {mayDecide && pending ? (
                <div className="mt-4 flex flex-col gap-2">
                  {/* Решение снабжения необратимо: сдвиг, а не случайное касание (правило 9) */}
                  <SlideToConfirm
                    label="Сдвиньте, чтобы принять"
                    confirmedLabel="Принята"
                    disabled={decide.isPending}
                    onConfirm={() => run(row, "accepted", "")}
                  />
                  <Button
                    variant="secondary"
                    className="h-12 rounded-full"
                    onClick={() => openDecline(row)}
                  >
                    Отклонить с причиной
                  </Button>
                </div>
              ) : null}
              {mayDecide && after[row.status] ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    className="h-12 rounded-full px-5"
                    disabled={decide.isPending}
                    onClick={() => run(row, after[row.status]!.to, row.decision ?? "")}
                  >
                    {after[row.status]!.label}
                  </Button>
                  {row.status === "accepted" ? (
                    <Button
                      variant="ghost"
                      className="h-12 rounded-full px-5"
                      onClick={() => openDecline(row)}
                    >
                      Отклонить
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}

      <BottomSheet
        open={!!declining}
        onOpenChange={(open) => !open && setDeclining(null)}
        title={`Отклонить: ${declining?.name ?? ""}`}
        description="Причина уйдёт прорабу вместе со статусом"
      >
        <div className="flex flex-col gap-3 pb-2">
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Например: есть на складе объекта, заберите у кладовщика"
            aria-label="Причина отказа"
            rows={3}
          />
          <Button
            variant="accent"
            className="text-body h-14 rounded-full lg:h-12"
            disabled={reason.trim().length < 3 || decide.isPending}
            onClick={() => {
              if (!declining) return;
              run(declining, "declined", reason.trim());
              setDeclining(null);
            }}
          >
            Отклонить заявку
          </Button>
        </div>
      </BottomSheet>
    </Group>
  );
}
