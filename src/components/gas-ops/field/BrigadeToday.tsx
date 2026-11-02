/**
 * «Сегодня» бригадира (ADR-056, 6; ADR-061, 9; раздел 4.1): отдельный интерфейс телефона.
 * Что уже сдано, что нужно уточнить, напоминание по графику, большая кнопка «Добавить время»,
 * форма на одном экране с проверкой перед отправкой, «Мои записи».
 *
 * Типичная запись — пять касаний: «Добавить время», 08:00, 17:00, «Проверить», «Отправить».
 * Объект из графика, дата и состав уже подставлены. Уже внесённое время — серая строка над
 * полем, не запрет: пересечение уходит менеджеру признаком. Запрет только на полный дубль.
 *
 * Данные — выборка `useGasField`: та же, что отдаёт порт, без сумм и чужих бригад. Отправка
 * с ключом: без сети запись «Сохранено на телефоне», после ответа «Принято сервером»;
 * повтор с тем же ключом дубля не создаёт.
 */
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Bot, ChevronRight, Clock3, MessageCircleQuestion, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  busyLine,
  checkEntry,
  checkFlags,
  crewSummary,
  entryFrame,
  FLAG_LABEL,
  formatClock,
  parseTimeInput,
  previewMinutes,
  rangeLabel,
  TIME_INPUT_TEXT,
  useGasActions,
  useGasActor,
  useGasBusy,
  useGasField,
  type FieldEntry,
  type PersonInput,
} from "@/api/gas-ops";
import {
  Button,
  Card,
  EmptyState,
  FormField,
  NumberStepper,
  OfflineBadge,
  SegmentedPills,
  SelectSheet,
  StatusChip,
  TimeChips,
  type StatusTone,
} from "@/components/ui/mono";
import {
  drainQueue,
  newClientKey,
  queueAdd,
  queueRemove,
  readQueue,
  writeQueue,
  type QueuedEntry,
  type SendResult,
} from "@/lib/gas-ops/field-queue";
import { splitTimeEnabled } from "@/lib/gas-ops/gas-only";
import { useOffline } from "@/lib/ui/offline";
import { cn } from "@/lib/utils";

/** Бригада, за которую смотрят менеджер и администратор */
const VIEW_BRIGADE = "brg-1";

const START_CHIPS = ["07:00", "08:00", "09:00"];
const END_CHIPS = ["16:00", "17:00", "18:00"];
const BREAKS = [
  { value: "0", label: "0" },
  { value: "30", label: "30" },
  { value: "45", label: "45" },
  { value: "60", label: "60" },
  { value: "90", label: "90" },
  { value: "other", label: "другое" },
] as const;
/** Календарь даты: на 7 дней назад (раздел 4.1) */
const DAYS_BACK = 7;

const STATUS_TONE: Record<FieldEntry["status"], StatusTone> = {
  draft: "neutral",
  pending: "caution",
  confirmed: "up",
  rejected: "down",
  clarify: "note",
};

/** Подпись статуса строкой «Сегодня»: «ждёт проверки», «принята» */
const STATUS_SHORT: Record<FieldEntry["status"], string> = {
  draft: "черновик",
  pending: "ждёт проверки",
  confirmed: "принята",
  rejected: "отклонена",
  clarify: "нужно уточнить",
};

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function fmtDay(day: string): string {
  return `${day.slice(8, 10)}.${day.slice(5, 7)}`;
}

function minutesText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

/** День на `n` дней раньше: ISO-дата без часового пояса */
function daysBefore(day: string, n: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - n);
  return date.toISOString().slice(0, 10);
}

function plural(n: number, one: string, few: string, many: string): string {
  const d = n % 10;
  const t = n % 100;
  if (d === 1 && t !== 11) return one;
  if (d >= 2 && d <= 4 && (t < 12 || t > 14)) return few;
  return many;
}

interface Draft {
  objectId: string | null;
  day: string;
  /** Как набрал бригадир: «8-17», «с 8:30 до 16» */
  timeText: string;
  start: number | null;
  end: number | null;
  breakMinutes: (typeof BREAKS)[number]["value"];
  otherBreak: string;
  headcount: number;
  /** «Отметить людей»: отмеченные сотрудники; null — только число */
  marked: string[] | null;
  split: boolean;
  people: PersonInput[];
  note: string;
  clientKey: string;
}

type Step = "today" | "form" | "check" | "sent";

export function BrigadeToday() {
  const actor = useGasActor();
  const field = useGasField(actor.role === "foreman" ? null : VIEW_BRIGADE);
  const actions = useGasActions();
  const network = useOffline();
  const [step, setStep] = useState<Step>("today");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueuedEntry[]>([]);
  const [focus, setFocus] = useState<string | null>(null);
  const [sent, setSent] = useState<{
    key: string;
    state: "local" | "server";
    number: string | null;
  } | null>(null);

  useEffect(() => setQueue(readQueue(storage())), []);

  const crewSize = field.crew.length;
  // Сдано — отправленное: черновик ещё у бригадира, отклонённое не в счёт
  const today = field.entries.filter(
    (e) => e.day === field.today && e.status !== "rejected" && e.status !== "draft",
  );
  const clarify = field.entries.filter((e) => e.status === "clarify");
  const doneObjects = new Set(today.map((e) => e.objectId));
  const expected = field.todayObjects.filter((o) => !doneObjects.has(o.id));

  const startDraft = () => {
    setDraft({
      // Первым — объект из графика, по которому ещё нет записи
      objectId: expected[0]?.id ?? field.todayObjects[0]?.id ?? null,
      day: field.today,
      timeText: "",
      start: null,
      end: null,
      breakMinutes: "60",
      otherBreak: "",
      headcount: Math.max(1, crewSize),
      marked: null,
      split: false,
      people: field.crew.map((m) => ({
        employeeId: m.employeeId,
        start: "08:00",
        end: "17:00",
        breakMinutes: "60",
      })),
      note: "",
      clientKey: newClientKey(),
    });
    setError(null);
    setStep("form");
  };

  /** Отправка в порт: сбой связи оставляет запись в очереди, отказ правила снимает её */
  const send = useCallback(
    async (item: QueuedEntry): Promise<SendResult> => {
      const result = await actions.createEntry(item.input);
      if (result.ok) return { ok: true, number: result.value.number };
      return { ok: false, network: result.code === "unknown", message: result.message };
    },
    [actions],
  );

  // Сеть вернулась: очередь уходит на сервер тем же ключом
  useEffect(() => {
    if (network.offline || queue.length === 0) return;
    void (async () => {
      const result = await drainQueue(queue, send);
      writeQueue(storage(), result.queue);
      setQueue(result.queue);
      const mine = result.accepted.find((a) => a.clientKey === sent?.key);
      if (mine) setSent({ key: mine.clientKey, state: "server", number: mine.number });
    })();
  }, [network.offline, queue, send, sent?.key]);

  if (!field.brigade) {
    return (
      <EmptyState
        title="Бригада не выбрана"
        text="Интерфейс бригадира открывается для своей бригады. Войдите ролью «Бригадир»."
      />
    );
  }

  const brigadeId = field.brigade.id;
  const known = field.entries.map((e) => ({ ...e, brigadeId }));

  if (step === "form" && draft) {
    return (
      <EntryForm
        draft={draft}
        onChange={setDraft}
        field={field}
        error={error}
        onBack={() => setStep("today")}
        onCheck={() => {
          const problem = checkDraft(draft);
          setError(problem);
          if (!problem) setStep("check");
        }}
      />
    );
  }

  if (step === "check" && draft) {
    const input = inputOf(draft, field);
    const object = field.allowedObjects.find((o) => o.id === draft.objectId);
    const check = checkEntry(known, {
      brigadeId,
      objectId: draft.objectId!,
      day: draft.day,
      start: draft.split ? null : draft.start,
      end: draft.split ? null : draft.end,
    });
    const twin = draft.split ? null : check.twin;
    const flags = checkFlags(check);
    const late = draft.day < field.today;
    return (
      <div className="flex flex-col gap-4">
        <h2 className="type-screen">Проверьте перед отправкой</h2>
        <Card>
          <dl className="flex flex-col divide-y divide-line">
            <Fact term="Объект" value={object?.label ?? "не выбран"} />
            <Fact term="Бригада" value={field.brigade.name} />
            <Fact
              term="Дата"
              value={
                <span className="flex flex-wrap items-center justify-end gap-2">
                  {fmtDay(input.day)}
                  {late ? <StatusChip tone="caution">внесено позже</StatusChip> : null}
                </span>
              }
            />
            <Fact
              term="Время"
              value={
                draft.split
                  ? "У сотрудников разное время"
                  : `${formatClock(draft.start!)} – ${formatClock(draft.end!)}, перерыв ${breakOf(draft)} мин`
              }
            />
            <Fact term="Состав" value={previewOf(draft, field)} />
            {draft.note.trim() ? <Fact term="Комментарий" value={draft.note.trim()} /> : null}
          </dl>
        </Card>
        {twin ? (
          <div role="alert" className="mono-inset flex flex-col gap-3">
            <p className="type-label">
              Такая запись уже есть: {twin.number}, {entryFrame(twin)}. Вторую такую же система не
              примет.
            </p>
            <Button
              field
              onClick={() => {
                setFocus(twin.id);
                setStep("today");
              }}
            >
              Открыть существующую запись
            </Button>
          </div>
        ) : flags.length > 0 ? (
          <ul aria-label="Пометки для менеджера" className="flex flex-col gap-2">
            {flags.map((flag) => (
              <li key={flag} className="mono-inset type-label">
                {flag === "overlap"
                  ? `${FLAG_LABEL.overlap}: ${check.overlaps.map((o) => `${o.entry.number} ${entryFrame(o.entry)}`).join(", ")}. Запись примем, менеджер увидит пометку.`
                  : `${FLAG_LABEL["repeat-visit"]}: на этом объекте за день уже ${check.repeatVisits.map((e) => `${e.number} ${entryFrame(e)}`).join(", ")}. Запись примем с пометкой.`}
              </li>
            ))}
          </ul>
        ) : null}
        {error ? (
          <p role="alert" className="type-label text-down">
            {error}
          </p>
        ) : null}
        <div className="flex flex-col gap-3">
          {twin ? null : (
            <Button
              field
              onClick={async () => {
                const item: QueuedEntry = {
                  clientKey: draft.clientKey,
                  input,
                  savedAt: new Date().toISOString(),
                };
                // Сначала на телефон: обрыв связи после нажатия запись не теряет
                const next = queueAdd(readQueue(storage()), item);
                writeQueue(storage(), next);
                setQueue(next);
                setSent({ key: item.clientKey, state: "local", number: null });
                setError(null);
                if (network.offline) {
                  setStep("sent");
                  return;
                }
                const result = await send(item);
                if (!result.ok && result.network) {
                  setStep("sent");
                  return;
                }
                const rest = queueRemove(readQueue(storage()), item.clientKey);
                writeQueue(storage(), rest);
                setQueue(rest);
                if (!result.ok) {
                  // Правило не пропустило: запись остаётся в форме, очередь её не держит
                  setSent(null);
                  setError(result.message);
                  return;
                }
                setSent({ key: item.clientKey, state: "server", number: result.number });
                setStep("sent");
              }}
            >
              Отправить
            </Button>
          )}
          <Button variant="secondary" field onClick={() => setStep("form")}>
            Исправить
          </Button>
        </div>
      </div>
    );
  }

  if (step === "sent" && sent) {
    return (
      <div className="flex flex-col items-start gap-4">
        <OfflineBadge state={sent.state} />
        <h2 className="type-screen">
          {sent.state === "server" ? `Запись ${sent.number ?? ""} принята` : "Запись на телефоне"}
        </h2>
        <p className="type-text text-ink-2">
          {sent.state === "server"
            ? "Ждёт проверки. Если у менеджера появится вопрос, он придёт в «Уточнения»."
            : "Сохранено на телефоне, отправим при связи. Повторно вносить не нужно."}
        </p>
        <Button field className="w-full" onClick={() => setStep("today")}>
          Готово
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Итог дня" className="flex flex-col gap-3">
        <p className="type-label text-ink-2">
          {field.brigade.name} · {fmtDay(field.today)}
        </p>
        {clarify.length > 0 ? (
          <a
            href="#clarify"
            className="mono-inset focus-ring flex min-h-12 items-center justify-between gap-3 type-label"
          >
            <span className="flex items-center gap-2">
              <MessageCircleQuestion className="size-5 shrink-0" aria-hidden />
              Нужно уточнить: {clarify.length}
            </span>
            <ChevronRight className="size-5 shrink-0" aria-hidden />
          </a>
        ) : null}
        <Card as="div" className="flex flex-col gap-2">
          <h2 className="type-label text-ink-2">Сдано сегодня</h2>
          {today.length === 0 ? (
            <p className="type-text text-ink-3">Записей пока нет.</p>
          ) : (
            <ul className="flex flex-col gap-1" aria-label="Сдано сегодня">
              {today.map((e) => (
                <li key={e.id} className="type-text">
                  <span className="font-medium">{e.objectLabel}</span>
                  <span className="text-ink-2">
                    {" "}
                    · {e.startMinutes !== null ? entryFrame(e) : minutesText(e.minutes)}
                    {e.headcount ? ` · ${e.headcount} чел.` : ""} · {STATUS_SHORT[e.status]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {expected.length > 0 ? (
          <p className="type-label text-ink-2">
            По графику ещё {expected.length}{" "}
            {plural(expected.length, "объект", "объекта", "объектов")}:{" "}
            {expected.map((o) => o.code).join(", ")}
          </p>
        ) : null}
        {queue.length > 0 ? (
          <p className="flex flex-wrap items-center gap-2">
            <OfflineBadge state="local" />
            <span className="type-label text-ink-2">Ждут отправки: {queue.length}</span>
          </p>
        ) : null}
        <Button field className="w-full" onClick={startDraft}>
          <Plus aria-hidden />
          Добавить время
        </Button>
      </section>

      {clarify.length > 0 ? (
        <section id="clarify" aria-labelledby="clarify-title" className="flex flex-col gap-3">
          <h2 id="clarify-title" className="type-card">
            Уточнения
          </h2>
          <ul className="mono-card flex flex-col divide-y divide-line p-0 lg:p-0">
            {clarify.map((entry) => (
              <MyEntry
                key={entry.id}
                entry={entry}
                focused={focus === entry.id}
                onAnswer={actions.answerClarify}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="my-entries" className="flex flex-col gap-3">
        <h2 id="my-entries" className="type-card">
          Мои записи
        </h2>
        {field.entries.length === 0 ? (
          <EmptyState
            icon={Clock3}
            title="Записей пока нет"
            text="Внесите время за сегодня кнопкой выше."
          />
        ) : (
          <ul className="mono-card flex flex-col divide-y divide-line p-0 lg:p-0">
            {field.entries
              .filter((e) => e.status !== "clarify")
              .slice(0, 12)
              .map((entry) => (
                <MyEntry
                  key={entry.id}
                  entry={entry}
                  focused={focus === entry.id}
                  onAnswer={actions.answerClarify}
                />
              ))}
          </ul>
        )}
      </section>

      <Link
        to="/gas/foreman"
        className="mono-row focus-ring self-start rounded-pill type-label text-ink-2"
      >
        <Bot className="size-5" aria-hidden />
        Тот же ввод в боте MAX: демо, канал не подключён
      </Link>
    </div>
  );
}

function Fact({ term, value }: { term: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <dt className="type-label text-ink-3">{term}</dt>
      <dd className="text-end type-text font-medium">{value}</dd>
    </div>
  );
}

function MyEntry({
  entry,
  focused,
  onAnswer,
}: {
  entry: FieldEntry;
  focused: boolean;
  onAnswer: (input: { id: string; text: string }) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLLIElement>(null);
  // «Открыть существующую запись»: запись прокручивается в вид и подсвечена
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: "center" });
  }, [focused]);
  const frame =
    entry.startMinutes !== null && entry.endMinutes !== null
      ? `${formatClock(entry.startMinutes)} – ${formatClock(entry.endMinutes)}`
      : minutesText(entry.minutes);
  return (
    <li
      ref={ref}
      data-focused={focused ? "true" : undefined}
      className={cn("flex flex-col gap-2 px-4 py-3 lg:px-5", focused && "bg-surface-2")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate type-text font-medium">{entry.objectLabel}</p>
          <p className="type-small text-ink-3">
            {entry.number} · {fmtDay(entry.day)} · {frame} · {crewSummary(entry)}
          </p>
        </div>
        <StatusChip tone={STATUS_TONE[entry.status]}>{entry.statusLabel}</StatusChip>
      </div>
      {entry.status === "clarify" && entry.question ? (
        <div className="flex flex-col gap-2 mono-inset">
          <p className="flex items-start gap-2 type-label">
            <MessageCircleQuestion className="size-5 shrink-0" aria-hidden />
            {entry.question}
          </p>
          <FormField label="Ответ менеджеру" error={error}>
            {(props) => (
              <input
                {...props}
                value={text}
                onChange={(event) => setText(event.target.value)}
                className="mono-input focus-ring"
                placeholder="Например, работали вчетвером"
              />
            )}
          </FormField>
          <Button
            field
            onClick={async () => {
              const result = await onAnswer({ id: entry.id, text });
              setError(result.ok ? null : (result.message ?? "Не отправлено. Повторите."));
              if (result.ok) setText("");
            }}
          >
            Отправить ответ
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function EntryForm({
  draft,
  onChange,
  field,
  error,
  onBack,
  onCheck,
}: {
  draft: Draft;
  onChange: (draft: Draft) => void;
  field: ReturnType<typeof useGasField>;
  error: string | null;
  onBack: () => void;
  onCheck: () => void;
}) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    onChange({ ...draft, [key]: value });
  const busy = useGasBusy(field.brigade?.id ?? null, draft.day);
  const codeOf = (id: string) => field.allowedObjects.find((o) => o.id === id)?.code;
  const todayIds = new Set(field.todayObjects.map((o) => o.id));
  const options = useMemo(
    () => [
      ...field.todayObjects.map((o) => ({
        value: o.id,
        label: o.label,
        meta: `${o.code} · по графику сегодня`,
      })),
      ...field.allowedObjects
        .filter((o) => !todayIds.has(o.id))
        .map((o) => ({ value: o.id, label: o.label, meta: o.code })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [field.todayObjects, field.allowedObjects],
  );
  const nameOf = (id: string) => field.crew.find((m) => m.employeeId === id)?.name ?? "Сотрудник";
  const allowSplit = splitTimeEnabled();

  const earlier = Array.from({ length: DAYS_BACK - 1 }, (_, i) => daysBefore(field.today, i + 2));
  const dayMode =
    draft.day === field.today ? "today" : draft.day === field.yesterday ? "yesterday" : "earlier";

  /** Поле и быстрые кнопки пишут в одно место: строку, начало и окончание */
  const setTime = (start: number | null, end: number | null) =>
    onChange({
      ...draft,
      start,
      end,
      timeText:
        start !== null && end !== null
          ? `${formatClock(start)}–${formatClock(end)}`
          : start !== null
            ? formatClock(start)
            : "",
    });
  const typed = (text: string) => {
    const parsed = parseTimeInput(text);
    onChange({
      ...draft,
      timeText: text,
      start:
        parsed.kind === "range" ? parsed.start : parsed.kind === "clock" ? parsed.minutes : null,
      end: parsed.kind === "range" ? parsed.end : null,
    });
  };
  const parsed = draft.timeText.trim() ? parseTimeInput(draft.timeText) : null;
  const decoded =
    draft.start !== null && draft.end !== null
      ? rangeLabel(draft.start, draft.end) +
        (parsed?.kind === "range" && parsed.confirm ? " · проверьте" : "")
      : parsed?.kind === "clock"
        ? `Начало ${formatClock(parsed.minutes)}${parsed.confirm ? " · проверьте" : ""}. Допишите окончание: 8-17`
        : parsed?.kind === "error"
          ? TIME_INPUT_TEXT[parsed.reason]
          : null;
  const toMinutes = (slot: string) => Number(slot.slice(0, 2)) * 60 + Number(slot.slice(3, 5));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <Button variant="quiet" aria-label="Назад к «Сегодня»" onClick={onBack}>
          <ArrowLeft aria-hidden />
        </Button>
        <h2 className="type-screen">Добавить время</h2>
      </div>

      <SelectSheet
        label="Объект"
        value={draft.objectId}
        onChange={(value) => set("objectId", value)}
        options={options}
        placeholder="Выберите объект"
      />

      <div className="flex flex-col gap-2">
        <span className="type-label text-ink-2">Дата</span>
        <SegmentedPills
          label="Дата"
          options={[
            { value: "today", label: `Сегодня, ${fmtDay(field.today)}` },
            { value: "yesterday", label: `Вчера, ${fmtDay(field.yesterday)}` },
            { value: "earlier", label: "Раньше" },
          ]}
          value={dayMode}
          onChange={(value) =>
            set(
              "day",
              value === "today"
                ? field.today
                : value === "yesterday"
                  ? field.yesterday
                  : (earlier[0] ?? field.yesterday),
            )
          }
        />
        {dayMode === "earlier" ? (
          <label className="flex flex-col gap-1 type-label text-ink-2">
            День
            <select
              className="mono-input focus-ring"
              value={draft.day}
              onChange={(event) => set("day", event.target.value)}
            >
              {earlier.map((day) => (
                <option key={day} value={day}>
                  {fmtDay(day)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {draft.day < field.today ? (
          <span className="self-start">
            <StatusChip tone="caution">внесено позже</StatusChip>
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        {busy.length > 0 && !draft.split ? (
          <p className="mono-inset type-small text-ink-2" data-testid="busy-line">
            {busyLine(busy.map((b) => ({ ...b, objectLabel: codeOf(b.objectId) ?? "" })))}.
            Пересечение не мешает отправке: менеджер увидит пометку.
          </p>
        ) : null}
        {draft.split ? null : (
          <>
            <FormField label="Время работы" hint="8-17, с 8:30 до 16, 830-1700">
              {(props) => (
                <input
                  {...props}
                  inputMode="text"
                  autoComplete="off"
                  value={draft.timeText}
                  onChange={(event) => typed(event.target.value)}
                  className="mono-input focus-ring tnum"
                  placeholder="8-17"
                />
              )}
            </FormField>
            {decoded ? (
              <p
                aria-live="polite"
                data-testid="time-decoded"
                className={cn(
                  "type-label tnum",
                  parsed?.kind === "error" ? "text-down" : "text-ink-2",
                )}
              >
                {decoded}
              </p>
            ) : null}
            <TimeChips
              label="Начало"
              slots={START_CHIPS}
              value={draft.start !== null ? formatClock(draft.start) : null}
              onPick={(value) => {
                const start = toMinutes(value);
                setTime(start, draft.end !== null && draft.end > start ? draft.end : null);
              }}
            />
            <TimeChips
              label="Окончание"
              slots={END_CHIPS}
              value={draft.end !== null ? formatClock(draft.end) : null}
              onPick={(value) => setTime(draft.start, toMinutes(value))}
            />
          </>
        )}
      </div>

      {draft.split ? null : (
        <div className="flex flex-col gap-2">
          <span className="type-label text-ink-2">Перерыв, минут</span>
          <SegmentedPills
            label="Перерыв, минут"
            options={BREAKS}
            value={draft.breakMinutes}
            onChange={(value) => set("breakMinutes", value)}
          />
          {draft.breakMinutes === "other" ? (
            <FormField label="Перерыв, минут числом">
              {(props) => (
                <input
                  {...props}
                  inputMode="numeric"
                  value={draft.otherBreak}
                  onChange={(event) => set("otherBreak", event.target.value.replace(/\D/g, ""))}
                  className="mono-input focus-ring tnum"
                  placeholder="20"
                />
              )}
            </FormField>
          ) : null}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className="type-label text-ink-2">Кто работал</span>
        {draft.split ? (
          <ul className="flex flex-col gap-3" aria-label="Время по сотрудникам">
            {draft.people.map((person, index) => (
              <li key={person.employeeId} className="mono-inset flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="type-label">{nameOf(person.employeeId)}</span>
                  <Button
                    variant="quiet"
                    aria-label={`Убрать: ${nameOf(person.employeeId)}`}
                    disabled={draft.people.length <= 1}
                    onClick={() =>
                      set(
                        "people",
                        draft.people.filter((_, i) => i !== index),
                      )
                    }
                  >
                    Убрать
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(["start", "end", "breakMinutes"] as const).map((key) => (
                    <label key={key} className="flex flex-col gap-1 type-small text-ink-3">
                      {key === "start" ? "Начало" : key === "end" ? "Окончание" : "Перерыв, мин"}
                      <input
                        className="mono-input focus-ring tnum"
                        inputMode={key === "breakMinutes" ? "numeric" : "text"}
                        value={String(person[key])}
                        onChange={(event) =>
                          set(
                            "people",
                            draft.people.map((p, i) =>
                              i === index ? { ...p, [key]: event.target.value } : p,
                            ),
                          )
                        }
                      />
                    </label>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        ) : draft.marked ? (
          <fieldset className="mono-inset flex flex-col gap-1">
            <legend className="sr-only">Кто работал</legend>
            {field.crew.map((m) => {
              const on = draft.marked!.includes(m.employeeId);
              return (
                <label key={m.employeeId} className="flex min-h-12 items-center gap-3 type-text">
                  <input
                    type="checkbox"
                    className="size-5 accent-current"
                    checked={on}
                    onChange={() =>
                      set(
                        "marked",
                        on
                          ? draft.marked!.filter((id) => id !== m.employeeId)
                          : [...draft.marked!, m.employeeId],
                      )
                    }
                  />
                  {m.name}
                </label>
              );
            })}
          </fieldset>
        ) : (
          <NumberStepper
            label="Людей на смене"
            unit="чел."
            value={draft.headcount}
            onChange={(value) => set("headcount", value)}
            min={1}
            max={Math.max(30, field.crew.length)}
          />
        )}
        <span className="type-small text-ink-3">
          {field.crew.length
            ? `В составе бригады на сегодня: ${field.crew.length} чел.`
            : "Состав бригады не задан"}
        </span>
        <div className="flex flex-wrap gap-x-4">
          {!draft.split && field.crew.length > 0 ? (
            <button
              type="button"
              className="mono-row focus-ring self-start rounded-pill px-0 type-label underline underline-offset-4"
              onClick={() =>
                set("marked", draft.marked ? null : field.crew.map((m) => m.employeeId))
              }
            >
              {draft.marked ? "Указать числом" : "Отметить людей"}
            </button>
          ) : null}
          {allowSplit ? (
            <button
              type="button"
              className="mono-row focus-ring self-start rounded-pill px-0 type-label underline underline-offset-4"
              onClick={() => set("split", !draft.split)}
            >
              {draft.split ? "У всех одинаковое время" : "У людей разное время"}
            </button>
          ) : null}
        </div>
      </div>

      <FormField label="Комментарий" hint="Необязательно. Увидит менеджер при проверке">
        {(props) => (
          <textarea
            {...props}
            rows={2}
            value={draft.note}
            onChange={(event) => set("note", event.target.value)}
            className="mono-input focus-ring py-3"
            placeholder="Например, задержка с допуском"
          />
        )}
      </FormField>

      {error ? (
        <p role="alert" className="type-label text-down">
          {error}
        </p>
      ) : null}
      <Button field className="w-full" onClick={onCheck}>
        Проверить
      </Button>
    </div>
  );
}

function breakOf(draft: Draft): string {
  return draft.breakMinutes === "other" ? draft.otherBreak || "0" : draft.breakMinutes;
}

/** Ошибка формы до проверки: объект, время, строки людей — тем же правилом, что считает порт */
function checkDraft(draft: Draft): string | null {
  if (!draft.objectId) return "Выберите объект.";
  if (draft.split) {
    if (draft.people.length === 0) return "Добавьте хотя бы одного сотрудника.";
    for (const person of draft.people) {
      const result = previewMinutes(String(person.start), String(person.end), person.breakMinutes);
      if (!result.ok) return "Проверьте время у сотрудников: окончание должно быть позже начала.";
    }
    return null;
  }
  if (draft.marked && draft.marked.length === 0) return "Отметьте хотя бы одного человека.";
  const parsed = draft.timeText.trim() ? parseTimeInput(draft.timeText) : null;
  if (parsed?.kind === "error" && parsed.reason === "overnight") return TIME_INPUT_TEXT.overnight;
  if (draft.start === null) return "Укажите время работы, например 8-17.";
  if (draft.end === null) return "Укажите окончание, например 8-17.";
  const result = previewMinutes(formatClock(draft.start), formatClock(draft.end), breakOf(draft));
  return result.ok ? null : "Окончание должно быть позже начала, а перерыв короче смены.";
}

function peopleOf(draft: Draft): PersonInput[] | null {
  if (draft.split) return draft.people;
  if (!draft.marked) return null;
  // «Отметить людей»: у всех одно время, строки нужны, чтобы сохранить, кто работал
  return draft.marked.map((employeeId) => ({
    employeeId,
    start: formatClock(draft.start!),
    end: formatClock(draft.end!),
    breakMinutes: breakOf(draft),
  }));
}

function previewOf(draft: Draft, field: ReturnType<typeof useGasField>): string {
  const people = peopleOf(draft);
  if (people) {
    const minutes = people
      .map((p) => previewMinutes(String(p.start), String(p.end), p.breakMinutes))
      .map((r) => (r.ok ? r.minutes : 0));
    const names = draft.marked
      ? ` (${draft.marked.map((id) => field.crew.find((m) => m.employeeId === id)?.name ?? "").join(", ")})`
      : "";
    return (
      crewSummary({
        minutes: Math.max(0, ...minutes),
        headcount: null,
        people: minutes.map((m, i) => ({
          employeeId: people[i]!.employeeId,
          startMinutes: 0,
          endMinutes: m,
          breakMinutes: 0,
          minutes: m,
        })),
      }) + names
    );
  }
  const result = previewMinutes(
    formatClock(draft.start ?? 0),
    formatClock(draft.end ?? 0),
    breakOf(draft),
  );
  return crewSummary({
    minutes: result.ok ? result.minutes : 0,
    headcount: draft.headcount,
    people: null,
  });
}

function inputOf(draft: Draft, field: ReturnType<typeof useGasField>) {
  const people = peopleOf(draft);
  return {
    day: draft.day,
    brigadeId: field.brigade!.id,
    employeeId: null,
    objectId: draft.objectId!,
    start: draft.start !== null ? formatClock(draft.start) : "",
    end: draft.end !== null ? formatClock(draft.end) : "",
    breakMinutes: breakOf(draft),
    submit: true,
    headcount: people ? null : draft.headcount,
    people,
    clientKey: draft.clientKey,
    channel: "web" as const,
    note: draft.note.trim() || null,
  };
}
