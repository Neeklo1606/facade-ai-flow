import { useState } from "react";
import { FileText, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/common/StatusBadge";
import { useApp } from "@/lib/app-context";

interface Msg {
  role: "user" | "agent";
  text: string;
  sources?: { label: string }[];
  lowConfidence?: boolean;
}

const chips = [
  "Что горит на ЖК «Северная Корона»?",
  "Когда приедет керамогранит?",
  "Сравни поставщиков по кронштейнам",
];

const answers: Record<string, Msg> = {
  [chips[0]!]: {
    role: "agent",
    text: "Отставание 4,8% по облицовке. Критично: не хватает кронштейнов КР-150 (~200 шт.), заявка З-2026-121 разослана 3 поставщикам, ответов пока нет. Контрольная точка «Завершение захватки 2» — 21 августа.",
    sources: [
      { label: "Отчёт Р-2026-341 от 12.08" },
      { label: "Заявка З-2026-121" },
      { label: "Договор СИ-2025/114-НВФ, с. 8" },
    ],
  },
  [chips[1]!]: {
    role: "agent",
    text: "По заявке З-2026-114 (керамогранит, 2 400 м²) лучшее предложение — «Керамика Трейд», срок поставки 12 рабочих дней, ориентировочно 27 августа. Поставщик пока не выбран, дата ориентировочная.",
    sources: [{ label: "Заявка З-2026-114" }, { label: "Поставщик «Керамика Трейд»" }],
    lowConfidence: true,
  },
  [chips[2]!]: {
    role: "agent",
    text: "По кронштейнам отвечали трое: МеталлПрофиль-Юг — 1 780 ₽/шт., 7 дней, рейтинг 4,6; СтройКомплект — 1 690 ₽/шт., 12 дней, рейтинг 4,1 (2 срыва поставки); Фасад-Снаб — 1 845 ₽/шт., 5 дней, рейтинг 4,8. По цене выгоднее СтройКомплект, по надёжности — Фасад-Снаб.",
    sources: [{ label: "Сравнение по заявке З-2026-121" }, { label: "Реестр поставщиков" }],
  },
};

const fallback: Msg = {
  role: "agent",
  text: "В демо-режиме помощник отвечает на подготовленные вопросы и не обращается к языковой модели. Попробуйте один из вариантов ниже.",
  lowConfidence: true,
};

function useThread() {
  const [thread, setThread] = useState<Msg[]>([
    {
      role: "agent",
      text: "Отвечаю по данным системы: отчёты, задачи, договоры и заявки. Выберите вопрос или спросите своими словами.",
    },
  ]);
  const [draft, setDraft] = useState("");

  const ask = (text: string) => {
    const answer = answers[text] ?? fallback;
    setThread((t) => [...t, { role: "user", text }, answer]);
    setDraft("");
  };

  return { thread, draft, setDraft, ask };
}

function Thread({ onClose }: { onClose: () => void }) {
  const { thread, draft, setDraft, ask } = useThread();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
        <div>
          <div className="text-card-title">Агент-помощник</div>
          <div className="text-caption text-text-muted">Отвечает по данным системы</div>
        </div>
        <Button variant="ghost" size="icon" aria-label="Закрыть" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        {thread.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            <div
              className={
                m.role === "user"
                  ? "max-w-[85%] rounded-lg bg-accent-subtle px-3 py-2 text-table"
                  : "w-full rounded-lg border border-border bg-subtle px-3 py-2.5 text-table"
              }
            >
              {m.text}
              {m.lowConfidence && (
                <div className="mt-2">
                  <StatusBadge tone="warn" dot>
                    Сгенерировано агентом, требует проверки
                  </StatusBadge>
                </div>
              )}
              {m.sources && (
                <div className="mt-3 space-y-1 border-t border-border pt-2">
                  <div className="text-overline text-text-muted">Источники</div>
                  {m.sources.map((s) => (
                    <button
                      key={s.label}
                      className="flex w-full items-center gap-1.5 rounded-sm px-1 py-1 text-left text-caption text-info transition-fast hover:bg-info-bg"
                    >
                      <FileText className="size-3.5 shrink-0" />
                      <span className="truncate">{s.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="shrink-0 border-t border-border p-4">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <button
              key={c}
              onClick={() => ask(c)}
              className="rounded-full border border-border px-2.5 py-1.5 text-caption text-text-secondary transition-fast hover:bg-subtle"
            >
              {c}
            </button>
          ))}
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) ask(draft.trim());
          }}
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Спросите про объект, сроки, поставки…"
            className="h-11 text-table"
          />
          <Button size="icon" type="submit" className="size-11 shrink-0" aria-label="Отправить">
            <Send className="size-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}

export function AgentPanel() {
  const { agentPanelOpen, setAgentPanelOpen } = useApp();

  return (
    <>
      {agentPanelOpen && (
        <aside className="sticky top-14 hidden h-[calc(100vh-56px)] w-[420px] shrink-0 border-l border-border bg-surface xl:block">
          <Thread onClose={() => setAgentPanelOpen(false)} />
        </aside>
      )}

      <Sheet open={agentPanelOpen} onOpenChange={setAgentPanelOpen}>
        <SheetContent side="right" className="w-full p-0 xl:hidden">
          <SheetTitle className="sr-only">Агент-помощник</SheetTitle>
          <Thread onClose={() => setAgentPanelOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
