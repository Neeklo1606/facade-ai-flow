import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FileText, Loader2, Upload, X } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel } from "@/components/common/Panel";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge, type StatusTone } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { projects } from "@/mock/projects";
import {
  docProcessingLabels,
  documents as seedDocuments,
  type Doc,
  type DocProcessing,
  type DocumentType,
} from "@/mock/documents";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/documents")({
  head: () => ({
    meta: [
      { title: "Документы — ФАСАД-РП" },
      { name: "description", content: "Реестр документов объектов: договоры, акты, КС-2, замерные карты и обработка агентом." },
      { property: "og:title", content: "Документы — ФАСАД-РП" },
      { property: "og:description", content: "Реестр документов объектов: договоры, акты, КС-2, замерные карты и обработка агентом." },
    ],
  }),
  component: DocumentsPage,
});

const tone: Record<DocProcessing, StatusTone> = {
  uploaded: "neutral",
  recognizing: "info",
  extracting: "info",
  ready: "ok",
  error: "danger",
};

const docTypes: DocumentType[] = [
  "Договор",
  "Допсоглашение",
  "Проектная документация",
  "Замерная карта",
  "Акт",
  "КС-2",
  "КС-3",
  "Сертификат",
  "Письмо",
];

const steps: DocProcessing[] = ["uploaded", "recognizing", "extracting", "ready"];
const fmtSize = (kb: number) => (kb >= 1024 ? `${(kb / 1024).toFixed(1)} МБ` : `${kb} КБ`);
const projectName = (id: string) => projects.find((p) => p.id === id)?.shortName ?? id;

interface Upload {
  id: string;
  name: string;
  step: number;
}

function DocumentsPage() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<Doc[]>(seedDocuments);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const [type, setType] = useState("all");
  const [project, setProject] = useState("all");
  const [status, setStatus] = useState("all");
  const inputRef = useRef<HTMLInputElement>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const startUpload = useCallback((name: string) => {
    const id = `U-${Math.floor(Math.random() * 9000 + 1000)}`;
    setUploads((p) => [{ id, name, step: 0 }, ...p]);
    [1, 2, 3].forEach((s) => {
      const t = window.setTimeout(
        () => setUploads((p) => p.map((u) => (u.id === id ? { ...u, step: s } : u))),
        s * 1200,
      );
      timers.current.push(t);
    });
    const done = window.setTimeout(() => {
      setUploads((p) => p.filter((u) => u.id !== id));
      setDocs((p) => [
        {
          id,
          name,
          type: name.toLowerCase().includes("догов") ? "Договор" : "Акт",
          projectId: projects[0].id,
          uploadedBy: "Соколов И.П.",
          uploadedAt: new Date().toISOString(),
          processing: "ready",
          sizeKb: 820,
          pages: 4,
        },
        ...p,
      ]);
      toast.success("Документ обработан агентом (демо)", { description: name });
    }, 4 * 1200);
    timers.current.push(done);
  }, []);

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) {
      startUpload(`Скан документа ${new Date().toLocaleTimeString("ru-RU").slice(0, 5)}.pdf`);
      return;
    }
    Array.from(files).forEach((f) => startUpload(f.name));
  };

  const rows = docs.filter(
    (d) =>
      (type === "all" || d.type === type) &&
      (project === "all" || d.projectId === project) &&
      (status === "all" || d.processing === status),
  );

  const openDoc = (d: Doc) => {
    if (d.type === "Договор" || d.type === "Допсоглашение") {
      navigate({ to: "/contracts" });
    } else {
      navigate({ to: "/objects/$id", params: { id: d.projectId } });
    }
  };

  const columns: Column<Doc>[] = [
    {
      key: "name",
      header: "Название",
      cell: (d) => (
        <span className="flex min-w-0 items-center gap-2">
          <FileText className="size-4 shrink-0 text-text-muted" strokeWidth={1.5} />
          <span className="min-w-0 truncate font-medium">{d.name}</span>
        </span>
      ),
    },
    { key: "type", header: "Тип", cell: (d) => <span className="whitespace-nowrap">{d.type}</span> },
    { key: "project", header: "Объект", cell: (d) => projectName(d.projectId) },
    { key: "by", header: "Загрузил", cell: (d) => <span className="whitespace-nowrap">{d.uploadedBy}</span> },
    { key: "at", header: "Дата", cell: (d) => <span className="tnum whitespace-nowrap">{fmtDateTime(d.uploadedAt)}</span> },
    {
      key: "status",
      header: "Обработка агентом",
      cell: (d) => (
        <StatusBadge tone={tone[d.processing]}>
          {d.processing === "recognizing" || d.processing === "extracting" ? (
            <Loader2 className="size-3 animate-spin" />
          ) : null}
          {docProcessingLabels[d.processing]}
        </StatusBadge>
      ),
    },
    { key: "size", header: "Размер", align: "right", cell: (d) => <span className="tnum whitespace-nowrap">{fmtSize(d.sizeKb)}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Документы"
        description="Единый реестр по всем объектам. Обработка агентом — демо-имитация на синтетических данных."
        meta={<span className="text-caption text-text-muted">В проде — распознавание PDF и сканов с извлечением полей</span>}
        actions={
          <Button size="sm" className="gap-1.5" onClick={() => inputRef.current?.click()}>
            <Upload className="size-4" /> Загрузить
          </Button>
        }
      />

      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "mb-4 flex min-h-[88px] w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed px-4 py-5 text-center transition-fast",
          dragging ? "border-accent bg-accent-subtle" : "border-border hover:border-accent",
        )}
      >
        <Upload className="size-5 text-text-muted" strokeWidth={1.5} />
        <span className="text-table font-medium">Перетащите файлы сюда</span>
        <span className="text-caption text-text-muted">
          PDF, XLSX, JPG до 50 МБ · агент распознает и извлечет данные
        </span>
      </div>

      {uploads.length > 0 && (
        <div className="mb-4 grid gap-3 lg:grid-cols-2">
          {uploads.map((u) => (
            <Panel key={u.id} bodyClassName="p-4">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                <span className="min-w-0 truncate text-table font-medium">{u.name}</span>
                <button
                  type="button"
                  aria-label="Отменить загрузку"
                  className="shrink-0 text-text-muted hover:text-text-primary"
                  onClick={() => setUploads((p) => p.filter((x) => x.id !== u.id))}
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-1.5">
                {steps.map((s, i) => (
                  <span
                    key={s}
                    className={cn(
                      "h-1.5 rounded-full",
                      i <= u.step ? "bg-accent" : "bg-subtle",
                    )}
                  />
                ))}
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-caption text-text-secondary">
                <Loader2 className="size-3.5 animate-spin text-accent" />
                Шаг {u.step + 1} из 4 · {docProcessingLabels[steps[u.step]]}
              </div>
            </Panel>
          ))}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="h-9 w-52"><SelectValue placeholder="Тип" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все типы</SelectItem>
            {docTypes.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
            {steps.concat("error").map((s) => (
              <SelectItem key={s} value={s}>{docProcessingLabels[s as DocProcessing]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Panel bodyClassName="p-0">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(d) => d.id}
          onRowClick={openDoc}
          empty={
            <EmptyState
              icon={FileText}
              title="Документов нет"
              description="Загрузите договор, акт или замерную карту — агент разберет документ и заполнит поля."
              actionLabel="Загрузить документ"
              onAction={() => inputRef.current?.click()}
            />
          }
        />
      </Panel>
    </>
  );
}
