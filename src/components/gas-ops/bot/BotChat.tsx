/**
 * Бот бригадира в деморежиме (ADR-061, 9). Диалог — машина состояний domain
 * (`bot-dialog.ts`), та же, что возьмёт серверный обработчик MAX. Здесь только отображение:
 * сообщение бота с inline-кнопками, выбранный ответ пузырём справа и поле сообщения.
 *
 * Путь кнопками от «Внести время» до «Отправить» — шесть касаний, быстрая кнопка
 * «08:00–17:00» сокращает его до пяти. Уже внесённое время — подпись на кнопке, а не запрет:
 * пересечение уйдёт менеджеру признаком. Свободный текст разбирается на любом шаге.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { EntryStatusBadge, SourceMark } from "@/components/gas-ops/marks";
import {
  botReply,
  botStep,
  fmtHours,
  initialBotState,
  intervalLabel,
  recentEntries,
  shortDay,
  summaryOf,
  useGasActions,
  useGasDayObjects,
  useGasEntries,
  useGasField,
  useGasWeek,
  type BotContext,
  type BotEffect,
  type BotEvent,
  type BotKey,
  type BotReply,
  type BotState,
  type TimeEntry,
  type WorkObject,
} from "@/api/gas-ops";
import { newClientKey } from "@/lib/gas-ops/field-queue";
import { useBrigadeInbox } from "@/api/gas-assistant";
import { GAS_SHOW_HINT, recordShow, useShowActive } from "@/lib/gas-ops/show";
import { useForcedState } from "@/lib/screen-state";
import { cn } from "@/lib/utils";
import { BotBubble, ChatHeader, Composer, Key, Keys, MyBubble, SystemNote } from "./parts";
import { ParseStages, VoiceRecorder } from "./VoiceInput";

const DAY_OBJECTS_MAX = 6;

interface Past {
  id: number;
  from: "bot" | "me";
  content: ReactNode;
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
  onSubmitted,
  bottomInset = false,
  header,
}: BotChatProps) {
  const week = useGasWeek();
  const actions = useGasActions();
  const showActive = useShowActive();
  const inbox = useBrigadeInbox(brigadeId);
  const dayObjects = useGasDayObjects(brigadeId, week.today).slice(0, DAY_OBJECTS_MAX);
  const views = useGasEntries({ brigadeId });
  const field = useGasField(brigadeId);
  // Сборка проверки макетов: ?state=error показывает сбой записи голоса (ADR-045, 4.17)
  const forced = useForcedState();

  const ctx = useMemo<BotContext>(
    () => ({
      speakerName,
      brigadeId,
      today: week.today,
      yesterday: week.yesterday,
      dayObjects,
      allowed,
      entries: views.map((v) => v.entry),
      crewSize: field.crew.length || null,
      newKey: () => newClientKey().replace(/^field-/, "bot-"),
    }),
    [
      speakerName,
      brigadeId,
      week.today,
      week.yesterday,
      dayObjects,
      allowed,
      views,
      field.crew.length,
    ],
  );
  // Ответ порта приходит позже: машина получает свежие записи, а не снимок на момент нажатия
  const latest = useRef(ctx);
  latest.current = ctx;

  const [state, setState] = useState<BotState>(() => initialBotState(ctx));
  const [past, setPast] = useState<Past[]>([]);
  const counter = useRef(0);
  const feed = useRef<HTMLDivElement>(null);
  const current = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const reply = botReply(state, ctx);

  // Лента прокручивается к новому сообщению: длинное сообщение видно с начала
  useLayoutEffect(() => {
    const box = feed.current;
    const last = current.current;
    if (!box || !last) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const offset = last.getBoundingClientRect().top - box.getBoundingClientRect().top;
    const top = Math.min(box.scrollTop + offset - 12, box.scrollHeight - box.clientHeight);
    box.scrollTo({ top: Math.max(0, top), behavior: reduce ? "auto" : "smooth" });
  }, [past.length, state.stage]);

  const dispatch = (event: BotEvent, mineNode?: ReactNode) => {
    const before = stateRef.current;
    const step = botStep(before, event, latest.current);
    const asked = botReply(before, latest.current);
    setPast((list) => [
      ...list,
      ...(step.mine !== null
        ? [
            {
              id: ++counter.current,
              from: "bot" as const,
              content: <ReplyBody reply={asked} state={before} ctx={latest.current} />,
            },
            { id: ++counter.current, from: "me" as const, content: mineNode ?? step.mine },
          ]
        : []),
      ...step.notes.map((note) => ({ id: ++counter.current, from: "bot" as const, content: note })),
    ]);
    stateRef.current = step.state;
    setState(step.state);
    if (step.effect) void perform(step.effect);
  };

  const perform = async (effect: BotEffect) => {
    if (effect.kind === "answer") {
      const result = await actions.answerClarify({ id: effect.id, text: effect.text });
      dispatch(
        result.ok ? { type: "sent", number: "" } : { type: "failed", message: result.message },
      );
      return;
    }
    let result;
    if (effect.kind === "update") {
      result = await actions.updateEntry({
        id: effect.id,
        start: effect.start,
        end: effect.end,
        breakMinutes: effect.breakMinutes,
        // Правка не бригадиром идёт в журнал с причиной (правило порта)
        comment: isForeman ? undefined : "Исправлено в боте бригадира до проверки",
      });
      if (result.ok && effect.resubmit) result = await actions.submitEntry(effect.id);
    } else {
      result = await actions.createEntry({
        day: effect.day,
        brigadeId,
        employeeId,
        objectId: effect.objectId,
        start: effect.start,
        end: effect.end,
        breakMinutes: effect.breakMinutes,
        submit: true,
        ...(effect.headcount !== null ? { headcount: effect.headcount } : {}),
        clientKey: effect.clientKey,
        channel: "bot",
      });
    }
    if (!result.ok) {
      dispatch({ type: "failed", message: result.message });
      return;
    }
    const entry = result.value;
    recordShow({ gasEntryId: entry.id, gasEntryNumber: entry.number });
    onSubmitted(entry);
    dispatch({ type: "sent", number: entry.number });
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

  // Показ: в боте подсвечены рекомендуемые значения, окно без пересечений
  const rec = showActive;
  const hint: Record<string, string | number> = {
    object: GAS_SHOW_HINT.objectId,
    start: 12 * 60,
    end: 14 * 60 + 30,
    break: GAS_SHOW_HINT.breakMinutes,
  };
  const recommended = (key: BotKey) => rec && !!key.pick && hint[key.pick.kind] === key.pick.value;

  const keysOf = (): ReactNode => {
    const { stage } = state;
    if (stage.kind === "voice") {
      if (forced === "error")
        return (
          <div role="alert" className="flex flex-col gap-2">
            <p className="text-body text-text">Не удалось записать голос.</p>
            <Keys>
              <Key onClick={() => dispatch({ type: "key", key: "voice" })}>Повторить</Key>
              <Key onClick={() => dispatch({ type: "key", key: "objects" })}>Выбрать кнопками</Key>
            </Keys>
          </div>
        );
      const phrase = demoPhrase();
      return (
        <VoiceRecorder
          onDone={() =>
            dispatch(
              { type: "voice", text: phrase, demo: true },
              <>
                «{phrase}»
                <span className="mt-1 block text-meta opacity-80">
                  Демо: фраза подготовлена заранее
                </span>
              </>,
            )
          }
          onCancel={() => dispatch({ type: "key", key: "objects" })}
        />
      );
    }
    if (stage.kind === "parsing")
      return <ParseStages voice={stage.demo} onFinish={() => dispatch({ type: "parsed" })} />;
    if (reply.groups.length === 0) return null;
    return (
      <div className="flex flex-col gap-2">
        {reply.groups.map((group, index) => (
          <Keys key={index} cols={group.cols ?? 1}>
            {group.keys.map((key) => (
              <Key
                key={key.id}
                sub={key.sub}
                label={key.aria}
                tone={key.tone}
                tour={key.tour}
                align={key.align}
                disabled={key.disabled}
                previous={key.previous}
                recommended={recommended(key)}
                onClick={() => dispatch({ type: "key", key: key.id })}
              >
                {key.label}
              </Key>
            ))}
          </Keys>
        ))}
      </div>
    );
  };

  const focusComposer =
    state.stage.kind === "typed" ||
    state.stage.kind === "search" ||
    state.stage.kind === "found" ||
    state.stage.kind === "answer";
  const composer = reply.composer ? (
    <Composer
      key={`${state.stage.kind}-${reply.composer.label}`}
      autoFocus={focusComposer}
      placeholder={reply.composer.placeholder}
      label={reply.composer.label}
      onSend={(text) => dispatch({ type: "text", text })}
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
        {/* Напоминания порта OutboundMessenger: в демо они живут только в этой ленте */}
        {inbox.map((m) => (
          <BotBubble key={m.key}>
            <span data-testid="bot-reminder">{m.text}</span>
            <span className="mt-1 block text-meta opacity-80">
              Демо: напоминание показано здесь, в MAX не отправлено
            </span>
          </BotBubble>
        ))}
        {past.map((item) =>
          item.from === "bot" ? (
            <BotBubble key={item.id}>{item.content}</BotBubble>
          ) : (
            <MyBubble key={item.id}>{item.content}</MyBubble>
          ),
        )}
        <div ref={current} className="flex flex-col" data-stage={state.stage.kind}>
          <BotBubble key={`${state.stage.kind}-${past.length}`} animate keys={keysOf()}>
            <ReplyBody reply={reply} state={state} ctx={ctx} />
          </BotBubble>
        </div>
      </div>
      {composer}
    </div>
  );
}

/** Текст сообщения бота: тот же уходит в ленту, когда на него ответили */
function ReplyBody({ reply, state, ctx }: { reply: BotReply; state: BotState; ctx: BotContext }) {
  if (reply.card === "summary" && !reply.danger) return <Summary state={state} ctx={ctx} />;
  return (
    <>
      <span className={cn(reply.danger && "text-danger")}>{reply.text}</span>
      {reply.hint ? <span className="text-meta mt-1 block text-text-3">{reply.hint}</span> : null}
      {reply.card === "mine" ? <MineList entries={recentEntries(ctx)} ctx={ctx} /> : null}
    </>
  );
}

function Summary({ state, ctx }: { state: BotState; ctx: BotContext }) {
  const view = summaryOf(state, ctx);
  return (
    <div>
      <p>
        {state.draft.editNumber
          ? `Проверьте исправление ${state.draft.editNumber}.`
          : "Проверьте запись."}
      </p>
      <dl className="text-body mt-2 flex flex-col gap-1.5">
        {view.rows.map(([term, value]) => (
          <div key={term} className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
            <dt className="text-text-3">{term}</dt>
            <dd className="min-w-0 tnum">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-body mt-3 rounded-[14px] bg-surface-2 px-3 py-2">
        Итого{" "}
        <b className="font-semibold tnum" data-testid="bot-total">
          {view.minutes !== null ? `${view.minutes} мин = ${fmtHours(view.minutes / 60)}` : "–"}
        </b>
      </p>
      {view.flags.length > 0 ? (
        <ul
          className="text-meta mt-2 flex flex-col gap-1 text-text-2"
          aria-label="Пометки для менеджера"
        >
          {view.flags.map((f) => (
            <li key={f.flag}>{f.text}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function MineList({ entries, ctx }: { entries: TimeEntry[]; ctx: BotContext }) {
  if (entries.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-col gap-2">
      {entries.map((e) => {
        const timed = e.startMinutes !== null && e.endMinutes !== null;
        return (
          <li key={e.id} className="rounded-[14px] bg-surface-2 px-3 py-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-body-strong font-semibold tnum">{e.number}</span>
              <span className="text-meta text-text-3 tnum">{shortDay(e.day)}</span>
              <SourceMark source={e.source} />
            </div>
            <p className="text-meta mt-1 text-text-2">
              {ctx.allowed.find((o) => o.id === e.objectId)?.label ?? "Объект не найден"}
            </p>
            <p className="text-meta mt-1 tnum">
              {timed
                ? `${intervalLabel(e.startMinutes!, e.endMinutes!)}, ${e.minutes} мин = ${fmtHours(e.minutes / 60)}`
                : `${e.minutes} мин = ${fmtHours(e.minutes / 60)}`}
            </p>
            {!timed ? (
              <p className="text-meta text-text-3">
                Из недельного отчёта: только минуты, без начала и окончания.
              </p>
            ) : null}
            <div className="mt-1.5">
              <EntryStatusBadge status={e.status} />
            </div>
            {e.status === "clarify" && e.comment ? (
              <p className="text-meta mt-1">Вопрос менеджера: {e.comment}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
