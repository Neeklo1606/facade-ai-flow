import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Bot, FlaskConical, Loader2, Play } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ConfidenceIndicator } from "@/components/common/ConfidenceIndicator";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { agents, agentRuns, type Agent } from "@/mock/agents";
import { fmtDateTime, fmtNum } from "@/lib/format";

export const Route = createFileRoute("/agents")({
  head: () => ({
    meta: [
      { title: "Агенты — ФАСАД-РП" },
      { name: "description", content: "AI-агенты системы: статус, точность, стоимость запуска, настройки и тестовая площадка." },
      { property: "og:title", content: "Агенты — ФАСАД-РП" },
      { property: "og:description", content: "AI-агенты системы: статус, точность, стоимость запуска, настройки и тестовая площадка." },
    ],
  }),
  component: AgentsPage,
});

function AgentsPage() {
  const [state, setState] = useState(() =>
    Object.fromEntries(agents.map((a) => [a.id, a.enabled])) as Record<string, boolean>,
  );
  const [open, setOpen] = useState<Agent | null>(null);

  return (
    <>
      <PageHeader
        title="Агенты"
        description="Шесть агентов обрабатывают документы, отчёты и сроки. Действия агента подтверждает человек."
        meta={
          <>
            <StatusBadge tone="neutral">Всего: {agents.length}</StatusBadge>
            <StatusBadge tone="ok" dot>
              Активны: {Object.values(state).filter(Boolean).length}
            </StatusBadge>
            <StatusBadge tone="info">Данные синтетические</StatusBadge>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {agents.map((a) => {
          const enabled = state[a.id]!;
          return (
            <article key={a.id} className="card-surface flex flex-col p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-accent-subtle text-accent">
                    <Bot className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-card-title">{a.name}</h2>
                    <p className="mt-0.5 line-clamp-2 text-caption text-text-secondary">{a.summary}</p>
                  </div>
                </div>
                <Switch
                  checked={enabled}
                  onCheckedChange={(v) => setState((s) => ({ ...s, [a.id]: v }))}
                  aria-label={`Включить агента «${a.name}»`}
                />
              </div>

              <div className="mt-3">
                <StatusBadge tone={enabled ? "ok" : "neutral"} dot>
                  {enabled ? "Активен" : "Выключен"}
                </StatusBadge>
              </div>

              <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3">
                <div>
                  <dt className="text-overline text-text-muted">Запусков/нед.</dt>
                  <dd className="tnum text-card-title">{a.runsWeek}</dd>
                </div>
                <div>
                  <dt className="text-overline text-text-muted">Точность</dt>
                  <dd className="tnum text-card-title">{a.accuracy}%</dd>
                </div>
                <div>
                  <dt className="text-overline text-text-muted">Ср. запуск</dt>
                  <dd className="tnum text-card-title">
                    {a.avgCost.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ₽
                  </dd>
                </div>
              </dl>

              <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => setOpen(a)}>
                Настроить и протестировать
              </Button>
            </article>
          );
        })}
      </div>

      <Dialog open={Boolean(open)} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          {open && (
            <AgentDialog
              agent={open}
              enabled={state[open.id]!}
              onToggle={(v) => setState((s) => ({ ...s, [open.id]: v }))}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function AgentDialog({
  agent,
  enabled,
  onToggle,
}: {
  agent: Agent;
  enabled: boolean;
  onToggle: (v: boolean) => void;
}) {
  const [settings, setSettings] = useState(agent.settings);
  const [testState, setTestState] = useState<"idle" | "running" | "done">("idle");
  const runs = agentRuns.filter((r) => r.agentId === agent.id).slice(0, 6);

  const runTest = () => {
    setTestState("running");
    setTimeout(() => setTestState("done"), 1200);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex flex-wrap items-center gap-2">
          {agent.name}
          <StatusBadge tone={enabled ? "ok" : "neutral"} dot>
            {enabled ? "Активен" : "Выключен"}
          </StatusBadge>
        </DialogTitle>
        <DialogDescription>{agent.description}</DialogDescription>
      </DialogHeader>

      <Tabs defaultValue="settings">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="settings">Настройки</TabsTrigger>
          <TabsTrigger value="prompt">Промпт</TabsTrigger>
          <TabsTrigger value="tools">Инструменты</TabsTrigger>
          <TabsTrigger value="history">История</TabsTrigger>
          <TabsTrigger value="test">Тест</TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="space-y-2 pt-3">
          <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5">
            <div>
              <div className="text-table font-medium">Агент включён</div>
              <div className="text-caption text-text-muted">Отключение останавливает автозапуски</div>
            </div>
            <Switch checked={enabled} onCheckedChange={onToggle} aria-label="Агент включён" />
          </div>
          {settings.map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-table">{s.label}</div>
                <div className="text-caption text-text-muted">{s.hint}</div>
              </div>
              <Switch
                checked={s.enabled}
                onCheckedChange={(v) =>
                  setSettings((prev) => prev.map((p) => (p.key === s.key ? { ...p, enabled: v } : p)))
                }
                aria-label={s.label}
              />
            </div>
          ))}
        </TabsContent>

        <TabsContent value="prompt" className="pt-3">
          <div className="mb-2 text-caption text-text-muted">Системный промпт, только для чтения</div>
          <pre className="max-h-72 overflow-auto rounded-md border border-border bg-subtle p-3 text-caption leading-relaxed whitespace-pre-wrap">
            {agent.prompt}
          </pre>
        </TabsContent>

        <TabsContent value="tools" className="space-y-2 pt-3">
          {agent.tools.map((t) => (
            <div key={t.name} className="rounded-md border border-border px-3 py-2.5">
              <div className="font-mono text-caption text-accent">{t.name}</div>
              <div className="text-table text-text-secondary">{t.description}</div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="history" className="pt-3">
          <ul className="divide-y divide-border rounded-md border border-border">
            {runs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-table">{r.target}</div>
                  <div className="tnum text-caption text-text-muted">
                    {fmtDateTime(r.at)} · {r.durationSec} с · {fmtNum(r.tokens)} токенов
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="tnum text-caption text-text-secondary">
                    {r.cost.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ₽
                  </span>
                  <StatusBadge tone={r.success ? "ok" : "danger"} dot>
                    {r.success ? "Успех" : "Ошибка"}
                  </StatusBadge>
                </div>
              </li>
            ))}
          </ul>
        </TabsContent>

        <TabsContent value="test" className="space-y-3 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-subtle px-3 py-2.5">
            <div className="min-w-0">
              <div className="text-overline text-text-muted">Тестовый файл</div>
              <div className="truncate text-table">{agent.testFileName}</div>
            </div>
            <Button size="sm" onClick={runTest} disabled={testState === "running"}>
              {testState === "running" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              Прогнать на тестовом файле
            </Button>
          </div>

          {testState === "idle" && (
            <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border px-4 py-8 text-center">
              <FlaskConical className="size-5 text-text-muted" strokeWidth={1.5} />
              <div className="text-table text-text-secondary">
                Демо-прогон без обращения к языковой модели
              </div>
            </div>
          )}

          {testState === "running" && (
            <div className="rounded-md border border-border px-3 py-6 text-center text-table text-text-muted">
              Обработка тестового файла…
            </div>
          )}

          {testState === "done" && (
            <div className="rounded-md border border-border">
              <div className="border-b border-border px-3 py-2 text-overline text-text-muted">
                Результат демо-прогона
              </div>
              <ul className="divide-y divide-border">
                {agent.testFields.map((f) => (
                  <li key={f.label} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                    <span className="text-caption text-text-muted">{f.label}</span>
                    <span className="flex items-center gap-2 text-table">
                      <span className="tnum">{f.value}</span>
                      <ConfidenceIndicator level={f.confidence} />
                    </span>
                  </li>
                ))}
              </ul>
              <div className="border-t border-border px-3 py-2 text-caption text-text-muted">
                Сгенерировано агентом, требует проверки человеком
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
