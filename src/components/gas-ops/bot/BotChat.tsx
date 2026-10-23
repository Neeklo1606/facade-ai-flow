/**
 * Диалог бота бригадира (ADR-044, F4). Каждый шаг: сообщение бота и inline-кнопки под ним,
 * выбранный ответ остаётся в ленте пузырём справа. Ни выпадающих списков, ни колёс времени.
 *
 * Бюджет касаний при выборе из кнопок: после «Внести время» объект, день, начало, окончание,
 * перерыв и «Отправить» — шесть касаний. Пересечение с записями бригады видно сразу на шаге
 * времени: такие кнопки недоступны и подписаны «занято», ручной ввод получает ответ сразу.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { EntryStatusBadge, SourceMark } from "@/components/gas-ops/marks";
import {
  fmtHours,
  formatClock,
  previewMinutes,
  useGasActions,
  useGasBusy,
  useGasDayObjects,
  useGasEntries,
  useGasWeek,
  clashOf,
  type BusyInterval,
  type EntryView,
  type TimeEntry,
  type WorkObject,
} from "@/api/gas-ops";
import { GAS_SHOW_HINT, gasShowEvent, useGasShow } from "@/lib/gas-ops/show";
import { cn } from "@/lib/utils";
import { BotBubble, ChatHeader, Composer, Key, Keys, MyBubble, SystemNote } from "./parts";
import { ParseStages, VoiceRecorder } from "./VoiceInput";
import { parseTimeMessage, type ParsedTime } from "@/domain/gas-ops/parse-time-message";
import {
  busyAt,
  endSlots,
  intervalLabel,
  maskClockDraft,
  parseTypedClock,
  startSlots,
} from "./time";

const BREAKS = [0, 30, 45, 60, 90] as const;
const DAY_OBJECTS_MAX = 6;
const MINE_MAX = 5;

type Stage =
  | { kind: "hello" }
  | { kind: "object" }
  | { kind: "search"; error?: string }
  | { kind: "found"; query: string; ids: string[] }
  | { kind: "day" }
  | { kind: "duplicate"; entry: TimeEntry; editable: boolean }
  | { kind: "start" }
  | { kind: "start-typed"; error?: string }
  | { kind: "end" }
  | { kind: "end-typed"; error?: string }
  | { kind: "clash"; with: BusyInterval; field: "start" | "end" }
  | { kind: "break" }
  | { kind: "summary" }
  | { kind: "failed"; message: string }
  | { kind: "done"; number: string; edited: boolean }
  | { kind: "mine" }
  /* Голосовой ввод (ADR-049): запись, затем разбор фразы правилом domain */
  | { kind: "voice" }
  | { kind: "parsing"; text: string; voice: boolean };

interface Draft {
  objectId: string | null;
  day: string;
  start: number | null;
  end: number | null;
  breakMinutes: number | null;
  /** Исправление записи до проверки: её id и номер */
  editId: string | null;
  editNumber: string | null;
  editStatus: TimeEntry["status"] | null;
}

interface Past {
  id: number;
  from: "bot" | "me";
  content: ReactNode;
}

const shortDay = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}`;

/** Исправлять в боте можно всё, по чему менеджер ещё не принял решение (как в порте) */
function editableInBot(entry: TimeEntry): boolean {
  return (
    (entry.status === "draft" || entry.status === "pending" || entry.status === "clarify") &&
    entry.startMinutes !== null &&
    entry.endMinutes !== null
  );
}

export interface BotChatProps {
  brigadeId: string;
  speakerName: string;
  employeeId: string | null;
  /** Бот открыт бригадиром, а не менеджером «его глазами» */
  isForeman: boolean;
  /** Объекты, по которым бригаде разрешено вводить время: поиск «Другой адрес» */
  allowed: WorkObject[];
  objects: WorkObject[];
  onSubmitted: (entry: TimeEntry) => void;
  /** Отступ снизу ленты: над полосой показа на телефоне */
  bottomInset?: boolean;
  /** Своя шапка чата: на телефоне она же шапка экрана (ADR-048, 6) */
  header?: ReactNode;
}

export function BotChat({
  brigadeId,
  speakerName,
  employeeId,
  isForeman,
  allowed,
  objects,
  onSubmitted,
  bottomInset = false,
  header,
}: BotChatProps) {
  const week = useGasWeek();
  const actions = useGasActions();
  const show = useGasShow();
  const dayObjects = useGasDayObjects(brigadeId, week.today).slice(0, DAY_OBJECTS_MAX);
  const entries = useGasEntries({ brigadeId });

  const blank = (): Draft => ({
    objectId: null,
    day: week.today,
    start: null,
    end: null,
    breakMinutes: null,
    editId: null,
    editNumber: null,
    editStatus: null,
  });

  const [stage, setStage] = useState<Stage>({ kind: "hello" });
  const [draft, setDraft] = useState<Draft>(blank);
  /** Значения до исправления: на кнопках подпись «было» */
  const [previous, setPrevious] = useState<Draft | null>(null);
  const [past, setPast] = useState<Past[]>([]);
  const [sending, setSending] = useState(false);
  const counter = useRef(0);
  const feed = useRef<HTMLDivElement>(null);
  const current = useRef<HTMLDivElement>(null);

  const busy = useGasBusy(brigadeId, draft.day, draft.editId ?? undefined);
  const objectOf = (id: string | null) => objects.find((o) => o.id === id) ?? null;
  const object = objectOf(draft.objectId);
  const minutes =
    draft.start !== null && draft.end !== null && draft.breakMinutes !== null
      ? previewMinutes(formatClock(draft.start), formatClock(draft.end), draft.breakMinutes)
      : null;

  const recent = useMemo(
    () =>
      [...entries]
        // Последние сверху: номер растёт с каждой новой записью
        .sort((a, b) => b.entry.number.localeCompare(a.entry.number))
        .slice(0, MINE_MAX),
    [entries],
  );

  // Шаг показа «внести время» засчитывается, когда бригадир дошёл до сводки
  useEffect(() => {
    if (stage.kind === "summary") gasShowEvent("gasEntrySummary");
  }, [stage.kind]);

  // Лента прокручивается к новому сообщению: длинное сообщение видно с начала
  useLayoutEffect(() => {
    const box = feed.current;
    const last = current.current;
    if (!box || !last) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const offset = last.getBoundingClientRect().top - box.getBoundingClientRect().top;
    const top = Math.min(box.scrollTop + offset - 12, box.scrollHeight - box.clientHeight);
    box.scrollTo({ top: Math.max(0, top), behavior: reduce ? "auto" : "smooth" });
  }, [past.length, stage]);

  /** Ответ пользователя: вопрос бота и выбранный ответ уходят в ленту */
  const answer = (mine: ReactNode, next: Stage, bot: ReactNode = prompt(stage)) => {
    setPast((list) => [
      ...list,
      { id: ++counter.current, from: "bot", content: bot },
      { id: ++counter.current, from: "me", content: mine },
    ]);
    setStage(next);
  };

  const startEntry = (mine: string) => {
    setDraft(blank());
    setPrevious(null);
    answer(mine, { kind: "object" });
  };

  const pickObject = (item: WorkObject) => {
    setDraft((d) => ({ ...d, objectId: item.id }));
    answer(item.label, { kind: "day" });
  };

  const pickDay = (day: string, mine: string) => {
    const twin = entries.find(
      (v) =>
        v.entry.objectId === draft.objectId &&
        v.entry.day === day &&
        v.entry.status !== "rejected" &&
        v.entry.id !== draft.editId,
    );
    setDraft((d) => ({ ...d, day }));
    answer(
      mine,
      twin
        ? { kind: "duplicate", entry: twin.entry, editable: editableInBot(twin.entry) }
        : { kind: "start" },
    );
  };

  const editEntry = (entry: TimeEntry, mine: string) => {
    const values: Draft = {
      objectId: entry.objectId,
      day: entry.day,
      start: entry.startMinutes,
      end: entry.endMinutes,
      breakMinutes: entry.breakMinutes,
      editId: entry.id,
      editNumber: entry.number,
      editStatus: entry.status,
    };
    setDraft(values);
    setPrevious(values);
    answer(mine, { kind: "start" });
  };

  /** Ответ не принят: сообщение и ответ уходят в ленту, бот переспрашивает */
  const reject = (mine: string, next: Stage) => {
    setPast((list) => [
      ...list,
      { id: ++counter.current, from: "bot", content: prompt(stage) },
      { id: ++counter.current, from: "me", content: mine },
    ]);
    setStage(next);
  };

  const pickStart = (value: number, mine: string) => {
    const clash = busyAt(busy, value);
    setDraft((d) => ({ ...d, start: value, end: null }));
    answer(mine, clash ? { kind: "clash", with: clash, field: "start" } : { kind: "end" });
  };

  const pickEnd = (value: number, mine: string) => {
    const start = draft.start ?? 0;
    if (value <= start) {
      reject(mine, {
        kind: "end-typed",
        error: `Окончание должно быть позже начала ${formatClock(start)}. Напишите время ещё раз.`,
      });
      return;
    }
    const clash = clashOf(busy, start, value);
    setDraft((d) => ({ ...d, end: value }));
    answer(mine, clash ? { kind: "clash", with: clash, field: "end" } : { kind: "break" });
  };

  const typedTime = (text: string, field: "start" | "end") => {
    const value = parseTypedClock(text);
    if (value === null) {
      reject(text, {
        kind: field === "start" ? "start-typed" : "end-typed",
        error: "Не понял время. Напишите так: 8:20, 8.20 или 0820.",
      });
      return;
    }
    if (field === "start") pickStart(value, formatClock(value));
    else pickEnd(value, formatClock(value));
  };

  /*
   * Голосовой ввод (ADR-049). В демо речь не распознаётся: после «Готово» подставляется
   * подготовленная фраза по объекту показа, с пометкой рядом. Набранный текст разбирается
   * тем же правилом. Что не нашлось, спрашивается кнопками следующего шага
   */
  const voiceObject =
    allowed.find((o) => o.id === GAS_SHOW_HINT.objectId) ??
    dayObjects.find((o) => o.id === GAS_SHOW_HINT.objectId) ??
    dayObjects[0] ??
    null;
  const demoPhrase = () => {
    const place = (voiceObject?.settlement ?? "").replace(/^(ст|х|г|п|с|СТ)\.?\s+/, "");
    // Номер дома: число после запятой («…, ул. Демо, 200 - котел»)
    const house = voiceObject?.label.match(/,\s*(\d+)/)?.[1] ?? "";
    return `Сегодня, ${place} ${house}, с двенадцати до половины третьего, без перерыва`;
  };

  const voiceDone = (text: string, demo: boolean) => {
    answer(
      <>
        «{text}»
        {demo ? (
          <span className="mt-1 block text-meta opacity-80">Демо: фраза подготовлена заранее</span>
        ) : null}
      </>,
      { kind: "parsing", text, voice: demo },
    );
  };

  /** Что нашлось, с источником: каждое значение называет кусок фразы (правило 2) */
  const foundLine = (parsed: ParsedTime) => {
    const parts = [
      parsed.quotes.object && `объект «${parsed.quotes.object}»`,
      parsed.quotes.day && `день «${parsed.quotes.day}»`,
      parsed.quotes.start && `начало «${parsed.quotes.start}»`,
      parsed.quotes.end && `окончание «${parsed.quotes.end}»`,
      parsed.quotes.break && `перерыв «${parsed.quotes.break}»`,
    ].filter(Boolean);
    return parts.length
      ? `Нашла: ${parts.join(", ")}.`
      : "Не нашла в фразе ни объекта, ни времени.";
  };

  const applyParsed = (text: string) => {
    const candidates = [...dayObjects, ...allowed.filter((o) => !dayObjects.includes(o))];
    const parsed = parseTimeMessage(
      text,
      candidates.map((o) => ({ id: o.id, label: o.label, ...(o.code ? { code: o.code } : {}) })),
      week.today,
    );
    const next: Draft = {
      ...blank(),
      objectId: parsed.objectId,
      day: parsed.day ?? week.today,
      start: parsed.start,
      end: parsed.end,
      breakMinutes: parsed.breakMin,
    };
    setDraft(next);
    const twin =
      parsed.objectId && parsed.day
        ? entries.find(
            (v) =>
              v.entry.objectId === parsed.objectId &&
              v.entry.day === parsed.day &&
              v.entry.status !== "rejected",
          )
        : null;
    const clash =
      next.start === null
        ? null
        : next.end === null
          ? busyAt(busy, next.start)
          : (busyAt(busy, next.start) ?? clashOf(busy, next.start, next.end));
    const missing: Stage = !parsed.objectId
      ? { kind: "object" }
      : !parsed.day
        ? { kind: "day" }
        : twin
          ? { kind: "duplicate", entry: twin.entry, editable: editableInBot(twin.entry) }
          : next.start === null
            ? { kind: "start" }
            : clash
              ? { kind: "clash", with: clash, field: next.end === null ? "start" : "end" }
              : next.end === null
                ? { kind: "end" }
                : next.breakMinutes === null
                  ? { kind: "break" }
                  : { kind: "summary" };
    // Сообщение бота с найденным и источниками, ответа человека нет: бот сам идёт дальше
    setPast((list) => [
      ...list,
      {
        id: ++counter.current,
        from: "bot",
        content: (
          <>
            {foundLine(parsed)}
            {parsed.reasons.object ? (
              <span className="mt-1 block text-meta text-text-3">
                Объект не выбран: {parsed.reasons.object}.
              </span>
            ) : null}
            {parsed.reasons.end ? (
              <span className="mt-1 block text-meta text-text-3">
                Окончание не принято: {parsed.reasons.end}.
              </span>
            ) : null}
          </>
        ),
      },
    ]);
    setStage(missing);
  };

  const search = (query: string) => {
    const words = query.toLowerCase().replace(/ё/g, "е").split(/\s+/).filter(Boolean);
    const found = allowed
      .filter((o) => {
        const hay = `${o.label} ${o.code ?? ""} ${o.settlement ?? ""}`
          .toLowerCase()
          .replace(/ё/g, "е");
        return words.every((w) => hay.includes(w));
      })
      .slice(0, DAY_OBJECTS_MAX)
      .map((o) => o.id);
    answer(query, { kind: "found", query, ids: found });
  };

  const send = async () => {
    if (!draft.objectId || draft.start === null || draft.end === null) return;
    if (draft.breakMinutes === null || sending) return;
    setSending(true);
    const start = formatClock(draft.start);
    const end = formatClock(draft.end);
    let result;
    if (draft.editId) {
      result = await actions.updateEntry({
        id: draft.editId,
        start,
        end,
        breakMinutes: draft.breakMinutes,
        // Правка не бригадиром идёт в журнал с причиной (правило порта)
        comment: isForeman ? undefined : "Исправлено в боте бригадира до проверки",
      });
      if (result.ok && (draft.editStatus === "draft" || draft.editStatus === "clarify")) {
        result = await actions.submitEntry(draft.editId);
      }
    } else {
      result = await actions.createEntry({
        day: draft.day,
        brigadeId,
        employeeId,
        objectId: draft.objectId,
        start,
        end,
        breakMinutes: draft.breakMinutes,
        submit: true,
      });
    }
    setSending(false);
    if (!result.ok) {
      answer("Отправить", { kind: "failed", message: result.message });
      return;
    }
    const entry = result.value;
    gasShowEvent("gasEntrySubmitted", { gasEntryId: entry.id, gasEntryNumber: entry.number });
    onSubmitted(entry);
    answer("Отправить", { kind: "done", number: entry.number, edited: !!draft.editId });
  };

  /** Текст сообщения бота для шага: тот же текст уходит в ленту, когда на него ответили */
  function prompt(s: Stage): ReactNode {
    switch (s.kind) {
      case "hello":
        return (
          <>
            Добрый день, {speakerName}. Внесите время по объекту.
            <span className="text-meta mt-1 block text-text-3">
              Сумму и виды работ вводить не нужно, только время.
            </span>
          </>
        );
      case "object":
        return dayObjects.length > 0 ? (
          <>
            Выберите объект.
            <span className="text-meta mt-1 block text-text-3">
              Объекты бригады на сегодня, {shortDay(week.today)}.
            </span>
          </>
        ) : (
          "На сегодня объектов не назначено. Нажмите «Другой адрес» и найдите свой."
        );
      case "search":
        return (
          s.error ?? "Напишите улицу, населённый пункт или код объекта. Ищу среди объектов бригады."
        );
      case "found":
        return s.ids.length > 0
          ? `Нашёл ${s.ids.length === 1 ? "один объект" : `объектов: ${s.ids.length}`}. Выберите.`
          : `По запросу «${s.query}» среди объектов бригады ничего нет. Напишите иначе или выберите объект на сегодня.`;
      case "voice":
        return (
          <>
            Говорите: объект, день, начало, окончание и перерыв.
            <span className="text-meta mt-1 block text-text-3">
              Например: «{demoPhrase()}». Развитие: голосовой ввод.
            </span>
          </>
        );
      case "parsing":
        return "Разбираю фразу.";
      case "day":
        return "За какой день?";
      case "duplicate":
        return (
          <>
            По этому объекту за {shortDay(s.entry.day)} уже есть запись {s.entry.number}. Вторую
            запись на тот же адрес и день система не примет.
            {!s.editable ? (
              <span className="text-meta mt-1 block text-text-3">
                Запись уже у менеджера: исправления вносит он.
              </span>
            ) : null}
          </>
        );
      case "start":
        return (
          <>
            Во сколько начали?
            {busy.length > 0 ? (
              <span className="text-meta mt-1 block text-text-3">
                Время с подписью «занято» уже внесено в{" "}
                {busy.map((b) => `${b.number} (${intervalLabel(b.start, b.end)})`).join(", ")}.
              </span>
            ) : null}
          </>
        );
      case "start-typed":
        return s.error ?? "Напишите время начала, например 8:20.";
      case "end":
        return `Во сколько закончили? Начало ${formatClock(draft.start ?? 0)}.`;
      case "end-typed":
        return s.error ?? "Напишите время окончания, например 16:40.";
      case "clash":
        return (
          <span className="text-danger">
            Это время пересекается с записью {s.with.number} (
            {intervalLabel(s.with.start, s.with.end)}). Выберите другое время.
          </span>
        );
      case "break":
        return "Был перерыв?";
      case "summary":
        return <Summary draft={draft} object={object} today={week.today} minutes={minutes} />;
      case "failed":
        return <span className="text-danger">Запись не отправлена. {s.message}</span>;
      case "done":
        return s.edited ? (
          <>
            Запись <b className="font-semibold tnum">{s.number}</b> исправлена и отправлена, ждёт
            проверки.
          </>
        ) : (
          <>
            Запись <b className="font-semibold tnum">{s.number}</b> принята, ждёт проверки.
          </>
        );
      case "mine":
        return <MineList items={recent} />;
    }
  }

  // Показ: на шагах «внести» и «отправить» подсвечены рекомендуемые значения
  const rec = show.active && (show.step?.id === "gas-enter" || show.step?.id === "gas-send");
  const hint = {
    objectId: GAS_SHOW_HINT.objectId,
    start: parseTypedClock(GAS_SHOW_HINT.start),
    end: parseTypedClock(GAS_SHOW_HINT.end),
    breakMinutes: GAS_SHOW_HINT.breakMinutes,
  };
  const keysOf = (s: Stage): ReactNode => {
    switch (s.kind) {
      case "hello":
        return (
          <Keys>
            <Key tone="primary" onClick={() => startEntry("Внести время")}>
              Внести время
            </Key>
            <Key onClick={() => answer("Мои записи", { kind: "mine" })}>Мои записи</Key>
          </Keys>
        );
      case "object":
      case "found": {
        const list =
          s.kind === "object"
            ? dayObjects
            : s.ids.map((id) => objectOf(id)).filter((o): o is WorkObject => !!o);
        return (
          <Keys>
            {list.map((item) => (
              <Key
                key={item.id}
                align="start"
                sub={item.code ?? undefined}
                recommended={rec && item.id === hint.objectId}
                onClick={() => pickObject(item)}
              >
                {item.label}
              </Key>
            ))}
            {s.kind === "object" ? (
              <Key tour="bot-voice" onClick={() => answer("Сказать голосом", { kind: "voice" })}>
                Сказать голосом
              </Key>
            ) : null}
            {s.kind === "object" ? (
              <Key onClick={() => answer("Другой адрес", { kind: "search" })}>Другой адрес</Key>
            ) : (
              <Key onClick={() => answer("Объекты на сегодня", { kind: "object" })}>
                Объекты на сегодня
              </Key>
            )}
          </Keys>
        );
      }
      case "voice":
        return (
          <VoiceRecorder
            onDone={() => voiceDone(demoPhrase(), true)}
            onCancel={() => answer("Отмена", { kind: "object" })}
          />
        );
      case "parsing":
        return <ParseStages voice={s.voice} onFinish={() => applyParsed(s.text)} />;
      case "day":
        return (
          <Keys>
            <Key onClick={() => pickDay(week.today, `Сегодня, ${shortDay(week.today)}`)}>
              Сегодня, {shortDay(week.today)}
            </Key>
            <Key
              sub="требует согласования"
              onClick={() => pickDay(week.yesterday, `Вчера, ${shortDay(week.yesterday)}`)}
            >
              Вчера, {shortDay(week.yesterday)}
            </Key>
          </Keys>
        );
      case "duplicate":
        return (
          <Keys>
            {s.editable ? (
              <Key tone="primary" onClick={() => editEntry(s.entry, `Исправить ${s.entry.number}`)}>
                Исправить {s.entry.number}
              </Key>
            ) : null}
            <Key onClick={() => answer("Другой объект", { kind: "object" })}>Другой объект</Key>
          </Keys>
        );
      case "start":
        return (
          <>
            <Keys cols={3}>
              {startSlots(busy).map((slot) => (
                <Key
                  key={slot.minutes}
                  disabled={!!slot.busy}
                  sub={slot.busy ? "занято" : undefined}
                  label={slot.busy ? `${slot.label}, занято ${slot.busy.number}` : undefined}
                  recommended={rec && slot.minutes === hint.start}
                  previous={previous?.start === slot.minutes}
                  onClick={() => pickStart(slot.minutes, slot.label)}
                >
                  {slot.label}
                </Key>
              ))}
            </Keys>
            <Keys>
              <Key onClick={() => answer("Другое время", { kind: "start-typed" })}>
                Другое время
              </Key>
            </Keys>
          </>
        );
      case "end": {
        const slots = endSlots(busy, draft.start ?? 0);
        return (
          <>
            {slots.length > 0 ? (
              <Keys cols={3}>
                {slots.map((slot) => (
                  <Key
                    key={slot.minutes}
                    disabled={!!slot.busy}
                    sub={slot.busy ? "занято" : undefined}
                    label={slot.busy ? `${slot.label}, занято ${slot.busy.number}` : undefined}
                    recommended={rec && slot.minutes === hint.end}
                    previous={previous?.end === slot.minutes}
                    onClick={() => pickEnd(slot.minutes, slot.label)}
                  >
                    {slot.label}
                  </Key>
                ))}
              </Keys>
            ) : null}
            <Keys>
              <Key onClick={() => answer("Другое время", { kind: "end-typed" })}>Другое время</Key>
            </Keys>
          </>
        );
      }
      case "clash":
        return (
          <Keys>
            <Key
              tone="primary"
              onClick={() => answer("Изменить", { kind: s.field === "start" ? "start" : "end" })}
            >
              Изменить
            </Key>
          </Keys>
        );
      case "break": {
        const span = (draft.end ?? 0) - (draft.start ?? 0);
        return (
          <Keys cols={3}>
            {BREAKS.map((value) => (
              <Key
                key={value}
                disabled={value >= span}
                recommended={rec && value === hint.breakMinutes}
                previous={previous?.breakMinutes === value}
                onClick={() => {
                  setDraft((d) => ({ ...d, breakMinutes: value }));
                  answer(value === 0 ? "Без перерыва" : `${value} мин`, { kind: "summary" });
                }}
              >
                {value} мин
              </Key>
            ))}
          </Keys>
        );
      }
      case "summary":
        return (
          <Keys cols={2}>
            <Key tone="primary" tour="bot-send" disabled={sending} onClick={() => void send()}>
              Отправить
            </Key>
            <Key
              onClick={() => {
                setPrevious(draft);
                answer("Изменить", { kind: "start" });
              }}
            >
              Изменить
            </Key>
          </Keys>
        );
      case "failed":
        return (
          <Keys>
            <Key tone="primary" onClick={() => answer("Изменить", { kind: "start" })}>
              Изменить
            </Key>
            <Key onClick={() => answer("Другой объект", { kind: "object" })}>Другой объект</Key>
          </Keys>
        );
      case "done":
        return (
          <Keys>
            <Key tone="primary" onClick={() => startEntry("Внести ещё адрес")}>
              Внести ещё адрес
            </Key>
            <Key onClick={() => answer("Мои записи", { kind: "mine" })}>Мои записи</Key>
          </Keys>
        );
      case "mine": {
        const editable = recent.filter((v) => editableInBot(v.entry)).slice(0, 3);
        return (
          <Keys>
            {editable.map((v) => (
              <Key
                key={v.entry.id}
                onClick={() => editEntry(v.entry, `Изменить ${v.entry.number}`)}
              >
                Изменить {v.entry.number}
              </Key>
            ))}
            <Key tone="primary" onClick={() => startEntry("Внести время")}>
              Внести время
            </Key>
          </Keys>
        );
      }
      default:
        return null;
    }
  };

  const composer =
    stage.kind === "voice" ? (
      <Composer
        key="voice"
        autoFocus={false}
        placeholder="Или напишите текстом"
        label="Сообщение боту: объект, день и время одной фразой"
        onSend={(text) => voiceDone(text, false)}
      />
    ) : stage.kind === "search" || stage.kind === "found" ? (
      <Composer
        key="search"
        placeholder="Адрес или код объекта"
        label="Сообщение боту: адрес или код объекта"
        onSend={search}
      />
    ) : stage.kind === "start-typed" || stage.kind === "end-typed" ? (
      <Composer
        key={stage.kind}
        placeholder="ЧЧ:ММ, например 8:20"
        label={stage.kind === "start-typed" ? "Время начала" : "Время окончания"}
        mask={maskClockDraft}
        numeric
        onSend={(text) => typedTime(text, stage.kind === "start-typed" ? "start" : "end")}
      />
    ) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {header ?? <ChatHeader />}
      <div
        ref={feed}
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-3 pt-4",
          bottomInset
            ? "pb-28 lg:pb-4"
            : composer
              ? "pb-4"
              : "pb-[calc(16px+env(safe-area-inset-bottom))] lg:pb-4",
        )}
        aria-live="polite"
        aria-relevant="additions"
      >
        {/* Лента начинается сверху, без пустоты над первым сообщением (ADR-048, 6) */}
        <SystemNote>
          Сегодня, {shortDay(week.today)}. Так будет выглядеть бот в MAX, канал не подключён.
        </SystemNote>
        {past.map((item) =>
          item.from === "bot" ? (
            <BotBubble key={item.id}>{item.content}</BotBubble>
          ) : (
            <MyBubble key={item.id}>{item.content}</MyBubble>
          ),
        )}
        <div ref={current} className="flex flex-col" data-stage={stage.kind}>
          <BotBubble key={`${stage.kind}-${past.length}`} animate keys={keysOf(stage)}>
            {prompt(stage)}
          </BotBubble>
        </div>
      </div>
      {composer}
    </div>
  );
}

function Summary({
  draft,
  object,
  today,
  minutes,
}: {
  draft: Draft;
  object: WorkObject | null;
  today: string;
  minutes: ReturnType<typeof previewMinutes> | null;
}) {
  const rows: [string, ReactNode][] = [
    ["Объект", object?.label ?? "–"],
    ["День", `${draft.day === today ? "Сегодня" : "Вчера"}, ${shortDay(draft.day)}`],
    [
      "Время",
      draft.start !== null && draft.end !== null ? intervalLabel(draft.start, draft.end) : "–",
    ],
    ["Перерыв", `${draft.breakMinutes ?? 0} мин`],
  ];
  return (
    <div>
      <p>{draft.editNumber ? `Проверьте исправление ${draft.editNumber}.` : "Проверьте запись."}</p>
      <dl className="text-body mt-2 flex flex-col gap-1.5">
        {rows.map(([term, value]) => (
          <div key={term} className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
            <dt className="text-text-3">{term}</dt>
            <dd className="min-w-0 tnum">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-body mt-3 rounded-[14px] bg-surface-2 px-3 py-2">
        Итого{" "}
        <b className="font-semibold tnum" data-testid="bot-total">
          {minutes?.ok ? `${minutes.minutes} мин = ${fmtHours(minutes.minutes / 60)}` : "–"}
        </b>
      </p>
    </div>
  );
}

function MineList({ items }: { items: EntryView[] }) {
  if (items.length === 0) {
    return (
      <>
        Записей пока нет.
        <span className="text-meta mt-1 block text-text-3">
          Нажмите «Внести время»: запись появится здесь со статусом.
        </span>
      </>
    );
  }
  return (
    <div>
      <p>Последние записи бригады:</p>
      <ul className="mt-2 flex flex-col gap-2">
        {items.map((view) => {
          const e = view.entry;
          const timed = e.startMinutes !== null && e.endMinutes !== null;
          return (
            <li key={e.id} className="rounded-[14px] bg-surface-2 px-3 py-2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-body-strong font-semibold tnum">{e.number}</span>
                <span className="text-meta text-text-3 tnum">{shortDay(e.day)}</span>
                <SourceMark source={e.source} />
              </div>
              <p className="text-meta mt-1 text-text-2">
                {view.object?.label ?? "Объект не найден"}
              </p>
              <p className="text-meta mt-1 tnum">
                {timed
                  ? `${intervalLabel(e.startMinutes!, e.endMinutes!)}, ${e.minutes} мин = ${fmtHours(view.hours)}`
                  : `${e.minutes} мин = ${fmtHours(view.hours)}`}
              </p>
              {!timed ? (
                <p className="text-meta text-text-3">
                  Из недельного отчёта: только минуты, без начала и окончания.
                </p>
              ) : null}
              <div className="mt-1.5">
                <EntryStatusBadge status={e.status} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
