import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, X } from "lucide-react";
import {
  deliveryStatusLabel,
  remarkKindLabel,
  type DeliveryCard,
  type DeliveryRemark,
  type DeliveryStatus,
} from "@/contracts";
import { useDirectory } from "@/api/directory";
import { useDeliveryLinks } from "@/api/links";
import { RelatedList } from "@/components/common/RelatedList";
import { useResolveRemark } from "@/api/mutations";
import { toast } from "@/lib/toast";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { fmtDate, fmtDateTime, fmtMoney, fmtNum } from "@/lib/format";

/**
 * Карточка поставки (ADR-011): что везут и сколько принято, движение статусов с авторами,
 * акт приёмки с чек-листом, замечания снабжению, фото, связи с запросом и решением.
 */
export function DeliveryDetails({
  card,
  projectId,
  canWrite,
}: {
  card: DeliveryCard;
  projectId: string;
  /** Закрывать замечания может снабжение и руководитель — право записи в «Закупках» (ADR-012) */
  canWrite: boolean;
}) {
  const { employeeById, counterpartyById } = useDirectory();
  const links = useDeliveryLinks(card, projectId);
  const { delivery, acceptance } = card;
  const who = (id: string | null) => (id ? (employeeById(id)?.name ?? "—") : "Обработка");

  return (
    <div className="grid gap-5 text-[13px]">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
        <dt className="text-text-3">Поставщик</dt>
        <dd>{counterpartyById(delivery.supplierId)?.name ?? "—"}</dd>
        <dt className="text-text-3">Запрос</dt>
        <dd>
          <Link
            to="/projects/$id/procurement/$rfqId"
            params={{ id: projectId, rfqId: delivery.requestId }}
            className="focus-ring inline-flex min-h-11 items-center rounded-[var(--r-xs)] underline-offset-2 hover:underline lg:min-h-0"
          >
            {card.requestNumber}
            {delivery.decisionId ? " · решение по сравнению" : ""}
          </Link>
        </dd>
        <dt className="text-text-3">{delivery.receivedAt ? "Принята" : "Ожидается"}</dt>
        <dd className="tnum">{fmtDate(delivery.receivedAt ?? delivery.expectedAt)}</dd>
        {!delivery.sourceId && (
          <>
            <dt className="text-text-3">Основание</dt>
            <dd className="text-text-2">без подтверждения поставщика</dd>
          </>
        )}
      </dl>

      <section aria-labelledby="dl-lines">
        <h3 id="dl-lines" className="mb-2 text-[13px] font-medium text-text">
          Состав
        </h3>
        <ul className="divide-y divide-line rounded-[var(--r-md)] border border-line">
          {delivery.items.map((line) => (
            <li key={line.id} className="grid gap-0.5 px-3 py-2">
              <span className="text-text">{line.name}</span>
              <span className="tnum text-text-2">
                заявлено {fmtNum(line.qty)} {line.unit}
                {line.acceptedQty !== null && ` · принято ${fmtNum(line.acceptedQty)} ${line.unit}`}
                {line.price !== null && ` · ${fmtMoney(line.price)} за ${line.unit}`}
              </span>
              {line.remark && <span className="text-text-3">{line.remark}</span>}
            </li>
          ))}
        </ul>
      </section>

      {/* Куда ведёт эта поставка дальше (ADR-018): запрос и материалы её состава */}
      {links.length > 0 && (
        <section aria-labelledby="dl-links">
          <h3 id="dl-links" className="mb-2 text-[13px] font-medium text-text">
            Связано
          </h3>
          <RelatedList links={links} />
        </section>
      )}

      <section aria-labelledby="dl-moves">
        <h3 id="dl-moves" className="mb-2 text-[13px] font-medium text-text">
          Движение
        </h3>
        <ol className="grid gap-2">
          {card.statusChanges.map((change) => (
            <li key={change.id} className="grid grid-cols-[auto_1fr] gap-x-3">
              <span className="tnum text-text-3">{fmtDateTime(change.at)}</span>
              <span>
                <span className="text-text">{deliveryStatusLabel[change.status]}</span>
                <span className="text-text-2"> · {who(change.actorId)}</span>
                {change.note && <span className="block text-text-3">{change.note}</span>}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {acceptance && (
        <section aria-labelledby="dl-act">
          <h3 id="dl-act" className="mb-2 text-[13px] font-medium text-text">
            Акт приёмки
          </h3>
          <p className="text-text-2">
            {deliveryStatusLabel[acceptance.result]} · подтвердил {who(acceptance.acceptedBy)},{" "}
            {fmtDateTime(acceptance.acceptedAt)}
          </p>
          {acceptance.reason && <p className="mt-1 text-text">Причина: {acceptance.reason}</p>}
          <ul className="mt-2 grid gap-1">
            {acceptance.checklist.map((item) => (
              <li key={item.id} className="flex items-start gap-2">
                {item.ok ? (
                  <Check
                    className="mt-0.5 size-4 shrink-0 text-ok"
                    strokeWidth={2}
                    aria-label="пройдено"
                  />
                ) : (
                  <X
                    className="mt-0.5 size-4 shrink-0 text-danger"
                    strokeWidth={2}
                    aria-label="не пройдено"
                  />
                )}
                <span>
                  {item.label}
                  {item.note && <span className="block text-text-3">{item.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {card.remarks.length > 0 && (
        <section aria-labelledby="dl-remarks">
          <h3 id="dl-remarks" className="mb-2 text-[13px] font-medium text-text">
            Замечания снабжению
          </h3>
          <ul className="grid gap-2">
            {card.remarks.map((remark) => (
              <RemarkItem key={remark.id} remark={remark} who={who} canWrite={canWrite} />
            ))}
          </ul>
        </section>
      )}

      {card.photos.length > 0 && (
        <section aria-labelledby="dl-photos">
          <h3 id="dl-photos" className="mb-2 text-[13px] font-medium text-text">
            Фото при приёмке
          </h3>
          <ul className="grid grid-cols-3 gap-2">
            {card.photos.map((photo, index) => (
              <li key={photo.id}>
                <img
                  src={photo.dataUrl}
                  alt={photo.caption ?? `Фото приёмки ${index + 1}`}
                  className="aspect-square w-full rounded-[var(--r-sm)] border border-line object-cover"
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * Действия по поставке до приёмки: отмеченное движение пишется с автором. Отменить поставку
 * до прибытия можно только с причиной — она уходит снабжению как замечание.
 */
export function DeliveryMoves({
  status,
  pending,
  canManage,
  onMove,
  onAccept,
}: {
  status: DeliveryStatus;
  pending: boolean;
  /** Отгрузка, «в пути» и отмена — у снабжения; прораб отмечает прибытие и принимает */
  canManage: boolean;
  onMove: (status: "shipped" | "in_transit" | "arrived" | "rejected", note: string | null) => void;
  onAccept: () => void;
}) {
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");

  if (status === "arrived")
    return (
      <Button variant="accent" className="w-full" onClick={onAccept} data-tour="accept-delivery">
        Принять поставку
      </Button>
    );
  if (status !== "expected" && status !== "shipped" && status !== "in_transit") return null;

  if (cancelling)
    return (
      <form
        className="grid w-full gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (reason.trim()) onMove("rejected", reason.trim());
        }}
      >
        <label className="grid gap-1 text-[13px]">
          <span className="text-text-2">Почему поставку отменяют</span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            maxLength={500}
            className="focus-ring rounded-[var(--r-sm)] border border-line bg-surface-2 px-3 py-2 text-text"
          />
        </label>
        <div className="flex gap-2">
          <Button type="submit" variant="destructive" disabled={!reason.trim() || pending}>
            Отменить поставку
          </Button>
          <Button type="button" variant="ghost" onClick={() => setCancelling(false)}>
            Назад
          </Button>
        </div>
      </form>
    );

  return (
    <div className="grid w-full gap-2">
      <Button
        variant="accent"
        disabled={pending}
        onClick={() => onMove("arrived", null)}
        data-tour="delivery-arrived"
      >
        Поставка прибыла на объект
      </Button>
      <div className="flex flex-wrap gap-2">
        {canManage && status === "expected" && (
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => onMove("shipped", null)}
          >
            Отгружена
          </Button>
        )}
        {canManage && status !== "in_transit" && (
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => onMove("in_transit", null)}
          >
            В пути
          </Button>
        )}
        {canManage && (
          <Button variant="ghost" size="sm" onClick={() => setCancelling(true)}>
            Отменить…
          </Button>
        )}
      </div>
    </div>
  );
}

/** Замечание снабжению: открытое закрывают с пояснением, чем решено — иначе оно висит в очереди */
function RemarkItem({
  remark,
  who,
  canWrite,
}: {
  remark: DeliveryRemark;
  who: (id: string | null) => string;
  canWrite: boolean;
}) {
  const resolve = useResolveRemark();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  return (
    <li className="rounded-[var(--r-md)] border border-line px-3 py-2">
      <span className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={remark.status === "open" ? "warn" : "neutral"}>
          {remarkKindLabel[remark.kind]}
        </StatusBadge>
        <span className="text-text-3">
          {remark.status === "open"
            ? "открыто, в очереди «Требует решения»"
            : `закрыто · ${who(remark.resolvedBy)}`}
        </span>
      </span>
      <span className="mt-1 block text-text">{remark.text}</span>
      {remark.resolution && (
        <span className="mt-1 block text-text-2">Решено: {remark.resolution}</span>
      )}
      {remark.status === "open" &&
        canWrite &&
        (editing ? (
          <form
            className="mt-2 grid gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (text.trim().length < 3) return;
              resolve.mutate(
                { remarkId: remark.id, resolution: text.trim() },
                {
                  onSuccess: () => toast.success("Замечание закрыто", { description: text.trim() }),
                  onError: (error) => toast.error("Не закрыто", { description: error.message }),
                },
              );
            }}
          >
            <input
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Чем решено: допоставка, скидка, возврат"
              maxLength={500}
              aria-label="Чем решено замечание"
              className="focus-ring h-11 rounded-[var(--r-sm)] border border-line bg-surface-2 px-3 text-[14px] text-text placeholder:text-text-3"
            />
            <div className="flex gap-2">
              <Button
                type="submit"
                size="sm"
                variant="secondary"
                disabled={text.trim().length < 3 || resolve.isPending}
              >
                Закрыть замечание
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Отмена
              </Button>
            </div>
          </form>
        ) : (
          <Button size="sm" variant="ghost" className="mt-1 -ml-2" onClick={() => setEditing(true)}>
            Закрыть замечание…
          </Button>
        ))}
    </li>
  );
}
