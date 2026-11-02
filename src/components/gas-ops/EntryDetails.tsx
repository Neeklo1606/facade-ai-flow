/**
 * Деталь записи времени для «Проверки» и «Журнала» (ADR-061, 10; раздел 4.3): пять блоков –
 * «Что проверить», «Данные бригадира», «Расчёт», «Стоимость», «История». Одна и та же деталь
 * на обоих экранах, поэтому цифры и пояснения совпадают. Правила в domain (`entry-info.ts`).
 */
import { GitCompare } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  CHANNEL_LABEL,
  ENTRY_STATUS_LABEL,
  INFO_KIND_LABEL,
  costBreakdown,
  entryInfo,
  fmtHours,
  fmtManHours,
  fmtRub,
  headcountOf,
  manMinutesOf,
  remarksOf,
  useGasActor,
  useGasEntry,
  useGasUsers,
  type EntryView,
  type Remark,
} from "@/api/gas-ops";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SourceMark } from "./marks";
import { KIND_DOT } from "./review/kind";
import { entryFrame, fmtEntryDay } from "./review/rules";
import { cn } from "@/lib/utils";

/** «03.10 в 13:05» */
function fmtAt(at: string): string {
  return `${at.slice(8, 10)}.${at.slice(5, 7)} в ${at.slice(11, 16)}`;
}

/** «2 ч 30 мин» */
function fmtDuration(minutes: number): string {
  return `${Math.floor(minutes / 60)} ч ${String(minutes % 60).padStart(2, "0")} мин`;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-3 py-1.5">
      <dt className="text-meta text-text-3">{label}</dt>
      <dd className="min-w-0 text-body text-text tnum">{children}</dd>
    </div>
  );
}

function Block({ title, id, children }: { title: string; id?: string; children: ReactNode }) {
  return (
    <section
      id={id}
      aria-label={title}
      className="scroll-mt-4 border-t border-line pt-3 first:border-t-0 first:pt-0"
    >
      <h3 className="text-meta-strong text-text-2">{title}</h3>
      {children}
    </section>
  );
}

const ACTION_TEXT = {
  confirm: "Принято",
  reject: "Отклонено",
  clarify: "Возвращено на уточнение",
  correct: "Исправлено",
  answer: "Бригадир ответил",
} as const;

/** Поля, которые история не повторяет: статус уже в заголовке пункта, комментарий ниже */
const HIDDEN_CHANGES = new Set(["Статус", "Комментарий"]);

export function EntryDetails({ view }: { view: EntryView }) {
  const actor = useGasActor();
  const users = useGasUsers();
  const nameOf = (id: string | null) => (id ? (users.find((u) => u.id === id)?.name ?? id) : null);
  const { entry, object } = view;
  const info = entryInfo(view);
  const remarks = remarksOf(info);
  const frame = entryFrame(view);
  const people = headcountOf(entry);
  const man = manMinutesOf(entry);
  const cost = costBreakdown(view, nameOf(view.estimate?.confirmedBy ?? null));
  const answers = view.history.filter((r) => r.action === "answer");
  // История от старого к новому: так читается, что было сначала и чем кончилось
  const history = [...view.history].reverse();
  const [compare, setCompare] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <Block title="Что проверить" id="entry-why">
        {remarks.length === 0 ? (
          <p className="mt-2 pb-1 text-body text-text-2">
            Замечаний нет: данные полные, время не пересекается, дублей нет.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-3 pb-1">
            {remarks.map((remark) => (
              <RemarkItem
                key={remark.key}
                remark={remark}
                compareWith={
                  remark.key === "duplicate"
                    ? view.duplicates
                    : remark.key === "overlap"
                      ? view.overlaps
                      : []
                }
                onCompare={setCompare}
              />
            ))}
          </ul>
        )}
      </Block>

      <Block title="Данные бригадира">
        <dl className="mt-1">
          <Row label="Автор">{view.author ?? "Выгрузка заказчика"}</Row>
          <Row label="Канал">
            {entry.channel
              ? CHANNEL_LABEL[entry.channel]
              : entry.source === "fact-report"
                ? CHANNEL_LABEL.import
                : "Не указан"}{" "}
            <SourceMark source={entry.source} className="ms-1" />
          </Row>
          <Row label="Отправлено">{fmtAt(entry.createdAt)}</Row>
          <Row label="Объект">{object?.label ?? "Объект не указан"}</Row>
          <Row label="День работы">{fmtEntryDay(entry.day)}</Row>
          {entry.note ? <Row label="Комментарий">{entry.note}</Row> : null}
          {answers.map((answer) => (
            <Row key={answer.id} label={`Ответ ${fmtAt(answer.at)}`}>
              {answer.comment ?? "–"}
            </Row>
          ))}
        </dl>
      </Block>

      <Block title="Расчёт">
        <dl className="mt-1">
          <Row label="Интервал">
            {frame ?? <span className="text-text-3">без рамки смены: в отчёте только минуты</span>}
          </Row>
          <Row label="Перерыв">
            {entry.breakMinutes > 0 ? `${entry.breakMinutes} мин` : "без перерыва"}
          </Row>
          <Row label="Минуты">{entry.minutes} мин</Row>
          <Row label="Часы">{fmtHours(view.hours)}</Row>
          <Row label="Состав">
            {people === null ? (
              <span className="text-text-3">
                не указан
                {entry.source === "fact-report" ? ": в отчёте заказчика состава нет" : ""}
              </span>
            ) : entry.people?.length ? (
              `${people} чел., время по людям`
            ) : (
              `${people} чел.`
            )}
          </Row>
          <Row label="Чел.-ч">
            {man === null ? (
              <span className="text-text-2" data-testid="man-hours">
                не рассчитано <span className="text-meta text-text-3">· состав не указан</span>
              </span>
            ) : (
              <span data-testid="man-hours">{fmtManHours(man, "чел.-ч")}</span>
            )}
          </Row>
        </dl>
      </Block>

      {actor.canSeeMoney ? (
        <Block title="Стоимость">
          <dl className="mt-1">
            <Row label="Сумма">
              {cost.amountRub === null ? (
                <span className="text-text-2" data-testid="cost-amount">
                  не рассчитано
                </span>
              ) : (
                <span data-testid="cost-amount">
                  {cost.expected ? "≈ " : ""}
                  {fmtRub(cost.amountRub)}
                  {cost.expected ? (
                    <span className="ms-1.5 text-meta text-text-3">начислится при принятии</span>
                  ) : null}
                </span>
              )}
            </Row>
            <Row label="Источник">{cost.source}</Row>
            <Row label="Как посчитано">{cost.formula}</Row>
            <Row label="Длительность">{fmtDuration(cost.durationMinutes)}</Row>
            {cost.perHour !== null ? (
              <Row label="На час длительности">
                {fmtRub(cost.perHour)}
                <span className="block text-meta text-text-3">это не стоимость человеко-часа</span>
              </Row>
            ) : null}
          </dl>
        </Block>
      ) : null}

      {entry.comment ? (
        <Block title="Решение проверки">
          <p className="mt-1 text-body text-text">{entry.comment}</p>
        </Block>
      ) : null}

      <Block title="История">
        <ol className="mt-2 flex flex-col">
          <HistoryItem
            title={entry.source === "fact-report" ? "Перенесено из недельного отчёта" : "Внесено"}
            who={view.author}
            at={entry.createdAt}
            last={history.length === 0}
          />
          {history.map((item, index) => (
            <HistoryItem
              key={item.id}
              title={ACTION_TEXT[item.action]}
              who={nameOf(item.actor)}
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
      </Block>

      {compare ? (
        <CompareDialog view={view} otherId={compare} onClose={() => setCompare(null)} />
      ) : null}
    </div>
  );
}

function RemarkItem({
  remark,
  compareWith,
  onCompare,
}: {
  remark: Remark;
  compareWith: { id: string; number: string }[];
  onCompare: (id: string) => void;
}) {
  return (
    <li className="flex gap-3" data-remark={remark.key}>
      <span
        aria-hidden
        className={cn("mt-1.5 size-2 shrink-0 rounded-full", KIND_DOT[remark.kind])}
      />
      <div className="min-w-0 flex-1">
        <p className="text-body-strong text-text">
          {remark.label}
          <span className="ms-2 text-meta font-normal text-text-3">
            {INFO_KIND_LABEL[remark.kind]}
          </span>
        </p>
        <p className="mt-0.5 text-meta text-text-2">{remark.found}</p>
        <p className="text-meta text-text-3 tnum">Данные: {remark.data}</p>
        <p className="text-meta text-text-2">{remark.todo}</p>
        <p className={`text-meta ${remark.blocksAccept ? "text-danger" : "text-text-3"}`}>
          {remark.blocksAccept
            ? "Принять нельзя, пока не исправлено"
            : remark.kind === "finance"
              ? "Принятию не мешает"
              : "Принять можно, но не пачкой «без замечаний»"}
        </p>
        {compareWith.length ? (
          <div className="mt-1 flex flex-wrap gap-2">
            {compareWith.map((other) => (
              <button
                key={other.id}
                type="button"
                onClick={() => onCompare(other.id)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-control border border-line-2 bg-surface px-3 text-body-strong text-text transition-fast focus-ring press-98 is-hover:bg-surface-2 lg:min-h-control-sm"
              >
                <GitCompare className="size-4" aria-hidden />
                Сравнить с {other.number}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </li>
  );
}

/** Поля сравнения двух записей: подпись и значение */
function compareRows(view: EntryView): [string, string][] {
  const { entry } = view;
  const people = headcountOf(entry);
  return [
    ["Номер", entry.number],
    ["Статус", ENTRY_STATUS_LABEL[entry.status]],
    ["Бригада", view.brigade?.name ?? "–"],
    ["Объект", view.object?.label ?? "–"],
    ["День", fmtEntryDay(entry.day)],
    ["Интервал", entryFrame(view) ?? "без рамки"],
    ["Перерыв", `${entry.breakMinutes} мин`],
    ["Минуты", `${entry.minutes} мин`],
    ["Состав", people === null ? "не указан" : `${people} чел.`],
    ["Канал", entry.channel ? CHANNEL_LABEL[entry.channel] : "–"],
    ["Автор", view.author ?? "Выгрузка заказчика"],
    ["Отправлено", fmtAt(entry.createdAt)],
  ];
}

/** «Сравнить»: две записи рядом, отличия подсвечены (4.3, блок 1) */
function CompareDialog({
  view,
  otherId,
  onClose,
}: {
  view: EntryView;
  otherId: string;
  onClose: () => void;
}) {
  const other = useGasEntry(otherId);
  if (!other) return null;
  const left = compareRows(view);
  const right = compareRows(other);
  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-w-[640px]">
        <DialogHeader>
          <DialogTitle>
            Сравнение {view.entry.number} и {other.entry.number}
          </DialogTitle>
        </DialogHeader>
        <table className="w-full text-body tnum" data-testid="compare">
          <thead>
            <tr className="text-meta text-text-3">
              <th className="w-28 py-1 text-left font-normal" scope="col">
                Поле
              </th>
              <th className="py-1 text-left font-normal" scope="col">
                {view.entry.number}
              </th>
              <th className="py-1 text-left font-normal" scope="col">
                {other.entry.number}
              </th>
            </tr>
          </thead>
          <tbody>
            {left.map(([label, value], index) => {
              const value2 = right[index]?.[1] ?? "–";
              const differs = label !== "Номер" && value !== value2;
              return (
                <tr
                  key={label}
                  data-differs={differs || undefined}
                  className={cn("border-t border-line", differs && "bg-warn-bg")}
                >
                  <th
                    scope="row"
                    className="py-1.5 pe-2 text-left text-meta font-normal text-text-3"
                  >
                    {label}
                  </th>
                  <td className="py-1.5 pe-2">{value}</td>
                  <td className="py-1.5">{value2}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-meta text-text-3">Строки с отличиями подсвечены.</p>
      </DialogContent>
    </Dialog>
  );
}

function HistoryItem({
  title,
  who,
  at,
  last,
  comment,
  changes = [],
}: {
  title: string;
  who: string | null;
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
          {title}
          <span className="text-meta text-text-3 tnum">
            {" "}
            · {who ? `${who}, ` : ""}
            {fmtAt(at)}
          </span>
        </p>
        {comment ? <p className="mt-0.5 text-meta text-text-2">Причина: {comment}</p> : null}
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
