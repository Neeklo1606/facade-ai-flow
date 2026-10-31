/**
 * «Сегодня» бригадира (ADR-056, 6): отдельный интерфейс телефона. Что уже сдано, что нужно
 * уточнить, большая кнопка «Добавить время», форма с проверкой перед отправкой, «Мои записи».
 *
 * Данные — выборка `useGasField`: та же, что отдаёт порт, без сумм и чужих бригад. Сумм
 * на этом экране нет нигде. Отправка с ключом: без сети запись «Сохранено на телефоне»,
 * после ответа «Принято сервером»; повтор с тем же ключом дубля не создаёт.
 */
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Bot, Clock3, MessageCircleQuestion, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  crewSummary,
  formatClock,
  previewMinutes,
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
  newClientKey,
  queueAdd,
  queueRemove,
  readQueue,
  writeQueue,
  type QueuedEntry,
} from "@/lib/gas-ops/field-queue";
import { useOffline } from "@/lib/ui/offline";
import { cn } from "@/lib/utils";

/** Бригада, за которую смотрят менеджер и администратор */
const VIEW_BRIGADE = "brg-1";

const START_SLOTS = ["07:00", "07:30", "08:00", "08:30", "09:00", "09:30"];
const END_SLOTS = ["15:00", "15:30", "16:00", "16:30", "17:00", "17:30"];
const BREAKS = [
  { value: "0", label: "0" },
  { value: "30", label: "30" },
  { value: "45", label: "45" },
  { value: "60", label: "60" },
  { value: "90", label: "90" },
] as const;

const STATUS_TONE: Record<FieldEntry["status"], StatusTone> = {
  draft: "neutral",
  pending: "caution",
  confirmed: "up",
  rejected: "down",
  clarify: "note",
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

interface Draft {
  objectId: string | null;
  day: "today" | "yesterday";
  headcount: number;
  split: boolean;
  people: PersonInput[];
  start: string | null;
  end: string | null;
  breakMinutes: (typeof BREAKS)[number]["value"];
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

  const startDraft = () => {
    setDraft({
      objectId: field.todayObjects[0]?.id ?? null,
      day: "today",
      headcount: Math.max(1, crewSize),
      split: false,
      people: field.crew.map((m) => ({
        employeeId: m.employeeId,
        start: "08:00",
        end: "17:00",
        breakMinutes: "60",
      })),
      start: null,
      end: null,
      breakMinutes: "60",
      note: "",
      clientKey: newClientKey(),
    });
    setError(null);
    setStep("form");
  };

  /** Отправить из очереди: ключ тот же, поэтому повтор после обрыва связи дубля не даёт */
  const flush = useCallback(
    async (item: QueuedEntry) => {
      const result = await actions.createEntry(item.input);
      if (!result.ok) return result;
      const next = queueRemove(readQueue(storage()), item.clientKey);
      writeQueue(storage(), next);
      setQueue(next);
      return result;
    },
    [actions],
  );

  // Сеть вернулась: очередь уходит на сервер
  useEffect(() => {
    if (network.offline || queue.length === 0) return;
    void (async () => {
      for (const item of queue) {
        const result = await flush(item);
        if (result.ok && sent?.key === item.clientKey)
          setSent({ key: item.clientKey, state: "server", number: result.value.number });
      }
    })();
  }, [network.offline, queue, flush, sent?.key]);

  if (!field.brigade) {
    return (
      <EmptyState
        title="Бригада не выбрана"
        text="Интерфейс бригадира открывается для своей бригады. Войдите ролью «Бригадир»."
      />
    );
  }

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
    const preview = previewOf(draft);
    const object = field.allowedObjects.find((o) => o.id === draft.objectId);
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
                <span className="flex flex-wrap items-center gap-2">
                  {fmtDay(input.day)}
                  {draft.day === "yesterday" ? (
                    <StatusChip tone="caution">Требует согласования</StatusChip>
                  ) : null}
                </span>
              }
            />
            <Fact
              term="Время"
              value={
                draft.split
                  ? "У сотрудников разное время"
                  : `${draft.start} – ${draft.end}, перерыв ${draft.breakMinutes} мин`
              }
            />
            <Fact term="Состав" value={preview} />
            {draft.note.trim() ? <Fact term="Комментарий" value={draft.note.trim()} /> : null}
          </dl>
        </Card>
        {error ? (
          <p role="alert" className="type-label text-down">
            {error}
          </p>
        ) : null}
        <div className="flex flex-col gap-3">
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
              const result = await flush(item);
              if (!result.ok) {
                // Правило не пропустило: запись остаётся в форме, очередь её не держит
                const rest = queueRemove(readQueue(storage()), item.clientKey);
                writeQueue(storage(), rest);
                setQueue(rest);
                setSent(null);
                setError(result.message);
                return;
              }
              setSent({ key: item.clientKey, state: "server", number: result.value.number });
              setStep("sent");
            }}
          >
            Отправить
          </Button>
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
            ? "Менеджер проверит её. Если появится вопрос, он придёт в «Мои записи»."
            : "Сети нет. Запись отправится сама, когда телефон поймает связь. Повторно вносить не нужно."}
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
        <div className="grid grid-cols-2 gap-3">
          <Card as="div" className="flex flex-col gap-1">
            <span className="type-label text-ink-2">Сдано сегодня</span>
            <span className="type-kpi">{today.length}</span>
            <span className="type-small text-ink-3">
              {today.length
                ? minutesText(today.reduce((a, e) => a + e.minutes, 0))
                : "записей пока нет"}
            </span>
          </Card>
          <Card
            as="div"
            className={cn("flex flex-col gap-1", clarify.length > 0 && "mono-card-inverse")}
          >
            <span className="type-label">Нужно уточнить</span>
            <span className="type-kpi">{clarify.length}</span>
            <span className="type-small">
              {clarify.length ? "ответьте менеджеру" : "вопросов нет"}
            </span>
          </Card>
        </div>
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
            {field.entries.slice(0, 12).map((entry) => (
              <MyEntry key={entry.id} entry={entry} onAnswer={actions.answerClarify} />
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
  onAnswer,
}: {
  entry: FieldEntry;
  onAnswer: (input: { id: string; text: string }) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const frame =
    entry.startMinutes !== null && entry.endMinutes !== null
      ? `${formatClock(entry.startMinutes)} – ${formatClock(entry.endMinutes)}`
      : minutesText(entry.minutes);
  return (
    <li className="flex flex-col gap-2 px-4 py-3 lg:px-5">
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
  const [otherStart, setOtherStart] = useState(false);
  const [otherEnd, setOtherEnd] = useState(false);
  const day = draft.day === "today" ? field.today : field.yesterday;
  const busy = useGasBusy(field.brigade?.id ?? null, day);
  const taken = (slots: string[]) =>
    slots.filter((slot) => {
      const minutes = Number(slot.slice(0, 2)) * 60 + Number(slot.slice(3, 5));
      return busy.some((b) => b.start <= minutes && minutes < b.end);
    });
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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <Button variant="quiet" aria-label="Назад к «Сегодня»" onClick={onBack}>
          <ArrowLeft aria-hidden />
        </Button>
        <h2 className="type-screen">Время за день</h2>
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
          ]}
          value={draft.day}
          onChange={(value) => set("day", value)}
        />
        {draft.day === "yesterday" ? (
          <span className="self-start">
            <StatusChip tone="caution">Вчерашняя запись требует согласования</StatusChip>
          </span>
        ) : null}
      </div>

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
        ) : (
          <NumberStepper
            label="Людей на смене"
            unit="чел."
            value={draft.headcount}
            onChange={(value) => set("headcount", value)}
            min={1}
            max={Math.max(30, crewSizeOf(field))}
          />
        )}
        <span className="type-small text-ink-3">
          {crewSizeOf(field)
            ? `В составе бригады на сегодня: ${crewSizeOf(field)} чел.`
            : "Состав бригады не задан"}
        </span>
        <button
          type="button"
          className="mono-row focus-ring self-start rounded-pill px-0 type-label underline underline-offset-4"
          onClick={() => set("split", !draft.split)}
        >
          {draft.split ? "У всех одинаковое время" : "У сотрудников разное время"}
        </button>
      </div>

      {draft.split ? null : (
        <>
          <div className="flex flex-col gap-2">
            <span className="type-label text-ink-2">Начало</span>
            <TimeChips
              label="Начало"
              slots={START_SLOTS}
              busy={taken(START_SLOTS)}
              value={draft.start}
              onPick={(value) => set("start", value)}
              {...(otherStart ? {} : { other: () => setOtherStart(true) })}
            />
            {otherStart ? (
              <OtherTime
                label="Другое начало"
                value={draft.start}
                onChange={(v) => set("start", v)}
              />
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <span className="type-label text-ink-2">Окончание</span>
            <TimeChips
              label="Окончание"
              slots={END_SLOTS}
              busy={taken(END_SLOTS)}
              value={draft.end}
              onPick={(value) => set("end", value)}
              {...(otherEnd ? {} : { other: () => setOtherEnd(true) })}
            />
            {otherEnd ? (
              <OtherTime
                label="Другое окончание"
                value={draft.end}
                onChange={(v) => set("end", v)}
              />
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <span className="type-label text-ink-2">Перерыв, минут</span>
            <SegmentedPills
              label="Перерыв, минут"
              options={BREAKS}
              value={draft.breakMinutes}
              onChange={(value) => set("breakMinutes", value)}
            />
          </div>
        </>
      )}

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

function crewSizeOf(field: ReturnType<typeof useGasField>): number {
  return field.crew.length;
}

function OtherTime({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <FormField label={label} hint="Часы и минуты, например 7:45">
      {(props) => (
        <input
          {...props}
          inputMode="numeric"
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
          className="mono-input focus-ring tnum"
          placeholder="7:45"
        />
      )}
    </FormField>
  );
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
  if (!draft.start) return "Выберите начало.";
  if (!draft.end) return "Выберите окончание.";
  const result = previewMinutes(draft.start, draft.end, draft.breakMinutes);
  return result.ok ? null : "Окончание должно быть позже начала, а перерыв короче смены.";
}

function previewOf(draft: Draft): string {
  if (draft.split) {
    const people = draft.people
      .map((p) => previewMinutes(String(p.start), String(p.end), p.breakMinutes))
      .map((r) => (r.ok ? r.minutes : 0));
    return crewSummary({
      minutes: Math.max(0, ...people),
      headcount: null,
      people: people.map((minutes, i) => ({
        employeeId: draft.people[i]!.employeeId,
        startMinutes: 0,
        endMinutes: minutes,
        breakMinutes: 0,
        minutes,
      })),
    });
  }
  const result = previewMinutes(draft.start ?? "", draft.end ?? "", draft.breakMinutes);
  return crewSummary({
    minutes: result.ok ? result.minutes : 0,
    headcount: draft.headcount,
    people: null,
  });
}

function inputOf(draft: Draft, field: ReturnType<typeof useGasField>) {
  return {
    day: draft.day === "today" ? field.today : field.yesterday,
    brigadeId: field.brigade!.id,
    employeeId: null,
    objectId: draft.objectId!,
    start: draft.start ?? "",
    end: draft.end ?? "",
    breakMinutes: draft.breakMinutes,
    submit: true,
    headcount: draft.split ? null : draft.headcount,
    people: draft.split ? draft.people : null,
    clientKey: draft.clientKey,
    note: draft.note.trim() || null,
  };
}
