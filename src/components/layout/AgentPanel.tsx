import { FileText, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApp } from "@/lib/app-context";

const thread = [
  {
    role: "user" as const,
    text: "Что горит по БЦ «Меридиан»?",
  },
  {
    role: "agent" as const,
    text: "Отставание 11,2% по объемам. Критично: заявка З-2026-118 на подконструкцию — ответил 1 поставщик из 3, потребность через 12 дней. Контрольная точка «Завершение монтажа подконструкции» наступает 21 августа.",
    sources: [
      { label: "Договор ПС-2025/067-СПК, с. 12", to: "/contracts" },
      { label: "Заявка З-2026-118", to: "/procurement" },
    ],
  },
];

export function AgentPanel() {
  const { agentPanelOpen, setAgentPanelOpen } = useApp();
  if (!agentPanelOpen) return null;

  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-56px)] w-[420px] shrink-0 flex-col border-l border-border bg-surface xl:flex">
      <div className="flex h-14 items-center justify-between border-b border-border px-5">
        <div>
          <div className="text-card-title">Агент-помощник</div>
          <div className="text-caption text-text-muted">Отвечает по данным системы</div>
        </div>
        <Button variant="ghost" size="icon" aria-label="Закрыть" onClick={() => setAgentPanelOpen(false)}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-5">
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
              {"sources" in m && m.sources && (
                <div className="mt-3 space-y-1 border-t border-border pt-2">
                  <div className="text-overline text-text-muted">Источники</div>
                  {m.sources.map((s) => (
                    <button
                      key={s.label}
                      className="flex w-full items-center gap-1.5 rounded-sm px-1 py-0.5 text-left text-caption text-info transition-fast hover:bg-info-bg"
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

      <div className="flex items-center gap-2 border-t border-border p-4">
        <Input placeholder="Спросите про объект, сроки, поставки…" className="text-table" />
        <Button size="icon" aria-label="Отправить">
          <Send className="size-4" />
        </Button>
      </div>
    </aside>
  );
}
