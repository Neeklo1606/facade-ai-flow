/**
 * Помощник (ADR-061, 13; раздел 4.8, образец ПТО Онлайн): кнопка 52 px внизу справа и панель
 * 420 px. Ответы считает правило-движок по данным недели, со ссылками на записи. Черновик
 * действия выполняется только кнопкой человека. Без ключа модели свободный вопрос получает
 * список того, на что помощник отвечает. История чатов — в этом браузере (демо).
 */
import { useNavigate } from "@tanstack/react-router";
import { History, MessageSquarePlus, Send, Sparkles, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { assistantModel, useGasAssistant, type AssistantAnswer } from "@/api/gas-assistant";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";

const HISTORY_KEY = "gaika-assistant-chats";
const HISTORY_MAX = 20;

interface Message {
  id: string;
  question: string;
  answer: AssistantAnswer;
  /** Черновик выполнен человеком: кнопка больше не нажимается */
  draftDone?: boolean;
}

interface Chat {
  id: string;
  title: string;
  messages: Message[];
}

function readChats(): Chat[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]") as Chat[];
  } catch {
    return [];
  }
}

function writeChats(chats: Chat[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(chats.slice(0, HISTORY_MAX)));
  } catch {
    // Без хранилища история живёт до закрытия панели
  }
}

const newId = () => `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export function AssistantButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="Помощник"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        data-testid="assistant-open"
        className="fixed right-4 z-40 grid size-[52px] place-items-center rounded-full bg-orange-strong text-on-orange shadow-floating focus-ring press-98 max-lg:bottom-[calc(var(--bottom-inset,0px)+16px)] lg:bottom-6 lg:right-6"
      >
        <Sparkles className="size-6" aria-hidden />
      </button>
      {open ? <AssistantPanel onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function AssistantPanel({ onClose }: { onClose: () => void }) {
  const assistant = useGasAssistant();
  const [chats, setChats] = useState<Chat[]>(() => readChats());
  const [chatId, setChatId] = useState<string | null>(() => readChats()[0]?.id ?? null);
  const [history, setHistory] = useState(false);
  const [text, setText] = useState("");
  const [mounted, setMounted] = useState(false);
  const feed = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => setMounted(true), []);
  const chat = chats.find((c) => c.id === chatId) ?? null;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    feed.current?.scrollTo({ top: feed.current.scrollHeight });
  }, [chat?.messages.length]);

  const save = (next: Chat[]) => {
    setChats(next);
    writeChats(next);
  };

  const ask = (question: string) => {
    const q = question.trim();
    if (!q) return;
    const message: Message = { id: newId(), question: q, answer: assistant.ask(q) };
    if (chat) {
      save(chats.map((c) => (c.id === chat.id ? { ...c, messages: [...c.messages, message] } : c)));
    } else {
      const created: Chat = { id: newId(), title: q.slice(0, 60), messages: [message] };
      save([created, ...chats]);
      setChatId(created.id);
    }
    setText("");
  };

  const runDraft = async (message: Message) => {
    if (!message.answer.draft || message.draftDone) return;
    const result = await assistant.runDraft(message.answer.draft);
    if (result.done)
      toast.success(`Вернули на уточнение: ${result.done}`, {
        description: "Вопрос ушёл бригадиру",
      });
    if (result.failed.length) toast.error(result.failed[0]!);
    save(
      chats.map((c) =>
        c.id === chatId
          ? {
              ...c,
              messages: c.messages.map((m) =>
                m.id === message.id ? { ...m, draftDone: true } : m,
              ),
            }
          : c,
      ),
    );
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    ask(text);
  };

  if (!mounted) return null;
  return createPortal(
    <section
      role="dialog"
      aria-modal="false"
      aria-label="Помощник"
      className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-card bg-surface shadow-floating ring-1 ring-line lg:inset-x-auto lg:top-20 lg:right-6 lg:bottom-6 lg:max-h-none lg:w-[420px] lg:rounded-card"
    >
      <header className="flex items-center gap-1 border-b border-line px-4 py-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-heading">Помощник</h2>
          <p className="text-meta text-text-3">
            {assistantModel.available
              ? "Отвечает по данным недели"
              : "По данным недели. Модель не подключена"}
          </p>
        </div>
        <Button
          variant="quiet"
          aria-label="История чатов"
          aria-pressed={history}
          onClick={() => setHistory(!history)}
        >
          <History aria-hidden />
        </Button>
        <Button
          variant="quiet"
          aria-label="Новый чат"
          onClick={() => {
            setChatId(null);
            setHistory(false);
          }}
        >
          <MessageSquarePlus aria-hidden />
        </Button>
        <Button variant="quiet" aria-label="Закрыть помощника" onClick={onClose}>
          <X aria-hidden />
        </Button>
      </header>

      {history ? (
        <nav aria-label="История чатов" className="flex-1 overflow-y-auto p-2">
          {chats.length === 0 ? (
            <p className="px-3 py-2 text-body text-text-3">Чатов пока нет.</p>
          ) : (
            <ul className="flex flex-col">
              {chats.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    aria-current={c.id === chatId ? "true" : undefined}
                    onClick={() => {
                      setChatId(c.id);
                      setHistory(false);
                    }}
                    className="flex min-h-11 w-full items-center rounded-control px-3 text-left text-body focus-ring is-hover:bg-surface-2 aria-[current=true]:bg-surface-2"
                  >
                    <span className="min-w-0 truncate">{c.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </nav>
      ) : (
        <div
          ref={feed}
          className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
          aria-live="polite"
        >
          {chat?.messages.map((message) => (
            <article
              key={message.id}
              className="flex flex-col gap-2"
              data-testid="assistant-answer"
            >
              <p className="self-end rounded-card bg-surface-2 px-3 py-2 text-body">
                {message.question}
              </p>
              <Answer
                answer={message.answer}
                done={!!message.draftDone}
                onAsk={ask}
                onDraft={() => void runDraft(message)}
                onNavigate={onClose}
              />
            </article>
          ))}
          {!chat ? (
            <div className="flex flex-col gap-2">
              <p className="text-meta text-text-3">Спросите о неделе:</p>
              <ul className="flex flex-col gap-2" aria-label="Подсказанные вопросы">
                {assistant.suggestions.map((q) => (
                  <li key={q}>
                    <button
                      type="button"
                      onClick={() => ask(q)}
                      className="min-h-11 w-full rounded-control border border-line-2 px-3 py-2 text-left text-body focus-ring is-hover:bg-surface-2"
                    >
                      {q}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}

      <form onSubmit={submit} className="flex items-center gap-2 border-t border-line p-3">
        <label className="sr-only" htmlFor="assistant-input">
          Вопрос помощнику
        </label>
        <input
          id="assistant-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Вопрос о неделе"
          autoComplete="off"
          className="h-btn min-w-0 flex-1 rounded-control border border-field-line bg-panel-2 px-3 text-body text-ink focus-ring"
        />
        <Button type="submit" aria-label="Спросить" disabled={!text.trim()}>
          <Send aria-hidden />
        </Button>
      </form>
    </section>,
    document.body,
  );
}

function Answer({
  answer,
  done,
  onAsk,
  onDraft,
  onNavigate,
}: {
  answer: AssistantAnswer;
  done: boolean;
  onAsk: (question: string) => void;
  onDraft: () => void;
  onNavigate: () => void;
}) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col gap-2 rounded-card bg-panel-2 p-3">
      {answer.text.map((line) => (
        <p key={line} className="text-body">
          {line}
        </p>
      ))}
      {answer.items.length ? (
        <ul className="flex flex-col gap-1">
          {answer.items.map((item) => (
            <li key={item.text}>
              {item.to ? (
                <a
                  href={item.to}
                  onClick={(event) => {
                    // Адрес с поиском журнала: переход роутером, без перезагрузки вкладки
                    event.preventDefault();
                    void navigate({ href: item.to! });
                    onNavigate();
                  }}
                  className="inline-flex min-h-11 items-center text-body text-accent-text underline-offset-2 focus-ring hover:underline"
                >
                  {item.text}
                </a>
              ) : answer.intent === null ? (
                <button
                  type="button"
                  onClick={() => onAsk(item.text)}
                  className="min-h-11 text-left text-body text-accent-text focus-ring"
                >
                  {item.text}
                </button>
              ) : (
                <span className="text-body text-text-2">{item.text}</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {answer.draft ? (
        <div
          className="flex flex-col gap-2 rounded-control border border-line-2 p-3"
          data-testid="assistant-draft"
        >
          <p className="text-meta text-text-3">Черновик действия. Выполнится только по кнопке</p>
          <p className="text-body">Вопрос бригадиру: «{answer.draft.question}»</p>
          <Button variant="secondary" disabled={done} onClick={onDraft}>
            {done ? "Выполнено" : answer.draft.label}
          </Button>
        </div>
      ) : null}
      <p className="text-meta text-text-3">{answer.source}</p>
    </div>
  );
}
