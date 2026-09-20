import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Mail, Phone } from "lucide-react";
import { queries } from "@/api/queries";
import { useAccess } from "@/api/access";
import { EntityDrawer } from "@/components/common/EntityDrawer";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ContactFreshnessBadge } from "./ContactFreshnessBadge";
import { fmtDate, fmtNum } from "@/lib/format";

/**
 * Карточка поставщика (ADR-014, п. 7): категории, контакты и дата их проверки, история запросов
 * по всем объектам, среднее время ответа и доля поставок в срок. Всё посчитано по фактам;
 * где фактов нет — так и написано, без числа.
 */
export function SupplierDrawer({
  supplierId,
  onOpenChange,
}: {
  supplierId: string;
  onOpenChange: (open: boolean) => void;
}) {
  const card = useQuery(queries.supplier(supplierId)).data;
  const { canOpen } = useAccess();
  if (!card) return null;
  const { supplier, profile, categories, stats, requests } = card;

  return (
    <EntityDrawer
      open
      onOpenChange={onOpenChange}
      title={supplier.name}
      subtitle={`${profile.region} · ${categories.map((c) => c.name).join(", ")}`}
      badges={<ContactFreshnessBadge status={profile.contactStatus} />}
    >
      <div className="grid gap-5 text-[13px]">
        <section aria-labelledby="supplier-stats">
          <h3 id="supplier-stats" className="mb-2 font-medium text-text">
            Как работает с нами
          </h3>
          <dl className="grid grid-cols-2 gap-3">
            <div className="card-surface px-3 py-2">
              <dt className="text-caption text-text-2">Запросов отправлено</dt>
              <dd className="tnum mt-0.5 text-[18px] font-semibold">{fmtNum(stats.requests)}</dd>
              <dd className="text-caption text-text-2">ответил на {fmtNum(stats.answered)}</dd>
            </div>
            <div className="card-surface px-3 py-2">
              <dt className="text-caption text-text-2">Среднее время ответа</dt>
              <dd className="tnum mt-0.5 text-[18px] font-semibold">
                {stats.avgReplyHours === null ? "—" : `${fmtNum(stats.avgReplyHours)} ч`}
              </dd>
              {stats.avgReplyHours === null && (
                <dd className="text-caption text-text-2">ответов ещё не было</dd>
              )}
            </div>
            <div className="card-surface col-span-2 px-3 py-2">
              <dt className="text-caption text-text-2">Поставки в срок</dt>
              <dd className="tnum mt-0.5 text-[18px] font-semibold">
                {stats.onTimeShare === null ? "—" : `${Math.round(stats.onTimeShare * 100)} %`}
              </dd>
              <dd className="text-caption text-text-2">
                {stats.onTimeShare === null
                  ? "принятых поставок ещё не было"
                  : `принято поставок: ${fmtNum(stats.deliveriesReceived)}, в срок — не позже ожидаемой даты`}
              </dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="supplier-contact">
          <h3 id="supplier-contact" className="mb-2 font-medium text-text">
            Контакт
          </h3>
          <p className="text-text">{profile.contactName}</p>
          <p className="mt-0.5 text-text-2">
            {profile.contactSource} · проверен {fmtDate(profile.contactCheckedAt)}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <a
              href={`tel:${profile.phone}`}
              className="focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-[var(--r-sm)] border border-line px-3 lg:min-h-8"
            >
              <Phone className="size-3.5" aria-hidden /> {profile.phone}
            </a>
            <a
              href={`mailto:${profile.email}`}
              className="focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-[var(--r-sm)] border border-line px-3 lg:min-h-8"
            >
              <Mail className="size-3.5" aria-hidden /> {profile.email}
            </a>
          </div>
        </section>

        <section aria-labelledby="supplier-requests">
          <h3 id="supplier-requests" className="mb-2 font-medium text-text">
            История запросов
          </h3>
          {requests.length === 0 ? (
            <p className="text-text-2">Запросов этому поставщику ещё не отправляли.</p>
          ) : (
            <ul className="divide-y divide-line rounded-[var(--r-md)] border border-line">
              {requests.map((request) => {
                const href = `/projects/${request.projectId}/procurement/${request.requestId}`;
                return (
                  <li key={request.requestId} className="grid gap-0.5 px-3 py-2">
                    <span className="flex flex-wrap items-center gap-2">
                      {canOpen(href) ? (
                        <Link to={href} className="font-medium text-text hover:underline">
                          {request.number}
                        </Link>
                      ) : (
                        <span className="font-medium text-text">{request.number}</span>
                      )}
                      {request.chosen ? (
                        <StatusBadge tone="ok">Выбран</StatusBadge>
                      ) : request.answered ? (
                        <StatusBadge tone="neutral">Ответил</StatusBadge>
                      ) : (
                        <StatusBadge tone="warn">Без ответа</StatusBadge>
                      )}
                    </span>
                    <span className="text-caption text-text-2">
                      {request.projectName}
                      {request.sentAt ? ` · отправлен ${fmtDate(request.sentAt)}` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </EntityDrawer>
  );
}
