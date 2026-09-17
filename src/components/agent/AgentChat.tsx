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

const quickActions: QuickAction[] = [
  {
    intent: "project_summary",
    label: "Сводка по объекту",
    prompt: "Сводка по объекту",
    icon: Building2,
    tone: "bg-orange-dim text-orange",
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
            className="absolute inset-0 overflow-y-auto px-4 pb-[136px] sm:pb-[160px]"
          >
            {phase !== "dialog" ? (
              <>
                {/* Центр приветствия — на 38% высоты экрана; на невысоком экране выше, чтобы карточки не ушли под поле */}
                <div aria-hidden style={{ height: spacer }} />
                <section
                  ref={introRef}
                  aria-label="Начало диалога"
                  className={cn(
                    "mx-auto flex max-w-[614px] flex-col items-center text-center transition-opacity duration-200",
                    phase === "leaving" && "opacity-0",
                  )}
                >
                  <h1
                    ref={titleRef}
                    className={cn(
                      "text-[32px] leading-[1.05] font-semibold tracking-[-0.025em] text-text transition-opacity duration-200 sm:text-[44px]",
                      greeting ? "opacity-100" : "opacity-0",
                    )}
                  >
                    {greeting ?? "Здравствуйте"}
                    {firstName && `, ${firstName}`}
                  </h1>
                  <p className="mt-3 max-w-[460px] text-[14px] leading-[1.5] text-text-3">
                    Спросите о любом объекте, документе или поставке. Ответ будет со ссылкой на
                    источник
                  </p>
                  <div className="mt-12 grid w-full grid-cols-1 justify-center gap-3.5 sm:w-auto lg:grid-cols-[repeat(2,300px)]">
                    {quickActions.map((action) => (
                      <button
                        key={action.intent}
                        type="button"
                        onClick={() => void send(action.prompt, action.intent)}
                        disabled={phase !== "empty"}
                        className="focus-ring flex h-16 w-full items-center gap-3.5 rounded-[var(--r-md)] border border-line bg-surface px-4 text-left text-[15px] font-medium text-text transition-fast is-hover:border-line-2 is-hover:bg-surface-2 is-hover:shadow-[var(--lift-2)] sm:h-[76px] sm:w-[300px]"
                      >
                        <span
                          className={cn(
                            "grid size-10 shrink-0 place-items-center rounded-[var(--r-sm)]",
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
                          : "Пока отвечаю на четыре вопроса: сводка по объекту, статус поставок, поиск в документах и что требует решения. Выберите один из них."
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
                        quickActions.map((action) => (
                          <Button
                            key={action.intent}
                            variant="secondary"
                            size="sm"
                            disabled={busy}
                            onClick={() => void send(action.prompt, action.intent)}
                          >
                            {action.label}
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
        <span className="text-[12px] text-text-3">
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
