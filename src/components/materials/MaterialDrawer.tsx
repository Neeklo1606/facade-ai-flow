import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeftRight, Bot, FileText, UserRound } from "lucide-react";
import { EntityDrawer } from "@/components/common/EntityDrawer";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ConfidenceIndicator } from "@/components/common/ConfidenceIndicator";
import { Button } from "@/components/ui/button";
import {
  counterpartyName,
  employeeById,
  purchaseOrder,
  purchaseStatusLabel,
  replacementSuggestions,
  type ExtractedPosition,
} from "@/mock/repository";
import { offersOf, useSpecStore } from "@/lib/spec-store";
import { purchaseTone, reviewLabel } from "@/lib/project-meta";
import { fmtDateTime, fmtMoney, fmtNum } from "@/lib/format";
import { cn } from "@/lib/utils";

const requestStatus: Record<string, string> = {
  draft: "Черновик",
  sent: "Отправлен",
  collecting: "Ждём ответы",
  compared: "Есть сравнение",
  ordered: "Заказано",
};

const replacementStatus = {
  proposed: { label: "Предложена", tone: "info" as const },
  agreed: { label: "Согласована", tone: "ok" as const },
  rejected: { label: "Отклонена", tone: "neutral" as const },
};

function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border-t border-border pt-4 first:border-0 first:pt-0", className)}>
      <h3 className="text-[12px] font-semibold text-text-muted">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

export function MaterialDrawer({
  item,
  documentTitle,
  onOpenChange,
}: {
  item: ExtractedPosition;
  documentTitle: string;
  onOpenChange: (open: boolean) => void;
}) {
  const changes = useSpecStore((s) => s.changes);
  const store = useSpecStore((s) => s);
  const requests = store.requests;
  const history = changes
    .filter((change) => change.positionId === item.id)
    .sort((a, b) => b.at.localeCompare(a.at));
  const related = requests.filter((request) => item.requestIds.includes(request.id));
  const replacements = replacementSuggestions.filter((r) => r.family === item.family);
  const review = reviewLabel(item);
  const stage = purchaseOrder.indexOf(item.purchase);

  return (
    <EntityDrawer
      open
      onOpenChange={onOpenChange}
      title={item.normalizedName ?? item.projectName}
      subtitle={`Поз. ${item.position} · ${item.group} · лист ${item.sheetNumber}`}
      badges={
        <>
          {review ? (
            <StatusBadge tone={review.tone}>{review.label}</StatusBadge>
          ) : (
            <ConfidenceIndicator value={item.confidence} />
          )}
          <StatusBadge tone={purchaseTone[item.purchase]}>
            {purchaseStatusLabel[item.purchase]}
          </StatusBadge>
        </>
      }
      footer={
        <Button size="sm" variant="secondary" asChild>
          <Link
            to="/projects/$id/documents/$docId"
            params={{ id: item.projectId, docId: item.documentId }}
            search={{ position: item.id }}
          >
            <FileText className="size-4" /> Показать в PDF
          </Link>
        </Button>
      }
    >
      <div className="space-y-4">
        <Section title="Наименование">
          <dl className="space-y-2.5">
            <div>
              <dt className="text-[11px] text-text-muted">Нормализованное</dt>
              <dd className="mt-0.5 text-[14px] font-medium">
                {item.normalizedName ?? (
                  <span className="inline-flex items-center gap-1.5 text-warn">
                    <AlertTriangle className="size-3.5" /> Не сопоставлено со справочником
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-text-muted">Проектное, как в документе</dt>
              <dd className="mt-0.5 text-[13px] text-text-secondary">{item.projectName}</dd>
            </div>
          </dl>
        </Section>

        <Section title="Характеристики">
          {item.characteristics.length ? (
            <dl className="divide-y divide-border rounded-[var(--r-md)] border border-border">
              {item.characteristics.map((c) => (
                <div key={c.label} className="grid grid-cols-[40%_1fr] gap-3 px-3 py-2 text-[13px]">
                  <dt className="text-text-muted">{c.label}</dt>
                  <dd>{c.value}</dd>
                </div>
              ))}
              <div className="grid grid-cols-[40%_1fr] gap-3 px-3 py-2 text-[13px]">
                <dt className="text-text-muted">Количество</dt>
                <dd className="tnum font-medium">
                  {fmtNum(item.qty)} {item.unit}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="rounded-[var(--r-md)] bg-warn-bg px-3 py-2 text-[13px] text-warn">
              В документе характеристики не указаны. Уточните марку, толщину и покрытие до запроса
              поставщикам. Количество:{" "}
              <span className="tnum font-medium">
                {fmtNum(item.qty)} {item.unit}
              </span>
            </p>
          )}
        </Section>

        <Section title="Источник">
          <div className="flex items-start justify-between gap-3 rounded-[var(--r-md)] border border-border px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-[13px] font-medium">
                Лист {item.sheetNumber}, поз. {item.position}
              </p>
              <p className="mt-0.5 truncate text-caption text-text-muted">{documentTitle}</p>
            </div>
            <Button size="sm" variant="ghost" className="h-8 shrink-0" asChild>
              <Link
                to="/projects/$id/documents/$docId"
                params={{ id: item.projectId, docId: item.documentId }}
                search={{ position: item.id }}
              >
                Показать в PDF
              </Link>
            </Button>
          </div>
        </Section>

        <Section title="Закупка">
          <ol className="grid grid-cols-6 gap-1">
            {purchaseOrder.map((status, index) => (
              <li key={status} className="min-w-0" title={purchaseStatusLabel[status]}>
                <div
                  className={cn(
                    "h-1.5 rounded-full",
                    index <= stage && stage > 0
                      ? "bg-accent"
                      : index === 0 && stage === 0
                        ? "bg-border-strong"
                        : "bg-subtle",
                  )}
                />
                <p
                  className={cn(
                    "mt-1 truncate text-[10px]",
                    index === stage ? "font-semibold text-text-primary" : "text-text-muted",
                  )}
                >
                  {purchaseStatusLabel[status]}
                </p>
              </li>
            ))}
          </ol>
        </Section>

        <Section title="Запросы и предложения">
          {related.length === 0 ? (
            <p className="text-[13px] text-text-muted">
              Позиция ещё не входила в запросы поставщикам.
            </p>
          ) : (
            <ul className="space-y-2">
              {related.map((request) => {
                const offers = offersOf(store, request.id);
                return (
                  <li key={request.id} className="rounded-[var(--r-md)] border border-border">
                    <div className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="text-[13px] font-medium">{request.number}</span>
                      <span className="text-caption text-text-muted">
                        {requestStatus[request.status]} ·{" "}
                        {request.sentTo.map(counterpartyName).join(", ")}
                      </span>
                    </div>
                    {offers.length > 0 ? (
                      <ul className="divide-y divide-border border-t border-border">
                        {offers.map((offer) => (
                          <li
                            key={offer.id}
                            className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]"
                          >
                            <span className="min-w-0 truncate">
                              {counterpartyName(offer.supplierId)}
                              {offer.best && (
                                <StatusBadge tone="ok" className="ml-2 h-5">
                                  Лучшее
                                </StatusBadge>
                              )}
                            </span>
                            <span className="tnum shrink-0 text-text-secondary">
                              {fmtMoney(offer.total)} · {offer.leadTimeDays} дн.
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="border-t border-border px-3 py-2 text-caption text-text-muted">
                        Предложений пока нет
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section title="Предложенные замены">
          {replacements.length === 0 ? (
            <p className="text-[13px] text-text-muted">Замен не предлагалось.</p>
          ) : (
            <ul className="space-y-2">
              {replacements.map((r) => (
                <li
                  key={r.id}
                  className="flex gap-3 rounded-[var(--r-md)] border border-border px-3 py-2.5"
                >
                  <ArrowLeftRight className="mt-0.5 size-4 shrink-0 text-text-muted" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] font-medium">{r.name}</p>
                      <StatusBadge tone={replacementStatus[r.status].tone}>
                        {replacementStatus[r.status].label}
                      </StatusBadge>
                    </div>
                    <p className="mt-0.5 text-caption text-text-secondary">{r.reason}</p>
                    <p
                      className={cn(
                        "tnum mt-0.5 text-caption",
                        r.priceDeltaPct > 0 ? "text-danger" : "text-ok",
                      )}
                    >
                      Цена {r.priceDeltaPct > 0 ? "+" : "−"}
                      {Math.abs(r.priceDeltaPct)}%
                      {r.agreedBy && (
                        <span className="text-text-muted"> · {employeeById(r.agreedBy)?.name}</span>
                      )}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="История изменений">
          {history.length === 0 ? (
            <p className="text-[13px] text-text-muted">
              Изменений не было: значение взято из документа как есть.
            </p>
          ) : (
            <ol className="space-y-2.5">
              {history.map((change) => {
                const person = employeeById(change.actorId);
                return (
                  <li key={change.id} className="flex gap-2.5">
                    <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-subtle text-text-muted">
                      {person ? <UserRound className="size-3.5" /> : <Bot className="size-3.5" />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px]">
                        {change.action}
                        {change.before && change.after && (
                          <>
                            : <span className="text-text-muted line-through">{change.before}</span>{" "}
                            → <span className="font-medium">{change.after}</span>
                          </>
                        )}
                      </p>
                      <p className="text-caption text-text-muted">
                        {person?.name ?? "Автоматическое извлечение"} · {fmtDateTime(change.at)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Section>
      </div>
    </EntityDrawer>
  );
}
