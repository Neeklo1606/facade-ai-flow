import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, BellRing, Crown, Gavel, Scale } from "lucide-react";
import {
  loadProject,
  ProjectNotFound,
  withProject,
  type ProjectPageProps,
} from "@/components/project/ProjectNotFound";
import { SubpageHeader } from "@/components/project/SubpageHeader";
import { DecisionDialog, type DecisionInput } from "@/components/procurement/DecisionDialog";
import { MobileActionBar } from "@/components/common/MobileActionBar";
import { ScreenGate, ScreenSkeleton, StateBanner } from "@/components/common/ScreenStates";
import { SourceDrawer, SourceRef } from "@/components/common/SourceRef";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { specActions } from "@/lib/spec-store";
import { useQuery } from "@tanstack/react-query";
import { queries } from "@/api/queries";
import {
  compareOffers,
  itemsSummary,
  rfqStatusMeta,
  type CellCalc,
  type ColumnCalc,
} from "@/lib/procurement";
import { useScreenState } from "@/lib/screen-state";
import { fmtDateTime, fmtDue, fmtMoney, fmtNum } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { type SupplyRequest } from "@/contracts";
import { useDirectory } from "@/api/directory";

export const Route = createFileRoute("/projects/$id/procurement/$rfqId")({
  loader: ({ params, context }) => loadProject(context.queryClient, params.id),
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          {
            title: `Сравнение предложений — ${loaderData.project?.name ?? "Объект"} — neeklo FieldOps`,
          },
        ]
      : [],
  }),
  notFoundComponent: ProjectNotFound,
  component: withProject(ComparisonPage),
});

function ComparisonPage({ project, overview }: ProjectPageProps): React.JSX.Element {
  const { employeeName, counterpartyById } = useDirectory();
  const { rfqId } = Route.useParams();
  const navigate = useNavigate();
  const cardQuery = useQuery(queries.request(rfqId));
  const card = cardQuery.data?.summary.request.projectId === project.id ? cardQuery.data : null;
  const request = card?.summary.request ?? null;
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [source, setSource] = useState<{ id: string; fragment: string } | null>(null);

  const calc = useMemo(
    () =>
      card
        ? compareOffers({ offers: card.offers, offerLines: card.lines }, card.summary.request)
        : null,
    [card],
  );
  const pending = card?.summary.awaiting ?? [];
  const canRemind = card
    ? card.summary.request.sentTo.length - card.summary.answered - card.summary.awaiting.length
    : 0;
  const meta =
    request?.sentAt && request.replyDueAt
      ? { sentAt: request.sentAt, replyDueAt: request.replyDueAt }
      : null;
  const decision = card?.decision ?? null;
  const status = card?.summary.status ?? null;
  const silent = calc ? calc.columns.filter((c) => !c.offerId) : [];

  const screen = useScreenState({
    pending: cardQuery.isPending,
    empty: !!calc && calc.answered === 0 && pending.length === 0,
    processing: pending.length > 0,
    partial: silent.length > 0,
  });

  if (cardQuery.isPending) return <ScreenSkeleton kind="matrix" />;
  if (!request || !calc) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <h1 className="text-section-title">Запрос не найден</h1>
        <p className="mt-2 text-text-secondary">Возможно, он удалён или создан в другом объекте.</p>
        <Button asChild className="mt-6" size="sm">
          <Link to="/projects/$id/procurement" params={{ id: project.id }}>
            К запросам объекта
          </Link>
        </Button>
      </div>
    );
  }

  const blocked =
    screen === "loading" ||
    screen === "error" ||
    screen === "forbidden" ||
    screen === "empty" ||
    calc.answered === 0;
  const due = meta ? fmtDue(meta.replyDueAt) : null;

  function save(input: DecisionInput) {
    if (!request || !calc) return;
    const chosen = calc.columns.find((c) => c.supplierId === input.supplierId)!;
    const supplier = counterpartyById(input.supplierId)?.name ?? "";
    const record = specActions.recordDecision({
      projectId: project.id,
      kind: "supplier",
      requestId: request.id,
      supplierId: input.supplierId,
      title: `${itemsSummary(request.items)} — «${supplier}»`,
      requirement: request.items.map((i) => `${i.name} — ${fmtNum(i.qty)} ${i.unit}`).join("; "),
      problem: `Получено ${calc.answered} ${calc.answered === 1 ? "предложение" : "предложения"} из ${request.sentTo.length}; цены и сроки различаются${calc.columns.some((c) => c.deviations) ? ", есть отклонения от спецификации" : ""}`,
      options: calc.columns
        .filter((c) => c.offerId)
        .map(
          (c) =>
            `«${counterpartyById(c.supplierId)?.name}» — ${fmtMoney(c.total)} с НДС и доставкой, до ${c.maxLeadTime} дн.${c.deviations ? `, отклонений: ${c.deviations}` : ""}`,
        ),
      choice: `«${supplier}», ${fmtMoney(chosen.total)}`,
      reason: input.reason,
      approvedBy: input.approvedBy,
      reportId: null,
      materialFamily: null,
      basisLabel: `Письма поставщиков по запросу ${request.number}`,
      basisSourceId: [...chosen.cells.values()][0]?.sourceId ?? null,
    });
    setDecisionOpen(false);
    toast.success("Решение зафиксировано", {
      description: `«${supplier}» · согласовал ${employeeName(record.approvedBy)}`,
      action: {
        label: "Открыть историю",
        onClick: () => navigate({ to: "/projects/$id/timeline", params: { id: project.id } }),
      },
    });
  }

  return (
    <>
      <SubpageHeader
        project={project}
        title={`Сравнение предложений · ${request.number}`}
        description={itemsSummary(
          request.items,
          (i) => `${i.name} — ${fmtNum(i.qty)} ${i.unit}`,
          3,
        )}
        meta={
          <>
            {status && (
              <StatusBadge tone={rfqStatusMeta[status].tone}>
                {rfqStatusMeta[status].label}
              </StatusBadge>
            )}
            <span className="text-caption text-text-secondary">
              Отправлен {meta ? fmtDateTime(meta.sentAt) : "—"} · ответили{" "}
              <b className="tnum text-text-primary">{calc.answered}</b> из {request.sentTo.length}
              {meta && due && !decision && (
                <>
                  {" "}
                  · ждём до {fmtDateTime(meta.replyDueAt)}{" "}
                  <span className={due.overdue ? "text-danger" : ""}>({due.label})</span>
                </>
              )}
            </span>
          </>
        }
        actions={
          <Button
            variant="accent"
            className="hidden sm:inline-flex"
            disabled={blocked}
            onClick={() => setDecisionOpen(true)}
          >
            <Gavel className="size-4" /> {decision ? "Изменить решение" : "Зафиксировать решение"}
          </Button>
        }
      />

      {decision && screen !== "loading" && (
        <div className="mb-4 flex flex-wrap items-start gap-3 rounded-[var(--r-md)] border border-[color-mix(in_oklab,var(--ok)_30%,transparent)] bg-ok-bg px-4 py-3">
          <Gavel className="mt-0.5 size-4 shrink-0 text-ok" />
          <div className="min-w-0 flex-1 text-[13px]">
            <p className="font-medium text-ok">
              Выбран «{counterpartyById(decision.supplierId ?? "")?.name}»
            </p>
            <p className="mt-0.5 text-text-secondary">{decision.reason}</p>
            <p className="mt-0.5 text-caption text-text-muted">
              Согласовал {employeeName(decision.approvedBy)} · {fmtDateTime(decision.approvedAt)}
            </p>
          </div>
          <Button size="sm" variant="ghost" asChild>
            <Link to="/projects/$id/timeline" params={{ id: project.id }}>
              В истории объекта
            </Link>
          </Button>
        </div>
      )}

      {screen === "partial" && (
        <StateBanner
          tone="warn"
          className="mb-4"
          title={`Нет ответа от ${silent.map((c) => `«${counterpartyById(c.supplierId)?.name}»`).join(", ")}`}
          action={
            <Button
              size="sm"
              variant="secondary"
              disabled={canRemind === 0}
              onClick={() => {
                const sent = specActions.remindSuppliers(request.id);
                toast.success(
                  `Напоминание отправлено ${sent} ${sent === 1 ? "поставщику" : "поставщикам"}`,
                  {
                    description:
                      "Предложение появится в колонке поставщика, как только придёт ответ.",
                  },
                );
              }}
            >
              <BellRing className="size-3.5" /> {canRemind === 0 ? "Ждём ответ" : "Напомнить"}
            </Button>
          }
        >
          Сравнение неполное: лучшее предложение может измениться, когда придёт ответ.
        </StateBanner>
      )}
      {screen === "processing" && (
        <StateBanner
          tone="info"
          className="mb-4"
          title={
            pending.length
              ? `Ждём ответы: ${pending.length} ${pending.length === 1 ? "поставщик" : "поставщика"}`
              : "Распознаём новое письмо поставщика"
          }
        >
          Цены, сроки и доступный объём из писем появятся в колонках поставщиков автоматически.
        </StateBanner>
      )}

      <ScreenGate
        state={screen}
        skeleton={<ScreenSkeleton kind="matrix" />}
        copy={{
          section: "Сравнение предложений",
          roles: "руководителю проекта, снабжению и финансовому контролёру",
          errorTitle: "Не удалось загрузить предложения",
          empty: {
            icon: Scale,
            title: "Предложений пока нет",
            description: `Запрос отправлен ${meta ? fmtDateTime(meta.sentAt) : ""} ${request.sentTo.length} поставщикам. Ответы из писем появятся здесь автоматически — если срок выходит, напомните поставщикам.`,
            actionLabel: "Напомнить поставщикам",
            onAction: () => {
              const sent = specActions.remindSuppliers(request.id);
              toast.success(
                `Напоминание отправлено ${sent} ${sent === 1 ? "поставщику" : "поставщикам"}`,
              );
            },
          },
        }}
      >
        <DesktopMatrix
          request={request}
          columns={calc.columns}
          bestId={calc.best?.supplierId ?? null}
          decidedId={decision?.supplierId ?? null}
          onSource={setSource}
        />
        <MobileMatrix
          request={request}
          columns={calc.columns}
          bestId={calc.best?.supplierId ?? null}
          decidedId={decision?.supplierId ?? null}
          onSource={setSource}
        />
        <p className="mt-3 text-caption text-text-muted">
          Итог колонки — товар, доставка и НДС {calc.columns.find((c) => c.offerId)?.vatPct ?? 20}%.
          Доставка распределена по строкам пропорционально сумме. Регион объекта —{" "}
          {overview?.region}.
        </p>
      </ScreenGate>

      {!blocked && (
        <MobileActionBar>
          <Button variant="accent" onClick={() => setDecisionOpen(true)}>
            <Gavel className="size-4" /> {decision ? "Изменить решение" : "Зафиксировать решение"}
          </Button>
        </MobileActionBar>
      )}

      <DecisionDialog
        open={decisionOpen}
        onOpenChange={setDecisionOpen}
        columns={calc.columns}
        bestSupplierId={calc.best?.supplierId ?? null}
        onSave={save}
      />
      {source && (
        <SourceDrawer
          sourceId={source.id}
          fragment={source.fragment}
          onOpenChange={() => setSource(null)}
        />
      )}
    </>
  );
}

interface MatrixProps {
  request: SupplyRequest;
  columns: ColumnCalc[];
  bestId: string | null;
  decidedId: string | null;
  onSource: (s: { id: string; fragment: string }) => void;
}

function CellLines({
  cell,
  unit,
  onSource,
}: {
  cell: CellCalc;
  unit: string;
  onSource: MatrixProps["onSource"];
}) {
  const rows: [string, string, boolean?][] = [
    ["Цена", `${fmtMoney(cell.price)} / ${unit}`],
    ["Доставка", cell.delivery ? fmtMoney(cell.delivery) : "включена"],
    ["НДС", fmtMoney(cell.vat)],
    ["Срок", `${cell.leadTimeDays} дн.`],
    ["Объём", `${fmtNum(cell.availableQty)} из ${fmtNum(cell.qty)} ${unit}`, cell.shortage],
  ];
  return (
    <div>
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <span className="min-w-0 text-caption text-text-secondary">{cell.name}</span>
        <SourceRef
          sourceId={cell.sourceId}
          onOpen={() => cell.sourceId && onSource({ id: cell.sourceId, fragment: `${cell.price}` })}
          className="-mt-1 -mr-1"
        />
      </div>
      <dl className="grid gap-0.5 text-[13px]">
        {rows.map(([label, value, warn]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <dt className="text-text-muted">{label}</dt>
            <dd
              className={cn(
                "tnum text-right",
                label === "Цена" && "font-semibold text-text-primary",
                warn && "font-medium text-warn",
              )}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {(cell.deviation || cell.shortage) && (
        <p className="mt-2 flex gap-1.5 rounded-[var(--r-xs)] bg-warn-bg px-2 py-1.5 text-caption text-warn">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
          {cell.deviation ?? "Доступный объём меньше требуемого"}
        </p>
      )}
    </div>
  );
}

function DesktopMatrix({ request, columns, bestId, decidedId, onSource }: MatrixProps) {
  const { counterpartyById } = useDirectory();
  return (
    <div className="card-surface hidden overflow-x-auto lg:block">
      <table
        className="w-full border-collapse text-table"
        style={{ minWidth: 260 + columns.length * 260 }}
      >
        <thead>
          <tr className="text-left align-top">
            <th className="sticky left-0 z-10 w-[260px] border-r border-b border-border bg-subtle px-4 py-3 text-[11px] font-medium text-text-muted">
              Материал и требование
            </th>
            {columns.map((c) => {
              const best = c.supplierId === bestId;
              return (
                <th
                  key={c.supplierId}
                  className={cn(
                    "min-w-[240px] border-b border-l border-border px-4 py-3",
                    best ? "bg-ok-bg" : "bg-subtle",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold text-text-primary">
                      {counterpartyById(c.supplierId)?.name}
                    </span>
                    {best && (
                      <span className="inline-flex h-5 items-center gap-1 rounded-full bg-ok px-2 text-[11px] font-medium text-white">
                        <Crown className="size-3" /> Лучшее
                      </span>
                    )}
                    {decidedId === c.supplierId && (
                      <StatusBadge tone="ok" className="h-5">
                        Выбран
                      </StatusBadge>
                    )}
                  </div>
                  <p className="mt-0.5 text-caption font-normal text-text-muted">
                    {c.receivedAt ? `Ответ ${fmtDateTime(c.receivedAt)}` : "Ответа нет"}
                  </p>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {request.items.map((item) => (
            <tr key={item.id} className="align-top">
              <th
                scope="row"
                className="sticky left-0 z-10 border-r border-b border-border bg-surface px-4 py-3 text-left font-normal"
              >
                <p className="text-[13px] font-medium">{item.name}</p>
                <p className="tnum mt-0.5 text-caption text-text-muted">
                  Нужно {fmtNum(item.qty)} {item.unit}
                </p>
              </th>
              {columns.map((c) => {
                const cell = c.cells.get(item.id);
                const warn = cell && (cell.deviation || cell.shortage);
                return (
                  <td
                    key={c.supplierId}
                    className={cn(
                      "border-b border-l border-border px-4 py-3",
                      c.supplierId === bestId &&
                        "bg-[color-mix(in_oklab,var(--ok-bg)_45%,transparent)]",
                      warn && "bg-[color-mix(in_oklab,var(--warn-bg)_70%,transparent)]",
                    )}
                  >
                    {cell ? (
                      <CellLines cell={cell} unit={item.unit} onSource={onSource} />
                    ) : (
                      <p className="text-caption text-text-muted">
                        {c.offerId ? "Позиция не предложена" : "Ждём ответ поставщика"}
                      </p>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="align-top">
            <th
              scope="row"
              className="sticky left-0 z-10 border-r border-border bg-raised px-4 py-3 text-left"
            >
              <p className="text-[13px] font-semibold">Итого с доставкой и НДС</p>
            </th>
            {columns.map((c) => (
              <td
                key={c.supplierId}
                className={cn(
                  "border-l border-border px-4 py-3",
                  c.supplierId === bestId ? "bg-ok-bg" : "bg-raised",
                )}
              >
                {c.offerId ? (
                  <>
                    <p
                      className={cn(
                        "tnum text-[20px] leading-tight font-semibold",
                        c.supplierId === bestId && "text-ok",
                      )}
                    >
                      {fmtMoney(c.total)}
                    </p>
                    <p className="tnum mt-1 text-caption text-text-muted">
                      товар {fmtMoney(c.subtotal - c.deliveryCost)} · доставка{" "}
                      {fmtMoney(c.deliveryCost)} · НДС {fmtMoney(c.vat)}
                    </p>
                    {!c.complete && (
                      <p className="mt-1 text-caption text-warn">Предложены не все позиции</p>
                    )}
                  </>
                ) : (
                  <p className="text-caption text-text-muted">—</p>
                )}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** Телефон: материал — карточкой, предложения поставщиков — друг под другом. */
function MobileMatrix({ request, columns, bestId, decidedId, onSource }: MatrixProps) {
  const { counterpartyById } = useDirectory();
  return (
    <div className="space-y-3 lg:hidden">
      <section className="card-surface divide-y divide-border">
        <h2 className="px-4 py-3 text-[14px] font-semibold">Итог по поставщикам</h2>
        {columns.map((c) => (
          <div
            key={c.supplierId}
            className={cn(
              "flex items-center justify-between gap-3 px-4 py-3",
              c.supplierId === bestId && "bg-ok-bg",
            )}
          >
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-1.5 text-[14px] font-medium">
                {counterpartyById(c.supplierId)?.name}
                {c.supplierId === bestId && <Crown className="size-3.5 text-ok" />}
                {decidedId === c.supplierId && (
                  <StatusBadge tone="ok" className="h-5">
                    Выбран
                  </StatusBadge>
                )}
              </p>
              <p className="text-caption text-text-muted">
                {c.offerId ? `до ${c.maxLeadTime} дн. · отклонений ${c.deviations}` : "Ответа нет"}
              </p>
            </div>
            <p
              className={cn(
                "tnum shrink-0 text-[15px] font-semibold",
                c.supplierId === bestId && "text-ok",
              )}
            >
              {c.offerId ? fmtMoney(c.total) : "—"}
            </p>
          </div>
        ))}
      </section>
      {request.items.map((item) => (
        <section key={item.id} className="card-surface">
          <header className="border-b border-border px-4 py-3">
            <p className="text-[14px] font-semibold">{item.name}</p>
            <p className="tnum text-caption text-text-muted">
              Нужно {fmtNum(item.qty)} {item.unit}
            </p>
          </header>
          <ul className="divide-y divide-border">
            {columns.map((c) => {
              const cell = c.cells.get(item.id);
              return (
                <li
                  key={c.supplierId}
                  className={cn(
                    "px-4 py-3",
                    c.supplierId === bestId &&
                      "bg-[color-mix(in_oklab,var(--ok-bg)_45%,transparent)]",
                  )}
                >
                  <p className="mb-1 text-[13px] font-medium">
                    {counterpartyById(c.supplierId)?.name}
                  </p>
                  {cell ? (
                    <CellLines cell={cell} unit={item.unit} onSource={onSource} />
                  ) : (
                    <p className="text-caption text-text-muted">Ждём ответ</p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
