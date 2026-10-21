import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, FileSearch, Scale, Truck, type LucideIcon } from "lucide-react";
import { DetailsLayout, SourceCardBody, StatusBadge, sourceKindLabel } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useAskAgent } from "@/api/mutations";
import { queries } from "@/api/queries";
import type { AgentIntent, AgentReply, AgentSource } from "@/api/types";
import { ALL_PROJECTS, useApp } from "@/lib/app-context";
import { fmtDateTime } from "@/lib/format";
import { useCurrentUser } from "@/lib/project-scope";
import { cn } from "@/lib/utils";
import { AgentComposer } from "./AgentComposer";
import { AgentAnswer, AgentNotice, TypingIndicator, UserMessage } from "./AgentMessages";
import { clockTime } from "./time";

interface QuickAction {
  intent: AgentIntent;
  label: string;
  prompt: string;
  icon: LucideIcon;
  tone: string;
}

/**
 * Примеры вопросов для ответа вне сценариев (TASK-A2, п. 6): целые формулировки, а не ярлыки,
 * чтобы было видно, как спрашивать. Три — чтобы список читался с одного взгляда.
 */
const examplePrompts: { intent: AgentIntent; prompt: string }[] = [
  { intent: "project_summary", prompt: "Что со «Северной Короной» сегодня?" },
  { intent: "deliveries", prompt: "Какие поставки в пути и когда придут?" },
  { intent: "documents_search", prompt: "Найди в документах кронштейны" },
];

const quickActions: QuickAction[] = [
  {
    intent: "project_summary",
    label: "Сводка по объекту",
    prompt: "Сводка по объекту",
    icon: Building2,
    tone: "bg-sand-dim text-sand",
  },
  {
    intent: "deliveries",
    label: "Статус поставок",
    prompt: "Статус поставок",
    icon: Truck,
    tone: "bg-info-bg text-info",
  },
  {
    intent: "documents_search",
    label: "Найти в документах",
    prompt: "Найди в документах кронштейны",
    icon: FileSearch,
    tone: "bg-ok-bg text-ok",
  },
  {
    intent: "decisions",
    label: "Что требует решения",
    prompt: "Что требует решения",
    icon: Scale,
    tone: "bg-sand-dim text-sand",
  },
];

type Message =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "agent"; reply: AgentReply; time: string }
  | {
      id: number;
      role: "notice";
      kind: "unknown" | "failed";
      prompt: string;
      intent?: AgentIntent;
    };

/** Сообщение без id: Omit по каждому варианту объединения отдельно */
type NewMessage = Message extends infer M ? (M extends Message ? Omit<M, "id"> : never) : never;

/** Утро до 12, день до 18, вечер после — по часам устройства */
function greetingFor(hour: number) {
  if (hour < 12) return "Доброе утро";
  if (hour < 18) return "Добрый день";
  return "Добрый вечер";
}

/** Набор ответа не мигает: индикатор виден хотя бы это время */
const MIN_TYPING_MS = 600;
const FADE_MS = 200;

export function AgentChat() {
  const { projectId } = useApp();
  const user = useCurrentUser();
  const ask = useAskAgent();

  // Время суток считается после монтирования: на сервере часов пользователя нет
  const [greeting, setGreeting] = useState<string | null>(null);
  useEffect(() => setGreeting(greetingFor(new Date().getHours())), []);

  const [phase, setPhase] = useState<"empty" | "leaving" | "dialog">("empty");
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [openSource, setOpenSource] = useState<AgentSource | null>(null);
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const introRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const spacer = useIntroSpacer(scrollRef, introRef, titleRef, phase !== "dialog");

  const push = (message: NewMessage) =>
    setMessages((list) => [...list, { ...message, id: nextId.current++ } as Message]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, busy]);

  const send = async (prompt: string, intent?: AgentIntent) => {
    if (busy) return;
    if (phase === "empty") {
      setPhase("leaving");
      window.setTimeout(() => setPhase("dialog"), FADE_MS);
    }
    push({ role: "user", text: prompt });
    setBusy(true);
    const started = Date.now();
    try {
      const reply = await ask.mutateAsync({
        prompt,
        projectId: projectId === ALL_PROJECTS ? null : projectId,
        ...(intent ? { intent } : {}),
      });
      await new Promise((resolve) =>
        window.setTimeout(resolve, Math.max(0, MIN_TYPING_MS - (Date.now() - started))),
      );
      if (reply && reply.sources.length) {
        push({ role: "agent", reply, time: clockTime(new Date()) });
      } else {
        push({ role: "notice", kind: "unknown", prompt, ...(intent ? { intent } : {}) });
      }
    } catch {
      push({ role: "notice", kind: "failed", prompt, ...(intent ? { intent } : {}) });
    } finally {
      setBusy(false);
    }
  };

  const closeSource = useCallback(() => setOpenSource(null), []);
  const firstName = user?.name ?? null;

  return (
    <div className="main-bleed">
      <DetailsLayout
        open={openSource !== null}
        onClose={closeSource}
        title={openSource?.title ?? ""}
        subtitle={
          openSource ? `${sourceKindLabel[openSource.kind]} · ${openSource.location}` : undefined
        }
        panel={openSource ? <SourceOriginal sourceId={openSource.sourceId} /> : null}
        className="h-full"
      >
        <div className="relative h-full overflow-hidden">
          <div
            ref={scrollRef}
            // Лента уходит под поле: край ленты гасится маской, а не градиентной подложкой
            className="absolute inset-0 overflow-y-auto px-4 pb-[136px] [mask-image:linear-gradient(to_bottom,black_calc(100%-150px),transparent_calc(100%-40px))] sm:pb-[160px] sm:[mask-image:linear-gradient(to_bottom,black_calc(100%-180px),transparent_calc(100%-56px))]"
          >
            {phase !== "dialog" ? (
              <>
                {/* Центр приветствия — на 38% высоты экрана; на невысоком экране выше, чтобы карточки не ушли под поле */}
                <div aria-hidden style={{ height: spacer }} />
                <section
                  ref={introRef}
                  aria-label="Начало диалога"
                  className={cn(
                    "mx-auto flex max-w-[760px] flex-col items-center text-center transition-opacity duration-200",
                    phase === "leaving" && "opacity-0",
                  )}
                >
                  <h1
                    ref={titleRef}
                    className={cn(
                      "text-display text-balance transition-opacity duration-200",
                      greeting ? "opacity-100" : "opacity-0",
                    )}
                  >
                    {greeting ?? "Здравствуйте"}
                    {firstName ? "," : null}
                    {firstName ? <span className="tone-2 block">{firstName}</span> : null}
                  </h1>
                  <p className="mt-4 max-w-[460px] text-[15px] leading-[1.5] text-text-2">
                    Спросите о любом объекте, документе или поставке. Ответ будет со ссылкой на
                    источник
                  </p>
                  <div className="mt-8 grid w-full grid-cols-2 gap-3 sm:mt-10 lg:grid-cols-4">
                    {quickActions.map((action) => (
                      <button
                        key={action.intent}
                        type="button"
                        onClick={() => void send(action.prompt, action.intent)}
                        disabled={phase !== "empty"}
                        className="card-v3 focus-ring press flex min-h-[112px] w-full flex-col items-start justify-between gap-4 p-4 text-left text-[15px] leading-[1.3] font-medium text-text transition-fast is-hover:bg-surface-2 is-hover:shadow-[var(--lift-2)] sm:min-h-[128px]"
                      >
                        <span
                          className={cn(
                            "grid size-10 shrink-0 place-items-center rounded-full",
                            action.tone,
                          )}
                        >
                          <action.icon className="size-[18px]" strokeWidth={1.5} aria-hidden />
                        </span>
                        {action.label}
                      </button>
                    ))}
                  </div>
                </section>
              </>
            ) : (
              <div
                role="log"
                aria-live="polite"
                aria-label="Диалог с системой"
                className="mx-auto w-full max-w-[680px] space-y-7 pt-6 animate-in fade-in-0 duration-200"
              >
                {messages.map((message) =>
                  message.role === "user" ? (
                    <UserMessage key={message.id} text={message.text} />
                  ) : message.role === "agent" ? (
                    <AgentAnswer
                      key={message.id}
                      reply={message.reply}
                      time={message.time}
                      onOpenSource={setOpenSource}
                    />
                  ) : (
                    <AgentNotice
                      key={message.id}
                      text={
                        message.kind === "failed"
                          ? "Не получилось получить ответ: связь с сервером прервалась. Вопрос не потерялся — повторите."
                          : "Отвечаю по данным системы: сводка по объекту, статус поставок и заявок, поиск значения в документах и что требует решения. На вопросы вне этих данных не отвечаю — придумывать не буду. Спросите, например, так:"
                      }
                    >
                      {message.kind === "failed" ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                          onClick={() => void send(message.prompt, message.intent)}
                        >
                          Повторить
                        </Button>
                      ) : (
                        examplePrompts.map((example) => (
                          <Button
                            key={example.prompt}
                            variant="secondary"
                            size="sm"
                            disabled={busy}
                            onClick={() => void send(example.prompt, example.intent)}
                          >
                            {example.prompt}
                          </Button>
                        ))
                      )}
                    </AgentNotice>
                  ),
                )}
                {busy && <TypingIndicator />}
                <div ref={endRef} />
              </div>
            )}
          </div>
          <AgentComposer
            dimmed={phase !== "empty"}
            busy={busy}
            onSend={(prompt) => void send(prompt)}
            examples={examplePrompts}
            onExample={(prompt, intent) => void send(prompt, intent)}
          />
        </div>
      </DetailsLayout>
    </div>
  );
}

/** Оригинал источника в панели деталей */
function SourceOriginal({ sourceId }: { sourceId: string }) {
  const { data: card, isPending, isError, refetch } = useQuery(queries.source(sourceId));
  if (isPending) {
    return (
      <div className="space-y-3" aria-busy="true">
        <span className="skeleton block h-4 w-1/2" />
        <span className="skeleton block h-24 w-full rounded-[var(--r-md)]" />
        <span className="skeleton block h-4 w-2/3" />
      </div>
    );
  }
  if (isError || !card) {
    return (
      <AgentNotice text="Оригинал не открылся. Возможно, источник удалён или нет связи.">
        <Button variant="secondary" size="sm" onClick={() => void refetch()}>
          Повторить
        </Button>
      </AgentNotice>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone="info">{sourceKindLabel[card.source.kind]}</StatusBadge>
        <span className="text-[13px] text-text-3">
          {card.source.author} · {fmtDateTime(card.source.receivedAt)}
        </span>
      </div>
      <SourceCardBody card={card} />
    </div>
  );
}

/**
 * Высота отступа над приветствием: центр заголовка на 38% высоты экрана. Если так карточки
 * уходят под поле ввода, приветствие поднимается ровно настолько, чтобы всё поместилось.
 */
function useIntroSpacer(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  introRef: React.RefObject<HTMLElement | null>,
  titleRef: React.RefObject<HTMLHeadingElement | null>,
  active: boolean,
) {
  const [height, setHeight] = useState(24);
  useLayoutEffect(() => {
    const area = scrollRef.current;
    const intro = introRef.current;
    const title = titleRef.current;
    if (!active || !area || !intro || !title) return;
    const measure = () => {
      const stage = area.clientHeight;
      const reserved = parseFloat(getComputedStyle(area).paddingBottom) || 0;
      const centered = stage * 0.38 - title.offsetHeight / 2;
      const fits = stage - reserved - intro.offsetHeight - 16;
      setHeight(Math.max(24, Math.min(centered, fits)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    observer.observe(intro);
    return () => observer.disconnect();
  }, [scrollRef, introRef, titleRef, active]);
  return height;
}
