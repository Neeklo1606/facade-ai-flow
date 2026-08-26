import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Mail, Pencil, Send, ShieldAlert, X } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel } from "@/components/common/Panel";
import { StatusBadge, type StatusTone } from "@/components/common/StatusBadge";
import { AgentSourceBadge } from "@/components/common/AgentSourceBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { projects } from "@/mock/projects";
import {
  escalationRules,
  mailEventLabels,
  mailRules,
  mailTemplates,
  outgoingMails,
  outgoingStatusLabels,
  type MailTemplate,
  type OutgoingMail,
  type OutgoingStatus,
} from "@/mock/mailings";
import { fmtDateTime } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/mailings")({
  head: () => ({
    meta: [
      { title: "Рассылки заказчикам — ФАСАД-РП" },
      { name: "description", content: "Шаблоны писем, правила и расписание, исходящие с подтверждением человеком и эскалации." },
      { property: "og:title", content: "Рассылки заказчикам — ФАСАД-РП" },
      { property: "og:description", content: "Шаблоны писем, правила и расписание, исходящие с подтверждением человеком и эскалации." },
    ],
  }),
  component: MailingsPage,
});

const statusTone: Record<OutgoingStatus, StatusTone> = {
  pending: "warn",
  sent: "ok",
  rejected: "danger",
  draft: "neutral",
};

const projectName = (id: string) => projects.find((p) => p.id === id)?.shortName ?? id;

function MailingsPage() {
  const [templates, setTemplates] = useState<MailTemplate[]>(mailTemplates);
  const [editing, setEditing] = useState<MailTemplate | null>(null);
  const [draft, setDraft] = useState({ subject: "", body: "" });
  const [rules, setRules] = useState(mailRules);
  const [escalations, setEscalations] = useState(escalationRules);
  const [mails, setMails] = useState<OutgoingMail[]>(outgoingMails);
  const [preview, setPreview] = useState<OutgoingMail | null>(null);

  const setMailStatus = (id: string, status: OutgoingStatus) => {
    setMails((p) => p.map((m) => (m.id === id ? { ...m, status } : m)));
    setPreview(null);
    toast[status === "sent" ? "success" : "message"](
      status === "sent" ? "Письмо «отправлено» — демо-имитация" : "Письмо отклонено",
      { description: status === "sent" ? "Реальная отправка отключена в прототипе." : "Останется в журнале как отклоненное." },
    );
  };

  return (
    <>
      <PageHeader
        title="Рассылки заказчикам"
        description="Агент готовит письма, отправку всегда подтверждает человек. Данные синтетические."
        meta={
          <>
            <StatusBadge tone="accent">В проде — подключение корпоративной почты</StatusBadge>
            <span className="text-caption text-text-muted">Автоотправка без подтверждения не предусмотрена</span>
          </>
        }
      />

      <Tabs defaultValue="templates">
        <TabsList className="w-full overflow-x-auto lg:w-auto">
          <TabsTrigger value="templates" className="flex-1 lg:flex-none">Шаблоны</TabsTrigger>
          <TabsTrigger value="rules" className="flex-1 lg:flex-none">Правила и расписание</TabsTrigger>
          <TabsTrigger value="outbox" className="flex-1 lg:flex-none">Исходящие</TabsTrigger>
          <TabsTrigger value="escalations" className="flex-1 lg:flex-none">Эскалации</TabsTrigger>
        </TabsList>

        {/* Шаблоны */}
        <TabsContent value="templates" className="mt-4">
          <div className="grid gap-3 lg:grid-cols-3">
            {templates.map((t) => (
              <Panel
                key={t.id}
                title={t.name}
                bodyClassName="p-4"
                action={
                  <AgentSourceBadge agent={t.agent} at="шаблон" source={`триггер: ${t.trigger}`} />
                }
                footer={
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-1.5"
                    onClick={() => {
                      setEditing(t);
                      setDraft({ subject: t.subject, body: t.body });
                    }}
                  >
                    <Pencil className="size-4" /> Редактировать текст
                  </Button>
                }
              >
                <StatusBadge tone="info">{t.trigger}</StatusBadge>
                <p className="mt-2.5 text-caption text-text-muted">Тема</p>
                <p className="text-table">{t.subject}</p>
                <p className="mt-2.5 text-caption text-text-muted">Превью</p>
                <pre className="mt-1 max-h-52 overflow-y-auto whitespace-pre-wrap rounded-xl bg-subtle p-3 text-caption leading-5 text-text-secondary">
                  {t.body}
                </pre>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {["{{Заказчик}}", "{{Объект}}", "{{Дата}}", "{{СтатусыЭтапов}}"].map((v) => (
                    <span key={v} className="rounded-full bg-subtle px-1.5 py-0.5 text-caption text-text-muted">{v}</span>
                  ))}
                </div>
              </Panel>
            ))}
          </div>
        </TabsContent>

        {/* Правила */}
        <TabsContent value="rules" className="mt-4">
          <div className="grid gap-3 lg:grid-cols-2">
            {rules.map((r) => (
              <Panel key={r.id} bodyClassName="p-4">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0">
                    <p className="text-card-title">{mailEventLabels[r.event]}</p>
                    <p className="mt-1 text-caption text-text-secondary">
                      Шаблон: {templates.find((t) => t.id === r.templateId)?.name}
                    </p>
                  </div>
                  <Switch
                    checked={r.enabled}
                    aria-label="Включить правило"
                    onCheckedChange={(v) => {
                      setRules((p) => p.map((x) => (x.id === r.id ? { ...x, enabled: v } : x)));
                      toast.message(v ? "Правило включено" : "Правило выключено");
                    }}
                  />
                </div>
                <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-table">
                  <dt className="text-caption text-text-muted">Получатели</dt>
                  <dd>{r.recipients.join(", ")}</dd>
                  <dt className="text-caption text-text-muted">Канал</dt>
                  <dd>{r.channel}</dd>
                  <dt className="text-caption text-text-muted">Расписание</dt>
                  <dd className="tnum">{r.schedule}</dd>
                </dl>
                <div className="mt-3">
                  <StatusBadge tone="warn">Отправка только после подтверждения РП</StatusBadge>
                </div>
              </Panel>
            ))}
          </div>
        </TabsContent>

        {/* Исходящие */}
        <TabsContent value="outbox" className="mt-4">
          {mails.length === 0 ? (
            <Panel bodyClassName="p-0">
              <EmptyState icon={Mail} title="Писем нет" description="Журнал исходящих пуст." />
            </Panel>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {mails.map((m) => (
                <Panel key={m.id} bodyClassName="p-4">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-card-title">{m.subject}</p>
                      <p className="mt-1 truncate text-caption text-text-secondary">
                        {projectName(m.projectId)} · {m.customer} · {m.to}
                      </p>
                    </div>
                    <StatusBadge tone={statusTone[m.status]}>{outgoingStatusLabels[m.status]}</StatusBadge>
                  </div>
                  <p className="tnum mt-2 text-caption text-text-muted">
                    {fmtDateTime(m.createdAt)} · шаблон «{m.templateName}»
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-caption text-text-secondary">
                    <AgentSourceBadge agent={m.agent} at={fmtDateTime(m.createdAt)} source={m.reason} />
                    {m.reason}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" className="h-9" onClick={() => setPreview(m)}>
                      Превью
                    </Button>
                    {m.status === "pending" && (
                      <>
                        <Button size="sm" className="h-9 gap-1.5" onClick={() => setMailStatus(m.id, "sent")}>
                          <Send className="size-4" /> Отправить (демо)
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 gap-1.5 text-danger"
                          onClick={() => setMailStatus(m.id, "rejected")}
                        >
                          <X className="size-4" /> Отклонить
                        </Button>
                      </>
                    )}
                  </div>
                </Panel>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Эскалации */}
        <TabsContent value="escalations" className="mt-4">
          <Panel title="Правила эскалации" bodyClassName="p-0">
            <ul className="divide-y divide-border">
              {escalations.map((e) => (
                <li key={e.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 px-4 py-3.5">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warn" strokeWidth={1.5} />
                  <div className="min-w-0">
                    <p className="text-table font-medium">{e.condition}</p>
                    <p className="mt-0.5 text-caption text-text-secondary">{e.action}</p>
                  </div>
                  <Switch
                    checked={e.enabled}
                    aria-label="Включить эскалацию"
                    onCheckedChange={(v) =>
                      setEscalations((p) => p.map((x) => (x.id === e.id ? { ...x, enabled: v } : x)))
                    }
                  />
                </li>
              ))}
            </ul>
          </Panel>
        </TabsContent>
      </Tabs>

      {/* Редактирование шаблона */}
      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing?.name}</DialogTitle>
            <DialogDescription>
              Поддерживаются подстановки: {"{{Заказчик}}"}, {"{{Объект}}"}, {"{{Дата}}"}, {"{{СтатусыЭтапов}}"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-caption text-text-muted" htmlFor="subj">Тема письма</label>
              <Input
                id="subj"
                value={draft.subject}
                onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
                className="mt-1 h-9"
              />
            </div>
            <div>
              <label className="text-caption text-text-muted" htmlFor="body">Текст письма</label>
              <Textarea
                id="body"
                value={draft.body}
                rows={14}
                onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                className="mt-1 font-normal"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Отмена</Button>
            <Button
              onClick={() => {
                if (!editing) return;
                setTemplates((p) =>
                  p.map((t) => (t.id === editing.id ? { ...t, subject: draft.subject, body: draft.body } : t)),
                );
                setEditing(null);
                toast.success("Шаблон сохранен (демо)");
              }}
            >
              Сохранить шаблон
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Превью письма */}
      <Dialog open={Boolean(preview)} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{preview?.subject}</DialogTitle>
            <DialogDescription>
              Кому: {preview?.to} · {preview && fmtDateTime(preview.createdAt)}
            </DialogDescription>
          </DialogHeader>
          <pre className="whitespace-pre-wrap rounded-xl bg-subtle p-4 text-table leading-6">{preview?.body}</pre>
          {preview?.status === "pending" && (
            <DialogFooter>
              <Button variant="ghost" className="text-danger" onClick={() => setMailStatus(preview.id, "rejected")}>
                Отклонить
              </Button>
              <Button className="gap-1.5" onClick={() => setMailStatus(preview.id, "sent")}>
                <Send className="size-4" /> Отправить (демо)
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
