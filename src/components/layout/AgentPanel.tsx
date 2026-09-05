import { useState } from "react";
import { Bot, ExternalLink, Send, X } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfidenceIndicator } from "@/components/common/ConfidenceIndicator";
import { cn } from "@/lib/utils";

interface Reply {
  text: string;
  confidence: number;
  sources: string[];
}

const chips = [
  "Что горит на ЖК «Северная Корона»?",
  "Когда приедет керамогранит?",
  "Сравни поставщиков по кронштейнам",
];

const answers: Record<string, Reply> = {
  [chips[0]]: {
    text:
      "Два критичных пункта. Первый: нащельник угловой — остаток 0 при потребности 180 шт, монтаж примыканий на захватке 2 встанет 6 сентября. Второй: незакрытый объём по облицовке 554 м² против плана на 5 сентября.",
    confidence: 0.92,
    sources: ["Голосовой отчёт Гареева, 05.09, 00:28", "Работы: монтаж облицовки, захватка 2", "Заявка З-2026/319"],
  },
  [chips[1]]: {
    text:
      "Керамогранит 600х600 антрацит, 1 200 м² по заявке З-2026/317 — «Керамика Трейд», ожидаемая дата 12 сентября, статус «в пути». Партия 420 м² принята 29 августа с замечанием по сколам.",
    confidence: 0.88,
    sources: ["Поставка ДЛ-1", "Счёт № 4417 от 03.09", "Чек-лист входного контроля, 04.09"],
  },
  [chips[2]]: {
    text:
      "По кронштейну КР-150: «МеталлПрофиль Групп» 259 ₽/шт при сроке 18 дней, «Фасад-Комплект» 268 ₽/шт при сроке 12 дней. С учётом срока выгоднее «Фасад-Комплект»: разница 30 600 ₽ против 6 дней простоя.",
    confidence: 0.81,
    sources: ["Письмо «МеталлПрофиль Групп», 04.09", "Письмо «Фасад-Комплект», 05.09", "Заявка З-2026/318"],
  },
};

const fallback: Reply = {
  text:
    "Я отвечаю только по данным системы и всегда показываю источник. Точного ответа по этому вопросу в подтверждённых записях нет — уточните формулировку или выберите один из вопросов ниже.",
  confidence: 0.42,
  sources: [],
};

export function AgentPanel() {
  const { agentPanelOpen, setAgentPanelOpen } = useApp();
  const [thread, setThread] = useState<{ q: string; a: Reply }[]>([]);
  const [input, setInput] = useState("");

  const ask = (q: string) => {
    if (!q.trim()) return;
    setThread((t) => [...t, { q, a: answers[q] ?? fallback }]);
    setInput("");
  };

  if (!agentPanelOpen) return null;

  return (
    <aside
      className={cn(
        "fixed inset-0 z-50 flex flex-col bg-surface lg:sticky lg:top-14 lg:z-20 lg:h-[calc(100vh-3.5rem)] lg:w-[420px] lg:shrink-0 lg:border-l lg:border-border",
      )}
    >
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
        <div className="flex items-center gap-2">
          <Bot className="size-4 text-accent" />
          <span className="text-card-title">Агент руководителя</span>
        </div>
        <button
          type="button"
          onClick={() => setAgentPanelOpen(false)}
          aria-label="Закрыть панель"
          className="grid size-11 place-items-center rounded-md text-text-secondary transition-fast hover:bg-subtle lg:size-9"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <p className="text-caption text-text-secondary">
          Отвечаю по подтверждённым данным. Каждый ответ содержит ссылку на первоисточник.
        </p>

        {thread.map((m, i) => (
          <div key={i} className="space-y-2">
            <div className="ml-auto w-fit max-w-[85%] rounded-md bg-accent-subtle px-3 py-2 text-[13px] text-accent">
              {m.q}
            </div>
            <div className="rounded-md border border-border bg-subtle p-3">
              <p className="text-[13px] leading-relaxed">{m.a.text}</p>
              <div className="mt-2">
                <ConfidenceIndicator value={m.a.confidence} />
              </div>
              {m.a.sources.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {m.a.sources.map((s) => (
                    <li key={s}>
                      <button type="button" className="flex items-center gap-1.5 text-left text-caption text-info transition-fast hover:underline">
                        <ExternalLink className="size-3 shrink-0" />
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}

        <div className="space-y-1.5">
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => ask(c)}
              className="block w-full rounded-md border border-border px-3 py-2 text-left text-caption transition-fast hover:bg-subtle"
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <form
        className="flex shrink-0 items-center gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Задайте вопрос по данным" className="h-10" />
        <Button type="submit" size="icon" className="size-10 shrink-0" aria-label="Отправить">
          <Send className="size-4" />
        </Button>
      </form>
    </aside>
  );
}
