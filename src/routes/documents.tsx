import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, FileText, Upload } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel } from "@/components/common/Panel";
import { FilterBar, FilterChip } from "@/components/common/FilterBar";
import { DataTable, type Column } from "@/components/common/DataTable";
import { EntityDrawer } from "@/components/common/EntityDrawer";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge, type Tone } from "@/components/common/StatusBadge";
import { ConfidenceIndicator } from "@/components/common/ConfidenceIndicator";
import { SourceRef, SourceDrawer } from "@/components/common/SourceRef";
import { Button } from "@/components/ui/button";
import { documents, employeeById, specItems } from "@/mock/repository";
import type { DocumentRecord, SpecItem } from "@/mock/repository";
import { projectName, useProjectId } from "@/lib/project-scope";
import { fmtDate, fmtDateTime, fmtNum } from "@/lib/format";

export const Route = createFileRoute("/documents")({
  head: () => ({
    meta: [
      { title: "Документация объекта — neeklo FieldOps" },
      {
        name: "description",
        content: "Проектная документация, договоры и акты: из каждой страницы извлекается спецификация, которую подтверждает человек.",
      },
      { property: "og:title", content: "Документация объекта — neeklo FieldOps" },
      { property: "og:description", content: "Документация и извлечённая из неё спецификация материалов." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DocumentsPage,
});

const kindLabels: Record<string, string> = {
  contract: "Договор",
  annex: "Дополнительное соглашение",
  design: "Проектная документация",
  act_ks2: "Акт КС-2",
  act_ks3: "Справка КС-3",
  certificate: "Паспорт, сертификат",
  checklist: "Чек-лист",
  letter: "Письмо",
};

const statusMeta: Record<string, { label: string; tone: Tone }> = {
  processing: { label: "Обрабатывается", tone: "info" },
  review: { label: "Требует проверки", tone: "warn" },
  confirmed: { label: "Проверено", tone: "ok" },
  rejected: { label: "Отклонено", tone: "danger" },
};

function meta(status: string) {
  return statusMeta[status] ?? { label: status, tone: "neutral" as Tone };
}

const filters: { id: string; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "design", label: "Проектная документация" },
  { id: "contract", label: "Договоры" },
  { id: "act_ks2", label: "Акты" },
  { id: "letter", label: "Письма" },
];

function DocumentsPage() {
  const projectId = useProjectId();
  const [filter, setFilter] = useState("all");
  const [openDoc, setOpenDoc] = useState<DocumentRecord | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [fragment, setFragment] = useState<string | null>(null);
  const [approved, setApproved] = useState<string[]>([]);

  const scoped = useMemo(
    () => documents.filter((item) => (projectId ? item.projectId === projectId : true)),
    [projectId],
  );
  const rows = useMemo(
    () =>
      scoped
        .filter((item) => (filter === "all" ? true : item.kind === filter))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [scoped, filter],
  );

  const columns: Column<DocumentRecord>[] = [
    {
      key: "name",
      header: "Документ",
      primary: true,
      cell: (row) => (
        <span className="flex items-center gap-2">
          <FileText className="size-4 shrink-0 text-text-muted" strokeWidth={1.5} />
          <span className="min-w-0 truncate">{row.name}</span>
        </span>
      ),
    },
    { key: "kind", header: "Тип", cell: (row) => kindLabels[row.kind] ?? row.kind },
    { key: "project", header: "Объект", cell: (row) => projectName(row.projectId) },
    { key: "pages", header: "Страниц", className: "tnum", cell: (row) => fmtNum(row.pages) },
    {
      key: "spec",
      header: "Позиций спецификации",
      className: "tnum",
      cell: (row) => {
        const count = specItems.filter((item) => item.documentId === row.id).length;
        return count ? fmtNum(count) : "—";
      },
    },
    { key: "created", header: "Загружен", cell: (row) => fmtDate(row.createdAt) },
    {
      key: "status",
      header: "Состояние",
      cell: (row) => <StatusBadge tone={meta(row.status).tone}>{meta(row.status).label}</StatusBadge>,
    },
    {
      key: "source",
      header: "Источник",
      hideOnCard: true,
      cell: (row) => (
        <SourceRef
          sourceId={row.sourceId}
          onOpen={() => {
            setSourceId(row.sourceId);
            setFragment(null);
          }}
        />
      ),
    },
  ];

  const docSpec: SpecItem[] = openDoc ? specItems.filter((item) => item.documentId === openDoc.id) : [];

  return (
    <>
      <PageHeader
        title="Документация объекта"
        description="Загруженная документация и извлечённая из неё спецификация. Каждая позиция помнит страницу и человека, который её подтвердил."
        actions={
          <Button size="sm">
            <Upload className="size-4" /> Загрузить документацию
          </Button>
        }
      />

      <Panel bodyClassName="p-0">
        <FilterBar right={<span className="text-caption text-text-muted">Записей: {rows.length}</span>}>
          {filters.map((item) => (
            <FilterChip
              key={item.id}
              active={filter === item.id}
              onClick={() => setFilter(item.id)}
              count={item.id === "all" ? scoped.length : scoped.filter((d) => d.kind === item.id).length}
            >
              {item.label}
            </FilterChip>
          ))}
        </FilterBar>
        <DataTable
          columns={columns}
          rows={rows}
          onRowClick={(row) => setOpenDoc(row)}
          empty={
            <EmptyState
              icon={FileText}
              title="По выбранному условию документов нет"
              description="Смените тип документа или выберите другой объект в шапке."
            />
          }
        />
      </Panel>

      {openDoc && (
        <EntityDrawer
          open
          onOpenChange={(v) => !v && setOpenDoc(null)}
          title={openDoc.name}
          subtitle={`${projectName(openDoc.projectId)} · версия ${openDoc.version} · ${openDoc.pages} стр.`}
          badges={
            <>
              <StatusBadge tone={meta(openDoc.status).tone}>{meta(openDoc.status).label}</StatusBadge>
              <StatusBadge tone="neutral">{kindLabels[openDoc.kind] ?? openDoc.kind}</StatusBadge>
            </>
          }
        >
          <div className="space-y-5">
            <dl className="grid grid-cols-2 gap-3 text-[13px]">
              <div>
                <dt className="text-[12px] text-text-muted">Загрузил</dt>
                <dd>{employeeById(openDoc.authorId)?.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-text-muted">Дата загрузки</dt>
                <dd>{fmtDate(openDoc.createdAt)}</dd>
              </div>
            </dl>

            {docSpec.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="Спецификация ещё не извлечена"
                description="Из этого документа система не выделяла позиции материалов."
              />
            ) : (
              <section>
                <p className="text-[12px] text-text-muted">Извлечённая спецификация</p>
                <ul className="mt-2 divide-y divide-border rounded-[var(--r-md)] border border-border">
                  {docSpec.map((item) => {
                    const isApproved = Boolean(item.approvedBy) || approved.includes(item.id);
                    return (
                      <li key={item.id} className="px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[12px] text-text-muted">
                              поз. {item.position} · {item.section} · стр. {item.page}
                            </p>
                            <p className="text-[14px] font-medium">{item.name}</p>
                            <p className="tnum text-[13px] text-text-secondary">
                              {fmtNum(item.qty)} {item.unit}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1.5">
                            <ConfidenceIndicator value={item.confidence} />
                            <SourceRef
                              sourceId={item.sourceId}
                              approvedBy={item.approvedBy}
                              approvedAt={item.approvedAt}
                              onOpen={() => {
                                setSourceId(item.sourceId);
                                setFragment(item.name);
                              }}
                            />
                          </div>
                        </div>
                        {item.note && <p className="mt-1.5 text-[12px] text-text-secondary">{item.note}</p>}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {isApproved ? (
                            <span className="inline-flex items-center gap-1.5 text-[12px] text-ok">
                              <Check className="size-3.5" />
                              Подтвердил {employeeById(item.approvedBy ?? "")?.name ?? "вы"}
                              {item.approvedAt ? `, ${fmtDateTime(item.approvedAt)}` : ", только что"}
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => setApproved((prev) => [...prev, item.id])}
                            >
                              Подтвердить позицию
                            </Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </div>
        </EntityDrawer>
      )}

      {sourceId && <SourceDrawer sourceId={sourceId} fragment={fragment} onOpenChange={() => setSourceId(null)} />}
    </>
  );
}
