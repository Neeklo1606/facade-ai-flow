/**
 * Карточка записи времени (ADR-044, F5, п. 4): что ввёл бригадир, что посчитала система,
 * почему запись помечена и что с ней делали. Используется в проверке и в журнале, чтобы
 * цифры и пояснения были одни и те же. Строки с иконками, как лист деталей в референсе.
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
  ENTRY_STATUS_LABEL,
  fmtHours,
  fmtRate,
  fmtRub,
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
    <div className="flex items-start gap-3 py-2.5">
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-text-2"
      >
        <Icon className="size-[18px]" strokeWidth={1.7} />
      </span>
      <div className="min-w-0 flex-1">
        <dt className="text-[12px] leading-4 text-text-3">{label}</dt>
        <dd className="mt-0.5 text-[15px] leading-5 text-text tnum">{children}</dd>
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[var(--r-lg)] bg-surface-2 px-4 py-3">
      <h3 className="text-[13px] leading-5 font-semibold text-text-2">{title}</h3>
      {children}
    </section>
  );
}

const ORIGIN_TEXT: Record<EntryView["amountOrigin"], string> = {
  entry: "Начисление из фактического отчёта заказчика",
  estimate: "Подтверждённая стоимость работ по объекту",
  manual: "Ручной ввод менеджера: объект без сметы",
  none: "Суммы нет",
};

const ACTION_TEXT = {
  confirm: "Подтверждено",
  reject: "Отклонено",
  clarify: "Возвращено на уточнение",
  correct: "Исправлено",
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
    <div className="flex flex-col gap-3">
      <Block title="Ввёл бригадир">
        <dl className="mt-1">
          <Row icon={MapPin} label="Объект">
            {object?.label ?? "Объект не указан"}
          </Row>
          <Row icon={CalendarDays} label="День работы">
            {fmtEntryDay(entry.day)}
          </Row>
          <Row icon={Clock} label="Начало и окончание">
            {frame ?? <span className="text-text-3">В выгрузке заказчика нет рамки смены</span>}
          </Row>
          <Row icon={Coffee} label="Перерыв">
            {entry.breakMinutes > 0 ? `${entry.breakMinutes} мин` : "Без перерыва"}
          </Row>
          <Row icon={Users} label="Кто">
            {brigade?.name ?? "Бригада не указана"}
            {employee ? ` · ${employee.name}` : ""}
          </Row>
          {group ? (
            <Row icon={Building2} label="Подразделение">
              {group.name}
            </Row>
          ) : null}
          <Row icon={Send} label="Внесено">
            {fmtAt(entry.createdAt)} <SourceMark source={entry.source} className="ms-1" />
          </Row>
        </dl>
      </Block>

      <Block title="Посчитала система">
        <dl className="mt-1">
          <Row icon={Timer} label="Время без перерыва">
            {entry.minutes} мин = {fmtHours(view.hours)}
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
                <Row icon={FileText} label="Доходность в файле заказчика">
                  {fmtRate(entry.revenueInFile)}
                </Row>
              ) : null}
            </>
          ) : null}
        </dl>
      </Block>

      <Block title="Почему помечено">
        {marks.length === 0 ? (
          <p className="mt-2 pb-1 text-[14px] leading-5 text-text-2">
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
                  <p className="text-[14px] leading-5 font-medium text-text">
                    {mark.label}
                    <span className="ms-2 text-[12px] font-normal text-text-3">
                      {LEVEL_LABEL[mark.level]}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[13px] leading-5 text-text-2">{mark.why}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="История">
        <ol className="mt-2 flex flex-col">
          <HistoryItem
            title={entry.source === "fact-report" ? "Перенесено из отчёта заказчика" : "Внесено"}
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
        {entry.comment && history.length === 0 ? (
          <p className="pb-2 text-[13px] text-text-2">{entry.comment}</p>
        ) : null}
        <p className="pb-1 text-[12px] leading-4 text-text-3">
          Сейчас: {ENTRY_STATUS_LABEL[entry.status].toLowerCase()}
        </p>
      </Block>
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
        <p className="text-[14px] leading-5 text-text">
          {title} <span className="text-[12px] text-text-3 tnum">· {fmtAt(at)}</span>
        </p>
        {comment ? <p className="mt-0.5 text-[13px] leading-5 text-text-2">{comment}</p> : null}
        {changes.length > 0 ? (
          <ul className="mt-0.5 text-[12px] leading-4 text-text-3 tnum">
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
