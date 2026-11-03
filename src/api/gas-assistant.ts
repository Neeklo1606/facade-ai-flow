/**
 * Помощник и напоминания для экранов (ADR-061, 13). Ответы считает domain по той же выборке,
 * что «Неделя» (`useGasWeekView`), отправку делает порт OutboundMessenger. Экраны не знают
 * ни реализации канала, ни модели.
 */
import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { OutboundButton } from "@/ports/messenger";
import { assistantModelStub } from "@/adapters/gas-ops/assistant-model-stub";
import {
  clearInbox,
  messengerDemo,
  readInbox,
  subscribeInbox,
  type InboxMessage,
} from "@/adapters/gas-ops/messenger-demo";
import {
  answer,
  suggestions,
  type AssistantAnswer,
  type AssistantDraft,
} from "@/domain/gas-ops/assistant";
import { remindersAt, summaryTimeOf, unsent } from "@/domain/gas-ops/reminders";
import { expectations } from "@/domain/gas-ops/week";
import { useGasActor, useGasData } from "@/lib/gas-ops/use-gas-ops";
import { useGasActions, useGasWeekView } from "./gas-ops";

export type { AssistantAnswer, AssistantDraft, InboxMessage };
export { clearInbox, summaryTimeOf };

/** Модель помощника: без ключа заглушка, свободный вопрос получает список вопросов */
export const assistantModel = assistantModelStub;

export function useGasAssistant(): {
  suggestions: string[];
  ask: (question: string) => AssistantAnswer;
  /** Выполнить черновик: только по нажатию человека, тем же действием проверки */
  runDraft: (draft: AssistantDraft) => Promise<{ done: number; failed: string[] }>;
} {
  const data = useGasData();
  const actor = useGasActor();
  const week = useGasWeekView();
  const actions = useGasActions();
  const list = useMemo(() => suggestions(data), [data]);
  const ask = useCallback(
    (question: string) => answer(question, { role: actor.role, data, reasons: week.reasons }),
    [actor.role, data, week.reasons],
  );
  const runDraft = useCallback(
    async (draft: AssistantDraft) => {
      let done = 0;
      const failed: string[] = [];
      for (const id of draft.entryIds) {
        const result = await actions.review({ id, action: "clarify", comment: draft.question });
        if (result.ok) done += 1;
        else failed.push(result.message);
      }
      return { done, failed };
    },
    [actions],
  );
  return { suggestions: list, ask, runDraft };
}

/* ---------------------------------------------------------------- Входящие и напоминания */

const EMPTY: InboxMessage[] = [];

/** Сообщения пользователю, отправленные портом в этой вкладке */
export function useGasInbox(userId: string | null): InboxMessage[] {
  const all = useSyncExternalStore(subscribeInbox, readInbox, () => EMPTY);
  return useMemo(() => (userId ? all.filter((m) => m.toUserId === userId) : EMPTY), [all, userId]);
}

/** Сообщения бригадиру бригады: их показывает лента бота, кто бы её ни смотрел */
export function useBrigadeInbox(brigadeId: string | null): InboxMessage[] {
  const data = useGasData();
  const foreman = data.users.find((u) => u.role === "foreman" && u.brigadeId === brigadeId);
  return useGasInbox(foreman?.id ?? null);
}

export const REMINDER_TIME_KEY = "gaika-reminder-time";

export function reminderTime(): string {
  try {
    return localStorage.getItem(REMINDER_TIME_KEY) ?? "18:00";
  } catch {
    return "18:00";
  }
}

const clockNow = () => {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
};

/**
 * Отправить, что положено на момент: дата — сегодняшний день демо-недели, время — часы
 * устройства или явно переданное. В демо отправку запускает кнопка «Проверить сейчас»
 * в «Подключениях»: по расписанию её будет делать сервер (T7), а прогон проверок не зависит
 * от времени суток. Возвращает число отправленных
 */
export function useSendReminders(): (clock?: string) => Promise<number> {
  const data = useGasData();
  return useCallback(
    async (clock?: string) => {
      const list = remindersAt({
        at: `${data.today}T${clock ?? clockNow()}`,
        time: reminderTime(),
        expected: expectations({
          days: data.week.days,
          brigades: data.brigades,
          objects: data.objects,
          schedule: data.schedule,
          assignments: data.assignments,
        }),
        entries: data.entries,
        users: data.users,
        brigades: data.brigades,
        objects: data.objects,
      });
      const sent = new Set(readInbox().map((m) => m.key));
      let count = 0;
      for (const r of unsent(list, sent)) {
        const result = await messengerDemo.send({
          key: r.key,
          toUserId: r.userId,
          text: r.text,
          buttons: r.links,
        });
        if (result.ok) count += 1;
      }
      return count;
    },
    [data],
  );
}

export const messengerChannel = messengerDemo.channel;

/** Кнопки-ссылки сообщения для колокольчика: кнопки ответа боту там не нажимаются */
export function linkButtons(buttons: readonly OutboundButton[]): { label: string; to: string }[] {
  return buttons.filter((b): b is { label: string; to: string } => "to" in b);
}
