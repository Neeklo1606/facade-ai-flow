import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Bot, Columns3, ListChecks, Plus, Rows3, User } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel } from "@/components/common/Panel";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge, type StatusTone } from "@/components/common/StatusBadge";
import { AgentSourceBadge } from "@/components/common/AgentSourceBadge";
import { ConfidenceIndicator } from "@/components/common/ConfidenceIndicator";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useAuth } from "@/lib/auth-context";
import { projects } from "@/mock/projects";
import { users } from "@/mock/users";
import {
  isOverdue,
  taskPriorityLabels,
  taskStatusLabels,
  taskStatusOrder,
  type Task,
  type TaskStatus,
} from "@/mock/tasks";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/tasks")({
  validateSearch: (search: Record<string, unknown>) => ({
    project: typeof search["project"] === "string" ? (search["project"] as string) : undefined,
    new: search["new"] === true || search["new"] === "true" ? true : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Задачи — ФАСАД-РП" },
      { name: "description", content: "Задачи по объектам: сроки, ответственные, источник — человек или агент." },
      { property: "og:title", content: "Задачи — ФАСАД-РП" },
      { property: "og:description", content: "Задачи по объектам: сроки, ответственные, источник — человек или агент." },
    ],
  }),
  component: TasksPage,
});

const priorityTone: Record<string, StatusTone> = {
  low: "neutral",
  normal: "neutral",
  high: "warn",
  critical: "danger",
};

const statusTone = (t: Task): StatusTone =>
  isOverdue(t) ? "danger" : t.status === "done" ? "ok" : t.status === "review" ? "info" : "neutral";

const statusLabel = (t: Task) => (isOverdue(t) ? "Просрочена" : taskStatusLabels[t.status]);

const projectName = (id: string) => projects.find((p) => p.id === id)?.shortName ?? id;

function TasksPage() {
  const search = Route.useSearch();
  const { tasks, createTask } = useData();
  const { account } = useAuth();
  const isForeman = account?.role === "foreman";

  const [view, setView] = useState<"table" | "kanban">("table");
  const [project, setProject] = useState(search.project ?? "all");
  const [assignee, setAssignee] = useState("all");
  const [status, setStatus] = useState("all");
  const [due, setDue] = useState("all");
  const [source, setSource] = useState("all");
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [createOpen, setCreateOpen] = useState(Boolean(search.new));

  useEffect(() => {
    if (search.project) setProject(search.project);
  }, [search.project]);

  const rows = useMemo(
    () =>
      tasks.filter((t) => {
        if (isForeman && t.assignee !== account?.user.name) return false;
        if (project !== "all" && t.projectId !== project) return false;
        if (assignee !== "all" && t.assignee !== assignee) return false;
        if (status === "overdue" ? !isOverdue(t) : status !== "all" && t.status !== status) return false;
        if (source !== "all" && t.source !== source) return false;
        if (due === "week" && new Date(t.dueDate) > new Date("2026-08-19")) return false;
        if (due === "overdue" && !isOverdue(t)) return false;
        return true;
      }),
    [tasks, project, assignee, status, source, due, isForeman, account],
  );

  const columns: Column<Task>[] = [
    {
      key: "title",
      header: "Задача",
      cell: (t) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium">{t.title}</span>
          <span className="tnum block text-caption text-text-muted">{t.id}</span>
        </span>
      ),
    },
    { key: "project", header: "Объект", cell: (t) => <span className="whitespace-nowrap">{projectName(t.projectId)}</span> },
    { key: "assignee", header: "Ответственный", cell: (t) => <span className="whitespace-nowrap">{t.assignee}</span> },
    {
      key: "due",
      header: "Срок",
      cell: (t) => (
        <span className={cn("tnum whitespace-nowrap", isOverdue(t) && "font-medium text-danger")}>{fmtDate(t.dueDate)}</span>
      ),
    },
    { key: "status", header: "Статус", cell: (t) => <StatusBadge tone={statusTone(t)}>{statusLabel(t)}</StatusBadge> },
    {
      key: "priority",
      header: "Приоритет",
      cell: (t) => <StatusBadge tone={priorityTone[t.priority]!}>{taskPriorityLabels[t.priority]}</StatusBadge>,
    },
    { key: "source", header: "Источник", cell: (t) => <SourceCell task={t} /> },
  ];

  return (
    <>
      <PageHeader
        title="Задачи"
        description={
          isForeman ? "Ваши задачи по объектам. Данные синтетические." : "Все задачи по объектам. Данные синтетические."
        }
        actions={
          <>
            <div className="hidden items-center rounded-xl border border-border p-0.5 lg:flex">
              <Button variant={view === "table" ? "secondary" : "ghost"} size="sm" className="gap-1.5" onClick={() => setView("table")}>
                <Rows3 className="size-4" /> Таблица
              </Button>
              <Button variant={view === "kanban" ? "secondary" : "ghost"} size="sm" className="gap-1.5" onClick={() => setView("kanban")}>
                <Columns3 className="size-4" /> Канбан
              </Button>
            </div>
            <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> Новая задача
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={project} onValueChange={setProject}>
          <SelectTrigger className="h-9 w-52"><SelectValue placeholder="Объект" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все объекты</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.shortName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!isForeman && (
          <Select value={assignee} onValueChange={setAssignee}>
            <SelectTrigger className="h-9 w-48"><SelectValue placeholder="Ответственный" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все ответственные</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Статус" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            {taskStatusOrder.map((s) => (
              <SelectItem key={s} value={s}>{taskStatusLabels[s]}</SelectItem>
            ))}
            <SelectItem value="overdue">Просрочена</SelectItem>
          </SelectContent>
        </Select>
        <Select value={due} onValueChange={setDue}>
          <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Срок" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Любой срок</SelectItem>
            <SelectItem value="week">До конца недели</SelectItem>
            <SelectItem value="overdue">Просроченные</SelectItem>
          </SelectContent>
        </Select>
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Источник" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Любой источник</SelectItem>
            <SelectItem value="manual">Человек</SelectItem>
            <SelectItem value="agent">Агент</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {rows.length === 0 ? (
        <Panel bodyClassName="p-0">
          <EmptyState icon={ListChecks} title="Задач нет" description="Под выбранные фильтры ничего не подходит." />
        </Panel>
      ) : (
        <>
          {/* Мобильные: вертикальный список карточек */}
          <div className="grid gap-3 lg:hidden">
            {rows.map((t) => (
              <TaskCard key={t.id} task={t} onOpen={() => setOpenTask(t)} />
            ))}
          </div>

          <div className="hidden lg:block">
            {view === "table" ? (
              <Panel bodyClassName="p-0">
                <DataTable columns={columns} rows={rows} rowKey={(t) => t.id} onRowClick={setOpenTask} />
              </Panel>
            ) : (
              <div className="grid grid-cols-5 gap-3">
                {(["new", "in_progress", "review", "done", "overdue"] as const).map((col) => {
                  const colRows =
                    col === "overdue"
                      ? rows.filter((t) => isOverdue(t))
                      : rows.filter((t) => t.status === col && !isOverdue(t));
                  return (
                    <div key={col} className="min-w-0 rounded-xl bg-subtle p-2">
                      <div className="mb-2 flex items-center justify-between px-1">
                        <span className="text-caption font-medium">
                          {col === "overdue" ? "Просрочено" : taskStatusLabels[col as TaskStatus]}
                        </span>
                        <span className="tnum text-caption text-text-muted">{colRows.length}</span>
                      </div>
                      <div className="grid gap-2">
                        {colRows.map((t) => (
                          <TaskCard key={t.id} task={t} onOpen={() => setOpenTask(t)} compact />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      <TaskDialog task={openTask} onClose={() => setOpenTask(null)} />

      <CreateTaskDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultProject={project === "all" ? projects[0]!.id : project}
        onCreate={(draft) => {
          const t = createTask(draft);
          toast.success(`Задача ${t.id} создана (демо)`, { description: "Данные синтетические." });
        }}
      />
    </>
  );
}

function SourceCell({ task }: { task: Task }) {
  if (task.source === "manual")
    return (
      <span className="inline-flex items-center gap-1.5 text-caption text-text-secondary">
        <User className="size-3.5" /> Человек
      </span>
    );
  return (
    <span className="inline-flex min-w-0 max-w-[240px] items-center gap-1.5">
      <AgentSourceBadge
        agent={task.agentName ?? "Агент"}
        at={fmtDateTime(task.createdAt)}
        source={task.contractClause ?? "анализ данных объекта"}
      />
      <span className="min-w-0 text-caption">
        <span className="block truncate">{task.agentName}</span>
        {task.contractClause && (
          <span className="block truncate text-text-muted">из договора, {task.contractClause.replace("договора", "").trim()}</span>
        )}
      </span>
      {task.agentConfidence && <ConfidenceIndicator level={task.agentConfidence} />}
    </span>
  );
}

function TaskCard({ task, onOpen, compact }: { task: Task; onOpen: () => void; compact?: boolean }) {
  return (
    <button
      onClick={onOpen}
      className="card-surface min-h-11 w-full p-3 text-left transition-fast hover:bg-subtle"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <span className="min-w-0 text-table font-medium">{task.title}</span>
        {!compact && <StatusBadge tone={statusTone(task)}>{statusLabel(task)}</StatusBadge>}
      </div>
      <div className="tnum mt-1.5 text-caption text-text-muted">
        {task.id} · {projectName(task.projectId)} · до {fmtDate(task.dueDate)}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {compact && <StatusBadge tone={statusTone(task)}>{statusLabel(task)}</StatusBadge>}
        <StatusBadge tone={priorityTone[task.priority]!}>{taskPriorityLabels[task.priority]}</StatusBadge>
        {task.source === "agent" && (
          <span className="inline-flex items-center gap-1 text-caption text-accent">
            <Bot className="size-3.5" /> {task.agentName}
          </span>
        )}
      </div>
    </button>
  );
}

function TaskDialog({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const { tasks, setTaskStatus, toggleChecklist, addComment } = useData();
  const { account } = useAuth();
  const [comment, setComment] = useState("");
  const live = task ? tasks.find((t) => t.id === task.id) ?? task : null;

  return (
    <Dialog open={Boolean(live)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {live && (
          <>
            <DialogHeader>
              <DialogTitle className="pr-6">{live.title}</DialogTitle>
              <DialogDescription className="tnum">
                {live.id} · {projectName(live.projectId)} · до {fmtDate(live.dueDate)}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={statusTone(live)}>{statusLabel(live)}</StatusBadge>
                <StatusBadge tone={priorityTone[live.priority]!}>{taskPriorityLabels[live.priority]}</StatusBadge>
                <SourceCell task={live} />
              </div>

              {live.description && <p className="text-table text-text-secondary">{live.description}</p>}

              {live.checklist && (
                <div>
                  <div className="mb-2 text-overline text-text-muted">Чек-лист</div>
                  <ul className="space-y-2">
                    {live.checklist.map((c) => (
                      <li key={c.id} className="flex min-h-6 items-center gap-2">
                        <Checkbox checked={c.done} onCheckedChange={() => toggleChecklist(live.id, c.id)} id={c.id} />
                        <label htmlFor={c.id} className={cn("text-table", c.done && "text-text-muted line-through")}>
                          {c.text}
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <div className="mb-2 text-overline text-text-muted">Комментарии</div>
                <ul className="space-y-2">
                  {(live.comments ?? []).map((c) => (
                    <li key={c.id} className="rounded-xl bg-subtle p-2.5">
                      <div className="text-caption text-text-muted">
                        {c.author}
                        {c.isAgent ? " · агент" : ""} · {fmtDateTime(c.at)}
                      </div>
                      <div className="text-table">{c.text}</div>
                    </li>
                  ))}
                  {(live.comments ?? []).length === 0 && (
                    <li className="text-caption text-text-muted">Комментариев пока нет.</li>
                  )}
                </ul>
                <div className="mt-2 flex gap-2">
                  <Input
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Написать комментарий"
                    className="h-9"
                  />
                  <Button
                    size="sm"
                    disabled={!comment.trim()}
                    onClick={() => {
                      addComment(live.id, comment.trim(), account?.user.name ?? "Пользователь");
                      setComment("");
                    }}
                  >
                    Добавить
                  </Button>
                </div>
              </div>

              <div>
                <div className="mb-2 text-overline text-text-muted">Статус</div>
                <div className="flex flex-wrap gap-2">
                  {taskStatusOrder.map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={live.status === s ? "default" : "outline"}
                      onClick={() => {
                        setTaskStatus(live.id, s);
                        toast.success(`Статус: ${taskStatusLabels[s]} (демо)`);
                      }}
                    >
                      {taskStatusLabels[s]}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreateTaskDialog({
  open,
  onOpenChange,
  defaultProject,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultProject: string;
  onCreate: (draft: Omit<Task, "id" | "createdAt" | "source">) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState(defaultProject);
  const [assignee, setAssignee] = useState(users[0]!.name);
  const [dueDate, setDueDate] = useState("2026-08-20");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Новая задача</DialogTitle>
          <DialogDescription>Демо-прототип: задача останется только в этой сессии.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название задачи" />
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Описание" />
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger><SelectValue placeholder="Объект" /></SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.shortName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={assignee} onValueChange={setAssignee}>
            <SelectTrigger><SelectValue placeholder="Ответственный" /></SelectTrigger>
            <SelectContent>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="tnum" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button
            disabled={!title.trim()}
            onClick={() => {
              onCreate({
                title: title.trim(),
                description,
                projectId,
                assignee,
                status: "new",
                priority: "normal",
                dueDate,
              });
              setTitle("");
              setDescription("");
              onOpenChange(false);
            }}
          >
            Создать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
