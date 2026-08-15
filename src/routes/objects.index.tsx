import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Building2, LayoutGrid, Plus, Rows3, Search } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel } from "@/components/common/Panel";
import { DataTable, type Column } from "@/components/common/DataTable";
import { EmptyState } from "@/components/common/EmptyState";
import { ProgressBar } from "@/components/common/ProgressBar";
import {
  StatusBadge,
  projectStatusLabel,
  projectStatusTone,
} from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import type { Project } from "@/mock/projects";
import { fmtDate, fmtMln } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/objects/")({
  head: () => ({
    meta: [
      { title: "Объекты — ФАСАД-РП" },
      { name: "description", content: "Реестр фасадных объектов: сроки, готовность, бюджет, статус." },
      { property: "og:title", content: "Объекты — ФАСАД-РП" },
      { property: "og:description", content: "Реестр фасадных объектов: сроки, готовность, бюджет, статус." },
    ],
  }),
  component: ObjectsPage,
});

function ObjectsPage() {
  const { projectsView } = useData();
  const navigate = useNavigate();
  const [status, setStatus] = useState("all");
  const [manager, setManager] = useState("all");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"table" | "cards">("table");
  const [addOpen, setAddOpen] = useState(false);

  const managers = useMemo(
    () => Array.from(new Set(projectsView.map((p) => p.manager))),
    [projectsView],
  );

  const rows = projectsView.filter((p) => {
    if (status !== "all" && p.status !== status) return false;
    if (manager !== "all" && p.manager !== manager) return false;
    const q = query.trim().toLowerCase();
    if (q && ![p.name, p.customer, p.contractNo, p.address].some((v) => v.toLowerCase().includes(q)))
      return false;
    return true;
  });

  const open = (p: Project) => navigate({ to: "/objects/$id", params: { id: p.id } });

  const columns: Column<Project>[] = [
    {
      key: "name",
      header: "Объект",
      cell: (p) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium">{p.name}</span>
          <span className="block truncate text-caption text-text-muted">{p.address}</span>
        </span>
      ),
    },
    { key: "customer", header: "Заказчик", cell: (p) => p.customer },
    {
      key: "contract",
      header: "Договор",
      cell: (p) => (
        <span className="block">
          <span className="block tnum">{p.contractNo}</span>
          <span className="block text-caption text-text-muted">от {fmtDate(p.contractDate)}</span>
        </span>
      ),
    },
    { key: "deadline", header: "Срок", cell: (p) => <span className="tnum">{fmtDate(p.deadline)}</span> },
    {
      key: "progress",
      header: "Готовность",
      width: "160px",
      cell: (p) => <ProgressBar value={p.progress} tone={p.status} showValue />,
    },
    { key: "manager", header: "РП", cell: (p) => p.manager },
    {
      key: "status",
      header: "Статус",
      cell: (p) => (
        <StatusBadge tone={projectStatusTone[p.status]} dot>
          {projectStatusLabel[p.status]}
        </StatusBadge>
      ),
    },
    {
      key: "budget",
      header: "Бюджет",
      align: "right",
      cell: (p) => (
        <span className="block">
          <span className="block tnum">{fmtMln(p.contractSum)}</span>
          <span className="block text-caption text-text-muted">факт {fmtMln(p.budgetFact)}</span>
        </span>
      ),
    },
  ];

  const empty = (
    <EmptyState
      icon={Building2}
      title="Объектов пока нет"
      description="Добавьте первый объект — договор, сроки и захватки подтянутся в график работ."
      actionLabel="Добавить объект"
      onAction={() => setAddOpen(true)}
    />
  );

  return (
    <>
      <PageHeader
        title="Объекты"
        description="Реестр фасадных объектов компании. Данные синтетические."
        actions={
          <>
            <div className="hidden items-center rounded-md border border-border p-0.5 lg:flex">
              <Button
                variant={view === "table" ? "secondary" : "ghost"}
                size="sm"
                className="gap-1.5"
                onClick={() => setView("table")}
              >
                <Rows3 className="size-4" /> Таблица
              </Button>
              <Button
                variant={view === "cards" ? "secondary" : "ghost"}
                size="sm"
                className="gap-1.5"
                onClick={() => setView("cards")}
              >
                <LayoutGrid className="size-4" /> Карточки
              </Button>
            </div>
            <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
              <Plus className="size-4" /> Добавить объект
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по объекту, заказчику, договору"
            className="h-9 pl-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Статус" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="ok">В графике</SelectItem>
            <SelectItem value="warn">Риск срыва</SelectItem>
            <SelectItem value="danger">Отставание</SelectItem>
            <SelectItem value="done">Завершен</SelectItem>
          </SelectContent>
        </Select>
        <Select value={manager} onValueChange={setManager}>
          <SelectTrigger className="h-9 w-52"><SelectValue placeholder="РП" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все РП</SelectItem>
            {managers.map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Мобильные: всегда карточки */}
      <div className={cn("grid gap-3 lg:hidden", rows.length === 0 && "hidden")}>
        {rows.map((p) => (
          <ObjectCard key={p.id} project={p} onOpen={() => open(p)} />
        ))}
      </div>

      {rows.length === 0 ? (
        <Panel bodyClassName="p-0">{empty}</Panel>
      ) : view === "cards" ? (
        <div className="hidden gap-3 lg:grid lg:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => (
            <ObjectCard key={p.id} project={p} onOpen={() => open(p)} />
          ))}
        </div>
      ) : (
        <Panel bodyClassName="p-0" className="hidden lg:flex">
          <DataTable columns={columns} rows={rows} rowKey={(p) => p.id} onRowClick={open} />
        </Panel>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Добавить объект</DialogTitle>
            <DialogDescription>
              Демо-модалка прототипа: объект не создается, данные синтетические.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Название объекта" />
            <Input placeholder="Заказчик" />
            <Input placeholder="№ договора" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Отмена</Button>
            <Button
              onClick={() => {
                setAddOpen(false);
                toast.success("Объект создан (демо)", { description: "Данные синтетические, ничего не сохранено." });
              }}
            >
              Создать (демо)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ObjectCard({ project: p, onOpen }: { project: Project; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="card-surface flex min-h-[44px] flex-col gap-3 p-4 text-left transition-fast hover:bg-subtle"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium">{p.name}</div>
          <div className="truncate text-caption text-text-muted">{p.customer}</div>
        </div>
        <StatusBadge tone={projectStatusTone[p.status]} dot>
          {projectStatusLabel[p.status]}
        </StatusBadge>
      </div>
      <ProgressBar value={p.progress} tone={p.status} showValue />
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-caption">
        <div className="flex justify-between gap-2">
          <dt className="text-text-muted">Срок</dt>
          <dd className="tnum">{fmtDate(p.deadline)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-text-muted">Бюджет</dt>
          <dd className="tnum">{fmtMln(p.contractSum)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-text-muted">РП</dt>
          <dd className="truncate">{p.manager}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-text-muted">Договор</dt>
          <dd className="tnum truncate">{p.contractNo}</dd>
        </div>
      </dl>
    </button>
  );
}
