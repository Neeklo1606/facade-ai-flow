/**
 * «Документы» ПТО (ADR-058, стартовый экран): показатели, «Сформировать пакет» по объекту,
 * периоду или захватке и список актов с комплектностью. Строка открывает редактор акта.
 */
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ACT_SHORT,
  DOC_STATUS_LABEL,
  useDocList,
  useDocsActions,
  useDocsActor,
  useDocsBase,
  usePackage,
  workDates,
  type DocView,
} from "@/api/gas-docs";
import {
  Button,
  Card,
  DataView,
  EmptyState,
  FormField,
  MetricCard,
  MetricRow,
  SelectSheet,
  StatusChip,
  type DataColumn,
} from "@/components/ui/mono";
import { toast } from "@/lib/toast";
import { DOC_TONE, DocsGate, ObjectPick, useObjectPick } from "./common";

export function DocsScreen() {
  return (
    <DocsGate screen="docs">
      <Docs />
    </DocsGate>
  );
}

function Docs() {
  const base = useDocsBase();
  const who = useDocsActor();
  const [objectId, setObjectId] = useObjectPick();
  const { views, metrics } = useDocList(objectId);
  const navigate = useNavigate();

  if (!objectId) {
    return (
      <EmptyState
        title="Объектов с работами нет"
        text="Акты собираются из записей объёмов: они появятся, когда прораб внесёт работы."
      />
    );
  }

  const columns: DataColumn<DocView>[] = [
    {
      key: "title",
      header: "Документ",
      width: "120px",
      cell: (v) => <span className="font-medium tnum">{v.title}</span>,
    },
    {
      key: "work",
      header: "Работы",
      cell: (v) => (
        <span className="line-clamp-2">
          {v.kind?.name ?? "Вид работ не найден"}
          {v.work?.zone ? `, ${v.work.zone}` : ""}
        </span>
      ),
    },
    { key: "ver", header: "Версия", width: "90px", cell: (v) => `v${v.doc.version}` },
    {
      key: "complete",
      header: "Комплект",
      width: "150px",
      cell: (v) =>
        v.completeness.complete ? (
          <StatusChip tone="up">Полный</StatusChip>
        ) : (
          <StatusChip tone="caution">Не хватает: {v.completeness.issues.length}</StatusChip>
        ),
    },
    {
      key: "status",
      header: "Статус",
      width: "180px",
      cell: (v) => (
        <StatusChip tone={DOC_TONE[v.doc.status]}>{DOC_STATUS_LABEL[v.doc.status]}</StatusChip>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-section">
      <MetricRow label="Документы">
        <MetricCard label="Черновиков к проверке" value={metrics.review} inverse />
        <MetricCard label="Не хватает данных" value={metrics.incomplete} />
        <MetricCard label="На подписи" value={metrics.signing} />
        <MetricCard label="Подписано за неделю" value={metrics.signedWeek} />
      </MetricRow>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-end">
        <ObjectPick value={objectId} onChange={setObjectId} />
        <p className="type-small text-ink-3">
          {base.objectLabel(objectId)}. Данные объекта демонстрационные: проект, участники и объёмы
          помечены «Демо».
        </p>
      </div>
      {who.canEdit ? <PackageCard key={objectId} objectId={objectId} /> : null}
      {views.length === 0 ? (
        <EmptyState
          title="Актов по объекту пока нет"
          text="Нажмите «Сформировать пакет»: система предложит акты по работам объекта."
        />
      ) : (
        <DataView
          label="Акты объекта"
          rows={views}
          rowId={(v) => v.doc.id}
          columns={columns}
          title={(v) => `${v.title} · ${v.kind?.name ?? ""}`}
          meta={(v) =>
            `v${v.doc.version} · ${v.completeness.complete ? "комплект полный" : `не хватает: ${v.completeness.issues.length}`}`
          }
          aside={(v) => (
            <StatusChip tone={DOC_TONE[v.doc.status]}>{DOC_STATUS_LABEL[v.doc.status]}</StatusChip>
          )}
          onOpen={(id) => {
            if (id) void navigate({ to: "/gas/docs/$docId", params: { docId: id } });
          }}
          empty={<EmptyState title="Ничего не найдено" text="Смените объект." />}
        />
      )}
    </div>
  );
}

const ALL_ZONES = "all";

function PackageCard({ objectId }: { objectId: string }) {
  const actions = useDocsActions();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [zone, setZone] = useState(ALL_ZONES);
  const filter = useMemo(
    () => ({
      objectId,
      from: from || null,
      to: to || null,
      zone: zone === ALL_ZONES ? null : zone,
    }),
    [objectId, from, to, zone],
  );
  const { proposals, zones } = usePackage(filter);
  const fresh = proposals.filter((p) => !p.existing);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const chosen = picked ?? new Set(fresh.map((p) => p.work.id));
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    const workIds = fresh.filter((p) => chosen.has(p.work.id)).map((p) => p.work.id);
    const result = await actions.createDocs({ objectId, workIds });
    if (!result.ok) return setError(result.message);
    setError(null);
    setPicked(null);
    toast.success(`Черновиков создано: ${result.value.length}`);
  };

  return (
    <Card title="Сформировать пакет">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-3 lg:items-end">
          <FormField label="Период с">
            {(props) => (
              <input
                {...props}
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="mono-input focus-ring"
              />
            )}
          </FormField>
          <FormField label="по">
            {(props) => (
              <input
                {...props}
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="mono-input focus-ring"
              />
            )}
          </FormField>
          <SelectSheet
            label="Захватка"
            value={zone}
            onChange={setZone}
            options={[
              { value: ALL_ZONES, label: "Все захватки" },
              ...zones.map((z) => ({ value: z, label: z })),
            ]}
          />
        </div>
        {proposals.length === 0 ? (
          <p className="type-text text-ink-2">За период работ нет. Смените даты или захватку.</p>
        ) : (
          <ul aria-label="Предложенные акты" className="flex flex-col divide-y divide-line">
            {proposals.map((p) => (
              <li key={p.work.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <label className="flex min-h-11 items-start gap-3">
                  <input
                    type="checkbox"
                    className="focus-ring mt-0.5 size-5 shrink-0 accent-current"
                    disabled={!!p.existing}
                    checked={p.existing ? true : chosen.has(p.work.id)}
                    onChange={(e) => {
                      const next = new Set(chosen);
                      if (e.target.checked) next.add(p.work.id);
                      else next.delete(p.work.id);
                      setPicked(next);
                    }}
                  />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="type-text font-medium">
                      {ACT_SHORT[p.act]}: {p.kind?.name ?? "вид работ не найден"}
                      {p.work.zone ? `, ${p.work.zone}` : ""}
                    </span>
                    <span className="type-small text-ink-3">
                      {p.work.number} · {workDates(p.work)} ·{" "}
                      {p.existing
                        ? "акт уже создан"
                        : p.completeness.complete
                          ? "комплект полный"
                          : `не хватает: ${p.completeness.issues.map((i) => i.text.split(":")[0]!.toLowerCase()).join(", ")}`}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={fresh.filter((p) => chosen.has(p.work.id)).length === 0}
            onClick={create}
          >
            Создать черновики актов
          </Button>
          <span className="type-small text-ink-3">
            Акт заполняется из записей объёма, поставок, проекта и участников.
          </span>
        </div>
        {error ? (
          <p role="alert" className="type-label text-down">
            {error}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
