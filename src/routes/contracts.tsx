import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  FileSignature,
  ListPlus,
  Loader2,
  Pencil,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel } from "@/components/common/Panel";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge, type StatusTone } from "@/components/common/StatusBadge";
import { ConfidenceIndicator } from "@/components/common/ConfidenceIndicator";
import { AgentSourceBadge } from "@/components/common/AgentSourceBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useData } from "@/lib/data-context";
import { projects } from "@/mock/projects";
import {
  contracts,
  contractStatusLabels,
  type ContractDoc,
  type ContractStatus,
  type ExtractedField,
} from "@/mock/contracts";
import { fmtDate, fmtDateTime, fmtMln } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/contracts")({
  head: () => ({
    meta: [
      { title: "Договоры и контроль — ФАСАД-РП" },
      { name: "description", content: "Условия договоров, извлеченные агентом: сроки, этапы, штрафы и контрольные точки." },
      { property: "og:title", content: "Договоры и контроль — ФАСАД-РП" },
      { property: "og:description", content: "Условия договоров, извлеченные агентом: сроки, этапы, штрафы и контрольные точки." },
    ],
  }),
  component: ContractsPage,
});

const statusTone: Record<ContractStatus, StatusTone> = {
  uploaded: "neutral",
  recognizing: "info",
  ready: "ok",
  review: "warn",
};

const projectName = (id: string) => projects.find((p) => p.id === id)?.shortName ?? id;

const DemoBadge = () => (
  <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-subtle px-2 py-1 text-caption text-accent">
    <Sparkles className="size-3.5" /> Парсинг: демо-имитация
  </span>
);

function ContractsPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [project, setProject] = useState("all");
  const [status, setStatus] = useState("all");

  const rows = contracts.filter(
    (c) =>
      (project === "all" || c.projectId === project) && (status === "all" || c.status === status),
  );

  const active = contracts.find((c) => c.id === openId) ?? null;

  const columns: Column<ContractDoc>[] = [
    {
      key: "project",
      header: "Объект",
      cell: (c) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium">{projectName(c.projectId)}</span>
          <span className="block truncate text-caption text-text-muted">{c.customer}</span>
        </span>
      ),
    },
    { key: "no", header: "№ договора", cell: (c) => <span className="tnum whitespace-nowrap">{c.number}</span> },
    { key: "date", header: "Дата", cell: (c) => <span className="tnum whitespace-nowrap">{fmtDate(c.date)}</span> },
    { key: "sum", header: "Сумма", align: "right", cell: (c) => <span className="tnum whitespace-nowrap">{fmtMln(c.sum)}</span> },
    {
      key: "status",
      header: "Обработка агентом",
      cell: (c) => (
        <StatusBadge tone={statusTone[c.status]}>
          {contractStatusLabels[c.status]}
        </StatusBadge>
      ),
    },
    {
      key: "milestones",
      header: "Контр. точек",
      align: "right",
      cell: (c) => <span className="tnum">{c.status === "recognizing" ? "—" : c.milestones.length}</span>,
    },
    {
      key: "tasks",
      header: "Задач создано",
      align: "right",
      cell: (c) => <span className="tnum">{c.tasksCreated}</span>,
    },
  ];

  if (active) return <ContractDetail contract={active} onBack={() => setOpenId(null)} />;

  return (
    <>
      <PageHeader
        title="Договоры и контроль"
        description="Агент извлекает условия договора; каждое поле подтверждает человек. Данные синтетические."
        meta={
          <>
            <DemoBadge />
            <span className="text-caption text-text-muted">В проде — PDF-парсер с цитатами страниц</span>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={project} onValueChange={setProject}>
          <SelectTrigger className="h-9 w-56"><SelectValue placeholder="Объект" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все объекты</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.shortName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-56"><SelectValue placeholder="Статус обработки" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Любой статус</SelectItem>
            {(Object.keys(contractStatusLabels) as ContractStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{contractStatusLabels[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Panel bodyClassName="p-0">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(c) => c.id}
          onRowClick={(c) => setOpenId(c.id)}
          empty={
            <EmptyState
              icon={FileSignature}
              title="Договоров нет"
              description="Под выбранные фильтры договоры не нашлись."
            />
          }
        />
      </Panel>
    </>
  );
}

function ContractDetail({ contract, onBack }: { contract: ContractDoc; onBack: () => void }) {
  const { createTask } = useData();
  const [highlight, setHighlight] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [tasksOpen, setTasksOpen] = useState(false);
  const [picked, setPicked] = useState<Record<string, boolean>>(
    Object.fromEntries(contract.milestones.map((m) => [m.id, true])),
  );
  const [createdCount, setCreatedCount] = useState(0);
  const pageRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const goToQuote = (f: ExtractedField) => {
    setHighlight(f.quoteId);
    pageRefs.current[f.quoteId]?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const recognizing = contract.status === "recognizing";

  const docPanel = (
    <Panel
      title={`Документ · ${contract.pages.length} стр.`}
      bodyClassName="max-h-[70vh] overflow-y-auto p-4 lg:max-h-[calc(100vh-260px)]"
      action={<span className="text-caption text-text-muted">Мок-страницы, не PDF</span>}
    >
      <div className="space-y-4">
        {contract.pages.map((pg) => (
          <div key={pg.page} className="rounded-xl border border-border bg-elevated p-4">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <span className="text-caption font-medium">{pg.title}</span>
              <span className="tnum text-caption text-text-muted">стр. {pg.page}</span>
            </div>
            <div className="space-y-2.5">
              {pg.blocks.map((b) => (
                <div
                  key={b.id}
                  ref={(el) => {
                    pageRefs.current[b.id] = el;
                  }}
                  className={cn(
                    "rounded-full px-2 py-1.5 text-table leading-6 transition-fast",
                    highlight === b.id ? "bg-warn-bg text-text-primary ring-1 ring-warn" : "text-text-secondary",
                  )}
                >
                  {b.clause && <span className="tnum mr-1.5 text-caption text-text-muted">{b.clause}</span>}
                  {b.text}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );

  const fieldsPanel = (
    <Panel
      title="Данные, извлеченные агентом"
      bodyClassName="max-h-[70vh] overflow-y-auto p-4 lg:max-h-[calc(100vh-260px)]"
      action={<AgentSourceBadge agent={contract.agent} at={fmtDateTime(contract.parsedAt)} source={`договор ${contract.number}`} />}
      footer={
        !recognizing ? (
          <Button size="sm" className="w-full gap-1.5" onClick={() => setTasksOpen(true)}>
            <ListPlus className="size-4" /> Создать задачи из контрольных точек
          </Button>
        ) : undefined
      }
    >
      {recognizing ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-caption text-text-secondary">
            <Loader2 className="size-4 animate-spin text-accent" /> Агент распознает документ: страница 12 из 28
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-subtle">
            <span className="block h-full w-[43%] rounded-full bg-accent" />
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-1.5 rounded-xl border border-border p-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        </div>
      ) : (
        <ul className="space-y-2.5">
          {contract.fields.map((f) => {
            const value = edited[f.key] ?? f.value;
            const isEdited = f.key in edited;
            const isConfirmed = confirmed[f.key];
            return (
              <li key={f.key} className="rounded-xl border border-border p-3">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 text-caption text-text-muted">
                    {f.label}
                    <ConfidenceIndicator level={isEdited ? "high" : f.confidence} />
                    <AgentSourceBadge
                      agent={contract.agent}
                      at={fmtDateTime(contract.parsedAt)}
                      source={`${contract.number}, ${f.clause}, стр. ${f.page}`}
                    />
                  </span>
                  <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-caption" onClick={() => goToQuote(f)}>
                    К странице {f.page}
                  </Button>
                </div>

                {editing === f.key ? (
                  <div className="mt-1.5 flex gap-2">
                    <Input value={draft} onChange={(e) => setDraft(e.target.value)} className="h-9" />
                    <Button
                      size="sm"
                      onClick={() => {
                        setEdited((p) => ({ ...p, [f.key]: draft }));
                        setConfirmed((p) => ({ ...p, [f.key]: true }));
                        setEditing(null);
                        toast.success("Поле исправлено вручную (демо)");
                      }}
                    >
                      Сохранить
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Отмена</Button>
                  </div>
                ) : (
                  <p className="mt-1 text-table">{value}</p>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {isConfirmed ? (
                    <StatusBadge tone="ok">{isEdited ? "Исправлено вручную" : "Подтверждено"}</StatusBadge>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5"
                        onClick={() => {
                          setConfirmed((p) => ({ ...p, [f.key]: true }));
                          toast.success(`«${f.label}» подтверждено`);
                        }}
                      >
                        <Check className="size-3.5" /> Подтвердить
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5"
                        onClick={() => {
                          setEditing(f.key);
                          setDraft(value);
                        }}
                      >
                        <Pencil className="size-3.5" /> Исправить
                      </Button>
                    </>
                  )}
                  {f.confidence === "low" && !isConfirmed && (
                    <StatusBadge tone="danger">Требует проверки</StatusBadge>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );

  return (
    <>
      <PageHeader
        title={`Договор ${contract.number}`}
        description={`${projectName(contract.projectId)} · ${contract.customer} · ${fmtMln(contract.sum)} · от ${fmtDate(contract.date)}`}
        meta={
          <>
            <StatusBadge tone={statusTone[contract.status]}>{contractStatusLabels[contract.status]}</StatusBadge>
            <DemoBadge />
            <span className="text-caption text-text-muted">В проде — PDF-парсер с цитатами страниц</span>
            {createdCount > 0 && (
              <StatusBadge tone="accent">Создано задач в этой сессии: {createdCount}</StatusBadge>
            )}
          </>
        }
        actions={
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onBack}>
            <ArrowLeft className="size-4" /> К списку
          </Button>
        }
      />

      {/* Десктоп: две панели */}
      <div className="hidden gap-3 lg:grid lg:grid-cols-2">
        {docPanel}
        {fieldsPanel}
      </div>

      {/* Мобильные: вкладки */}
      <Tabs defaultValue="doc" className="lg:hidden">
        <TabsList className="w-full">
          <TabsTrigger value="doc" className="flex-1">Документ</TabsTrigger>
          <TabsTrigger value="fields" className="flex-1">Данные агента</TabsTrigger>
        </TabsList>
        <TabsContent value="doc" className="mt-3">{docPanel}</TabsContent>
        <TabsContent value="fields" className="mt-3">{fieldsPanel}</TabsContent>
      </Tabs>

      <Dialog open={tasksOpen} onOpenChange={setTasksOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Задачи из контрольных точек</DialogTitle>
            <DialogDescription>
              Агент предлагает задачи по договору {contract.number}. Отметьте нужные — задачи появятся в разделе «Задачи».
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-2">
            {contract.milestones.map((m) => (
              <li key={m.id} className="flex items-start gap-2.5 rounded-xl border border-border p-3">
                <Checkbox
                  id={m.id}
                  checked={picked[m.id] ?? false}
                  onCheckedChange={(v) => setPicked((p) => ({ ...p, [m.id]: Boolean(v) }))}
                  className="mt-0.5"
                />
                <label htmlFor={m.id} className="min-w-0 cursor-pointer">
                  <span className="block text-table">{m.title}</span>
                  <span className="tnum block text-caption text-text-muted">
                    срок {fmtDate(m.date)} · из договора, {m.clause}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTasksOpen(false)}>Отмена</Button>
            <Button
              onClick={() => {
                const chosen = contract.milestones.filter((m) => picked[m.id]);
                chosen.forEach((m) =>
                  createTask({
                    title: m.taskTitle,
                    description: `Контрольная точка договора ${contract.number}, ${m.clause}.`,
                    projectId: contract.projectId,
                    assignee: projects.find((p) => p.id === contract.projectId)?.manager ?? "Соколов И.П.",
                    status: "new",
                    priority: "high",
                    dueDate: m.date,
                  }),
                );
                setCreatedCount((c) => c + chosen.length);
                setTasksOpen(false);
                toast.success(`Создано задач: ${chosen.length} (демо)`, {
                  description: "Задачи доступны в разделе «Задачи».",
                });
              }}
            >
              Создать задачи
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

