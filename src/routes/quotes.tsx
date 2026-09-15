import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ClipboardList, Check, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel } from "@/components/common/Panel";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ConfidenceIndicator } from "@/components/common/ConfidenceIndicator";
import { SourceRef, SourceDrawer } from "@/components/common/SourceRef";
import { Button } from "@/components/ui/button";
import { counterpartyById, offersFor, supplyRequests } from "@/mock/repository";
import { projectName, useProjectId } from "@/lib/project-scope";
import { fmtDate, fmtDateTime, fmtMoney, fmtNum } from "@/lib/format";
import { useApp } from "@/lib/app-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/quotes")({
  validateSearch: (search: Record<string, unknown>) => ({
    request: typeof search['request'] === "string" ? (search['request'] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Предложения поставщиков — neeklo FieldOps" },
      {
        name: "description",
        content: "Сравнение ответов поставщиков по позициям: лучшая цена, срок поставки и письмо, откуда взята каждая цифра.",
      },
      { property: "og:title", content: "Предложения поставщиков — neeklo FieldOps" },
      { property: "og:description", content: "Сравнение ответов с указанием происхождения каждой цены." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: QuotesPage,
});

interface Decision {
  supplierId: string;
  at: string;
  by: string;
}

function QuotesPage() {
  const projectId = useProjectId();
  const search = Route.useSearch();
  const { user } = useApp();
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [fragment, setFragment] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [choice, setChoice] = useState<string | null>(null);

  const withOffers = useMemo(
    () =>
      supplyRequests
        .filter((item) => (projectId ? item.projectId === projectId : true))
        .filter((item) => offersFor(item.id).length > 0),
    [projectId],
  );

  const [activeId, setActiveId] = useState<string | null>(search.request ?? withOffers[0]?.id ?? null);
  const request = withOffers.find((item) => item.id === activeId) ?? withOffers[0] ?? null;
  const offers = request ? offersFor(request.id) : [];
  const decision = request ? decisions[request.id] : undefined;

  if (!request) {
    return (
      <>
        <PageHeader
          title="Предложения поставщиков"
          description="Ответы собираются по каждому запросу, цены сравниваются по позициям."
        />
        <Panel bodyClassName="p-0">
          <EmptyState
            icon={ClipboardList}
            title="Предложений пока нет"
            description="Ни по одному запросу выбранного объекта ответы ещё не получены."
          />
        </Panel>
      </>
    );
  }

  const bestByMaterial = new Map<string, number>();
  for (const item of request.items) {
    const prices = offers
      .map((offer) => offer.prices.find((price) => price.materialId === item.materialId)?.price)
      .filter((value): value is number => typeof value === "number");
    if (prices.length) bestByMaterial.set(item.materialId, Math.min(...prices));
  }
  const bestTotal = Math.min(...offers.map((offer) => offer.total));
  const bestLead = Math.min(...offers.map((offer) => offer.leadTimeDays));

  return (
    <>
      <PageHeader
        title="Предложения поставщиков"
        description="Каждая цена раскрывается до письма поставщика. Решение фиксирует человек, оно сохраняется вместе с автором и временем."
        meta={
          <>
            <StatusBadge tone="neutral">{projectName(request.projectId)}</StatusBadge>
            <StatusBadge tone="info">Запрос {request.number}</StatusBadge>
            <StatusBadge tone="warn">Ответов: {offers.length} из {request.sentTo.length}</StatusBadge>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <Panel title="Запросы с ответами" bodyClassName="p-0" className="order-2 xl:order-1">
          <ul className="divide-y divide-border">
            {withOffers.map((item) => {
              const list = offersFor(item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveId(item.id);
                      setChoice(null);
                    }}
                    className={cn(
                      "flex w-full items-start gap-2 px-4 py-3 text-left transition-fast hover:bg-hover",
                      item.id === request.id && "bg-accent-subtle",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium">{item.number}</p>
                      <p className="truncate text-[12px] text-text-muted">{projectName(item.projectId)}</p>
                      <p className="mt-1 text-[12px] text-text-secondary">
                        {list.length} предложений · от {fmtMoney(Math.min(...list.map((o) => o.total)))}
                      </p>
                      {decisions[item.id] && (
                        <p className="mt-1 text-[12px] text-ok">
                          Решение: {counterpartyById(decisions[item.id]!.supplierId)?.name}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="mt-1 size-4 shrink-0 text-text-muted" />
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>

        <div className="order-1 min-w-0 space-y-4 xl:order-2">
          <Panel
            title={`Сравнение по запросу ${request.number}`}
            bodyClassName="p-0"
            action={<span className="text-caption text-text-muted">Создан {fmtDate(request.createdAt)}</span>}
            footer={
              decision ? (
                <p className="flex items-center gap-2 text-[13px] text-ok">
                  <Check className="size-4" />
                  Выбран {counterpartyById(decision.supplierId)?.name}. Решение зафиксировал {decision.by},{" "}
                  {fmtDateTime(decision.at)}.
                </p>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-[13px] text-text-secondary">
                    {choice
                      ? `Выбран ${counterpartyById(choice)?.name}`
                      : "Отметьте поставщика в шапке столбца, чтобы зафиксировать решение"}
                  </span>
                  <Button
                    size="sm"
                    disabled={!choice}
                    onClick={() =>
                      choice &&
                      setDecisions((prev) => ({
                        ...prev,
                        [request.id]: { supplierId: choice, at: new Date().toISOString(), by: user.name },
                      }))
                    }
                  >
                    Зафиксировать решение
                  </Button>
                </div>
              )
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-table">
                <thead>
                  <tr className="h-10 bg-subtle text-left">
                    <th className="px-4 text-overline text-text-muted">Позиция</th>
                    <th className="px-4 text-overline text-text-muted">Количество</th>
                    {offers.map((offer) => {
                      const supplier = counterpartyById(offer.supplierId);
                      const selected = decision ? decision.supplierId === offer.supplierId : choice === offer.supplierId;
                      return (
                        <th key={offer.id} className="px-4 py-2 text-overline text-text-muted">
                          <button
                            type="button"
                            onClick={() => !decision && setChoice(offer.supplierId)}
                            className={cn(
                              "focus-ring flex min-h-11 w-full flex-col items-start gap-0.5 rounded-[var(--r-xs)] px-2 py-1 text-left transition-fast",
                              selected ? "bg-accent-subtle" : "hover:bg-hover",
                            )}
                          >
                            <span className="text-[13px] font-medium text-text-primary">{supplier?.name}</span>
                            <span className="text-[12px] font-normal text-text-muted">
                              ответ {fmtDateTime(offer.receivedAt)}
                            </span>
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {request.items.map((item) => (
                    <tr key={item.materialId} className="h-12 border-b border-border">
                      <td className="px-4 py-2 font-medium">{item.name}</td>
                      <td className="tnum px-4 py-2 text-text-secondary">
                        {fmtNum(item.qty)} {item.unit}
                      </td>
                      {offers.map((offer) => {
                        const price = offer.prices.find((p) => p.materialId === item.materialId)?.price;
                        const best = price != null && price === bestByMaterial.get(item.materialId);
                        return (
                          <td key={offer.id} className="px-4 py-2">
                            {price == null ? (
                              <span className="text-text-muted">нет позиции</span>
                            ) : (
                              <span className="flex items-center gap-2">
                                <span className={cn("tnum text-[13px]", best && "font-semibold text-ok")}>
                                  {fmtMoney(price)}
                                </span>
                                <SourceRef
                                  sourceId={offer.sourceId}
                                  onOpen={() => {
                                    setSourceId(offer.sourceId);
                                    setFragment(item.name);
                                  }}
                                />
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="h-12 border-b border-border bg-subtle">
                    <td className="px-4 py-2 font-medium">Итого</td>
                    <td className="px-4 py-2" />
                    {offers.map((offer) => (
                      <td key={offer.id} className="px-4 py-2">
                        <span className={cn("tnum text-[13px]", offer.total === bestTotal && "font-semibold text-ok")}>
                          {fmtMoney(offer.total)}
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr className="h-12 border-b border-border">
                    <td className="px-4 py-2 font-medium">Срок поставки</td>
                    <td className="px-4 py-2" />
                    {offers.map((offer) => (
                      <td key={offer.id} className="px-4 py-2">
                        <span
                          className={cn(
                            "tnum text-[13px]",
                            offer.leadTimeDays === bestLead && "font-semibold text-ok",
                          )}
                        >
                          {offer.leadTimeDays} дн.
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr className="h-12">
                    <td className="px-4 py-2 font-medium">Как распознано письмо</td>
                    <td className="px-4 py-2" />
                    {offers.map((offer) => (
                      <td key={offer.id} className="px-4 py-2">
                        <ConfidenceIndicator value={offer.confidence} />
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Кто не ответил" bodyClassName="p-0">
            <ul className="divide-y divide-border">
              {request.sentTo
                .filter((id) => !offers.some((offer) => offer.supplierId === id))
                .map((id) => (
                  <li key={id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <span className="text-[13px]">{counterpartyById(id)?.name ?? id}</span>
                    <StatusBadge tone="warn">Ответа нет</StatusBadge>
                  </li>
                ))}
              {request.sentTo.every((id) => offers.some((offer) => offer.supplierId === id)) && (
                <li className="px-5 py-3 text-[13px] text-text-secondary">Ответили все поставщики запроса.</li>
              )}
            </ul>
          </Panel>
        </div>
      </div>

      {sourceId && <SourceDrawer sourceId={sourceId} fragment={fragment} onOpenChange={() => setSourceId(null)} />}
    </>
  );
}
