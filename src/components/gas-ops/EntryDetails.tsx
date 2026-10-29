/**
 * Карточка записи времени (ADR-044, F5, п. 4): что ввёл бригадир, что посчитала система,
 * почему запись помечена и что с ней делали. Используется в проверке и в журнале, чтобы
 * цифры и пояснения были одни и те же. Вид ADR-045, 4.15: строки 48-52 с иконкой 20 без круга,
 * подпись text-meta над значением text-body, группы с заголовком text-meta без заливки.
 */
import {
  Building2,
  CalendarDays,
  Clock,
  Coffee,
  FileText,
  MapPin,
  Receipt,
  Send,
  Timer,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  CHANNEL_LABEL,
  ENTRY_STATUS_LABEL,
  fmtHours,
  fmtManHours,
  fmtRate,
  fmtRub,
  headcountOf,
  manMinutesOf,
  useGasActor,
  type EntryView,
} from "@/api/gas-ops";
import { SourceMark } from "./marks";
import { LEVEL_DOT, LEVEL_LABEL, entryFrame, fmtEntryDay, marksOf } from "./review/rules";
import { cn } from "@/lib/utils";

/** «03.10 в 13:05» */
function fmtAt(at: string): string {
  return `${at.slice(8, 10)}.${at.slice(5, 7)} в ${at.slice(11, 16)}`;
}

function Row({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-12 items-start gap-3 py-1.5">
      <Icon aria-hidden className="mt-2.5 size-5 shrink-0 text-text-3" strokeWidth={1.75} />
      <div className="min-w-0 flex-1">
        <dt className="text-meta text-text-3">{label}</dt>
        <dd className="text-body text-text tnum">{children}</dd>
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-3 first:border-t-0 first:pt-0">
      <h3 className="text-meta-strong text-text-2">{title}</h3>
      {children}
    </section>
  );
}

const ORIGIN_TEXT: Record<EntryView["amountOrigin"], string> = {
  entry: "Начисление из недельного отчёта",
  estimate: "Подтверждённая стоимость работ по объекту",
  manual: "Ручной ввод менеджера: объект без сметы",
  none: "Суммы нет",
};

const ACTION_TEXT = {
  confirm: "Подтверждено",
  reject: "Отклонено",
  clarify: "Возвращено на уточнение",
  correct: "Исправлено",
  answer: "Бригадир ответил",
} as const;

/** Поля, которые история не повторяет: статус уже в заголовке пункта, комментарий ниже */
const HIDDEN_CHANGES = new Set(["Статус", "Комментарий"]);

export function EntryDetails({ view }: { view: EntryView }) {
  const actor = useGasActor();
  const { entry, object, brigade, employee, group, estimate } = view;
  const frame = entryFrame(view);
  const marks = marksOf(view);
  // История от старого к новому: так читается, что было сначала и чем кончилось
  const history = [...view.history].reverse();

  return (
    <div className="flex flex-col gap-4">
      <Block title="Ввёл бригадир">
        <dl className="mt-1">
          <Row icon={MapPin} label="Объект">
            {object?.label ?? "Объект не указан"}
          </Row>
          <Row icon={CalendarDays} label="День работы">
            {fmtEntryDay(entry.day)}
          </Row>
          <Row icon={Clock} label="Начало и окончание">
            {frame ?? <span className="text-text-3">В недельном отчёте нет рамки смены</span>}
          </Row>
          <Row icon={Coffee} label="Перерыв">
            {entry.breakMinutes > 0 ? `${entry.breakMinutes} мин` : "Без перерыва"}
          </Row>
          <Row icon={Users} label="Кто">
            {brigade?.name ?? "Бригада не указана"}
            {employee ? ` · ${employee.name}` : ""}
          </Row>
          <Row icon={Users} label="Состав">
            {headcountOf(entry) === null ? (
              <span className="text-text-3">Не указан: в недельном отчёте состава нет</span>
            ) : entry.people?.length ? (
              `${entry.people.length} чел., у сотрудников разное время`
            ) : (
              `${entry.headcount} чел.`
            )}
          </Row>
          {entry.note ? (
            <Row icon={FileText} label="Комментарий бригадира">
              {entry.note}
            </Row>
          ) : null}
          {group ? (
            <Row icon={Building2} label="Подразделение">
              {group.name}
            </Row>
          ) : null}
          <Row icon={Send} label="Внесено">
            {fmtAt(entry.createdAt)}
            {entry.channel ? ` · ${CHANNEL_LABEL[entry.channel]}` : ""}{" "}
            <SourceMark source={entry.source} className="ms-1" />
          </Row>
        </dl>
      </Block>

      <Block title="Посчитала система">
        <dl className="mt-1">
          <Row icon={Timer} label="Время без перерыва">
            {entry.minutes} мин = {fmtHours(view.hours)}
          </Row>
          <Row icon={Users} label="Человеко-часы">
            {manMinutesOf(entry) === null ? (
              <span className="text-text-3">Не считаются: состав не указан</span>
            ) : (
              fmtManHours(manMinutesOf(entry)!, "чел.-ч")
            )}
          </Row>
          {actor.canSeeMoney ? (
            <>
              <Row icon={Wallet} label="Сумма начисления">
                {entry.amountRub === null ? (
                  <span className="text-text-3">Нет суммы</span>
                ) : (
                  fmtRub(entry.amountRub)
                )}
              </Row>
              <Row icon={TrendingUp} label="Доходность часа">
                {view.revenue === null ? (
                  <span className="text-text-3">Не считается: нет суммы или нет минут</span>
                ) : (
                  fmtRate(view.revenue)
                )}
              </Row>
              <Row icon={FileText} label="Откуда сумма">
                {view.amountOrigin === "manual" && estimate?.status === "manual-pending"
                  ? "Ручная стоимость менеджера, ждёт подтверждения"
                  : ORIGIN_TEXT[view.amountOrigin]}
              </Row>
              {estimate ? (
                <Row icon={Receipt} label="Стоимость работ объекта">
                  {estimate.status === "confirmed"
                    ? `${fmtRub(estimate.amountRub)}, версия ${estimate.version}`
                    : estimate.status === "manual-pending"
                      ? "Ждёт ручного подтверждения менеджером"
                      : "Не передана"}
                </Row>
              ) : null}
              {entry.revenueInFile != null ? (
                <Row icon={FileText} label="Доходность в недельном отчёте">
                  {fmtRate(entry.revenueInFile)}
                </Row>
              ) : null}
            </>
          ) : null}
        </dl>
      </Block>

      <div id="entry-why" className="scroll-mt-4" />
      <Block title="Почему помечено">
        {marks.length === 0 ? (
          <p className="mt-2 pb-1 text-body text-text-2">
            Замечаний нет: время не пересекается, дублей нет, сумма на месте.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-3 pb-1">
            {marks.map((mark) => (
              <li key={mark.key} className="flex gap-3">
                <span
                  aria-hidden
                  className={cn("mt-1.5 size-2 shrink-0 rounded-full", LEVEL_DOT[mark.level])}
                />
                <div className="min-w-0">
                  <p className="text-body-strong text-text">
                    {mark.label}
                    <span className="ms-2 text-meta text-text-3">{LEVEL_LABEL[mark.level]}</span>
                  </p>
                  <p className="mt-0.5 text-meta text-text-2">{mark.why}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Block>

      {entry.comment ? (
        <Block title="Решение проверки">
          <p className="mt-1 text-body text-text">{entry.comment}</p>
        </Block>
      ) : null}

      <details className="group border-t border-line pt-3">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-meta-strong text-text-2 focus-ring [&::-webkit-details-marker]:hidden">
          История
          <span className="text-meta font-normal text-text-3 group-open:hidden">
            {history.length ? `${history.length + 1} события` : "Внесено"}, показать
          </span>
        </summary>
        <ol className="mt-2 flex flex-col">
          <HistoryItem
            title={entry.source === "fact-report" ? "Перенесено из недельного отчёта" : "Внесено"}
            at={entry.createdAt}
            last={history.length === 0}
          />
          {history.map((item, index) => (
            <HistoryItem
              key={item.id}
              title={ACTION_TEXT[item.action]}
              at={item.at}
              last={index === history.length - 1}
              comment={item.comment}
              changes={item.changes.filter((c) => !HIDDEN_CHANGES.has(c.field))}
            />
          ))}
        </ol>
        <p className="pb-1 text-meta text-text-3">
          Сейчас: {ENTRY_STATUS_LABEL[entry.status].toLowerCase()}
        </p>
      </details>
    </div>
  );
}

function HistoryItem({
  title,
  at,
  last,
  comment,
  changes = [],
}: {
  title: string;
  at: string;
  last: boolean;
  comment?: string | null;
  changes?: { field: string; from: string; to: string }[];
}) {
  return (
    <li className="relative flex gap-3 pb-3">
      <span aria-hidden className="relative flex w-2 shrink-0 justify-center">
        <span className="mt-1.5 size-2 rounded-full bg-text-3" />
        {last ? null : <span className="absolute top-4 bottom-[-6px] w-px bg-line-2" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body text-text">
          {title} <span className="text-meta text-text-3 tnum">· {fmtAt(at)}</span>
        </p>
        {comment ? <p className="mt-0.5 text-meta text-text-2">{comment}</p> : null}
        {changes.length > 0 ? (
          <ul className="mt-0.5 text-meta text-text-3 tnum">
            {changes.map((change) => (
              <li key={change.field}>
                {change.field}: {change.from} → {change.to}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  );
}
