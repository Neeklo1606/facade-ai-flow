import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, ScrollText } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { agentRuns, agents, agentName } from "@/mock/agents";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/agent-log")({
  head: () => ({
    meta: [
      { title: "Журнал агентов — ФАСАД-РП" },
      { name: "description", content: "Лента запусков агентов: вход, шаги, инструменты, результат и стоимость." },
      { property: "og:title", content: "Журнал агентов — ФАСАД-РП" },
      { property: "og:description", content: "Лента запусков агентов: вход, шаги, инструменты, результат и стоимость." },
    ],
  }),
  component: AgentLogPage,
});

const NOW = new Date("2026-08-12T12:00:00+03:00");
const rub = (v: number) => v.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function AgentLogPage() {
  const [agent, setAgent] = useState("all");
  const [status, setStatus] = useState("all");
  const [period, setPeriod] = useState("30");
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(() => {
    const from = NOW.getTime() - Number(period) * 86400000;
    return agentRuns.filter(
      (r) =>
        (agent === "all" || r.agentId === agent) &&
        (status === "all" || (status === "ok") === r.success) &&
        new Date(r.at).getTime() >= from,
    );
  }, [agent, status, period]);

  const totalCost = rows.reduce((s, r) => s + r.cost, 0);
  const failed = rows.filter((r) => !r.success).length;

  return (
    <>
      <PageHeader
        title="Журнал агентов"
        description="Каждый запуск агента: вход, шаги, вызванные инструменты, результат и стоимость."
        meta={
          <>
            <StatusBadge tone="neutral">Запусков: {rows.length}</StatusBadge>
            <StatusBadge tone={failed ? "danger" : "ok"} dot>
              Неуспешных: {failed}
            </StatusBadge>
            <StatusBadge tone="info">Стоимость: {rub(totalCost)} ₽</StatusBadge>
          </>
        }
      />

      <div className="card-surface mb-3 flex flex-wrap gap-2 p-3">
        <Select value={agent} onValueChange={setAgent}>
          <SelectTrigger className="h-10 w-full sm:w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все агенты</SelectItem>
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-10 w-full sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Любой результат</SelectItem>
            <SelectItem value="ok">Успешные</SelectItem>
            <SelectItem value="fail">Неуспешные</SelectItem>
          </SelectContent>
        </Select>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="h-10 w-full sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1">За сутки</SelectItem>
            <SelectItem value="7">За 7 дней</SelectItem>
            <SelectItem value="30">За 30 дней</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {rows.length === 0 ? (
        <div className="card-surface">
          <EmptyState
            icon={ScrollText}
            title="Запусков не найдено"
            description="Измените фильтры: агент, результат или период."
          />
        </div>
      ) : (
        <div className="card-surface divide-y divide-border">
          {rows.map((r) => {
            const expanded = open === r.id;
            return (
              <div key={r.id}>
                <button
                  onClick={() => setOpen(expanded ? null : r.id)}
                  aria-expanded={expanded}
                  className="flex min-h-11 w-full items-start gap-3 px-4 py-3 text-left transition-fast hover:bg-subtle"
                >
                  <ChevronDown
                    className={cn("mt-0.5 size-4 shrink-0 text-text-muted transition-fast", expanded && "rotate-180")}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tnum text-caption text-text-muted">{fmtDateTime(r.at)}</span>
                      <span className="text-table font-medium">{agentName(r.agentId)}</span>
                      <StatusBadge tone={r.success ? "ok" : "danger"} dot>
                        {r.success ? "Успех" : "Ошибка"}
                      </StatusBadge>
                    </div>
                    <div className="mt-0.5 truncate text-table text-text-secondary">{r.target}</div>
                    <div className="tnum mt-0.5 text-caption text-text-muted">
                      {r.durationSec} с · {fmtNum(r.tokens)} токенов · {rub(r.cost)} ₽ · {r.result}
                    </div>
                  </div>
                </button>

                {expanded && (
                  <div className="grid gap-3 border-t border-border bg-subtle/60 px-4 py-3 lg:grid-cols-2">
                    <Block title="Вход">{r.input}</Block>
                    <Block title="Вызванные инструменты">
                      <div className="flex flex-wrap gap-1.5">
                        {r.tools.map((t) => (
                          <span key={t} className="rounded-xl bg-accent-subtle px-2 py-0.5 font-mono text-caption text-accent">
                            {t}
                          </span>
                        ))}
                      </div>
                    </Block>
                    <Block title="Шаги">
                      <ol className="space-y-1">
                        {r.steps.map((s, i) => (
                          <li key={s} className="flex gap-2 text-table">
                            <span className="tnum text-text-muted">{i + 1}.</span>
                            <span>{s}</span>
                          </li>
                        ))}
                      </ol>
                    </Block>
                    <Block title="Выход">{r.output}</Block>
                    {r.failReason && (
                      <div className="rounded-xl border border-danger/40 bg-danger-bg px-3 py-2 lg:col-span-2">
                        <div className="text-overline text-danger">Причина неуспеха</div>
                        <div className="text-table text-danger">{r.failReason}</div>
                      </div>
                    )}
                    <Block title="Подтверждение человеком" className="lg:col-span-2">
                      {r.confirmedBy ?? "Не требовалось: результат не менял данные системы"}
                    </Block>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function Block({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border bg-[color:var(--bg-elevated)] px-3 py-2", className)}>
      <div className="text-overline text-text-muted">{title}</div>
      <div className="mt-0.5 text-table">{children}</div>
    </div>
  );
}
