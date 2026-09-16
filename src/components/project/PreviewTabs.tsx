import { Link } from "@tanstack/react-router";
import { Bot, Check, FileText, UserRound } from "lucide-react";
import { StatusBadge, type Tone } from "@/components/common/StatusBadge";
import { ConfidenceIndicator, confidenceLevel } from "@/components/common/ConfidenceIndicator";
import {
  documentStats,
  isActive,
  isVerified,
  timelineOf,
  useSpecStore,
  type SpecState,
} from "@/lib/spec-store";
import { docStatusTone } from "@/lib/project-meta";
import { SourceRef } from "@/components/common/SourceRef";
import {
  deliveryStatusLabel,
  milestoneStatusLabel,
  processingStatusLabel as docStatusLabel,
  replacementStatusLabel,
  type Delivery,
  type ExtractedPosition,
  type Milestone,
  type ProjectOverview,
} from "@/contracts";
import { currentRevisions, mainSpecification, revisionStats, revisionsOf } from "@/domain/overview";
import { compareOffers, rfqStatus, rfqStatusMeta } from "@/lib/procurement";
import { counterpartyName, employeeById, employeeName } from "@/lib/directory";
import { fmtDate, fmtDateTime, fmtMoney, fmtNum } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Bar, Block, BlockEmpty } from "./parts";

interface Props {
  projectId: string;
  overview: ProjectOverview;
  scope: () => void;
  onSource: (sourceId: string | null) => void;
}

const PREVIEW = 6;

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={cn(
        "h-9 px-4 text-overline whitespace-nowrap text-text-muted",
        right && "text-right",
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  right,
  className,
}: {
  children?: React.ReactNode;
  right?: boolean;
  className?: string;
}) {
  return (
    <td className={cn("h-11 px-4 text-text-secondary", right && "tnum text-right", className)}>
      {children}
    </td>
  );
}

function PreviewTable({
  head,
  children,
  minWidth = 640,
}: {
  head: React.ReactNode;
  children: React.ReactNode;
  minWidth?: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-table" style={{ minWidth }}>
        <thead>
          <tr className="bg-subtle text-left">{head}</tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

function More({ shown, total, unit }: { shown: number; total: number; unit: string }) {
  if (total <= shown) return null;
  return (
    <p className="border-t border-border px-4 py-2.5 text-caption text-text-muted">
      Показано {fmtNum(shown)} из {fmtNum(total)} {unit}
    </p>
  );
}

/* ---------- Документация ---------- */

export function DocumentsPreview(props: Props) {
  const state = useSpecStore((st) => st);
  const docs = currentRevisions(state.documents, props.projectId);
  const main = mainSpecification(state, props.projectId);
  const versions = main ? revisionsOf(state.documents, main.documentId) : [];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <Block
        title="Проектная документация"
        count={docs.length}
        to={`/projects/${props.projectId}/documents`}
        onLinkClick={props.scope}
      >
        {docs.length === 0 ? (
          <BlockEmpty>Документация объекта ещё не загружена</BlockEmpty>
        ) : (
          <>
            <PreviewTable
              minWidth={760}
              head={
                <>
                  <Th>Документ</Th>
                  <Th>Раздел</Th>
                  <Th>Версия</Th>
                  <Th right>Извлечено</Th>
                  <Th right>Проверено</Th>
                  <Th>Статус</Th>
                </>
              }
            >
              {docs.slice(0, PREVIEW).map((doc) => {
                const stats = documentStats(state, doc.id);
                return (
                  <tr key={doc.id}>
                    <Td className="max-w-[320px] truncate font-medium text-text-primary">
                      <Link
                        to="/projects/$id/documents/$docId"
                        params={{ id: props.projectId, docId: doc.id }}
                        className="hover:text-accent"
                      >
                        {doc.title}
                      </Link>
                    </Td>
                    <Td>{doc.section}</Td>
                    <Td className="whitespace-nowrap">{doc.version}</Td>
                    <Td right>{stats.extracted ? fmtNum(stats.extracted) : "—"}</Td>
                    <Td right>{stats.extracted ? fmtNum(stats.verified) : "—"}</Td>
                    <Td>
                      <StatusBadge tone={docStatusTone[doc.status]}>
                        {docStatusLabel[doc.status]}
                      </StatusBadge>
                    </Td>
                  </tr>
                );
              })}
            </PreviewTable>
            <More shown={PREVIEW} total={docs.length} unit="документов" />
          </>
        )}
      </Block>

      <Block title="Ревизии спецификации" count={versions.length}>
        {versions.length === 0 ? (
          <BlockEmpty>Спецификация не загружена</BlockEmpty>
        ) : (
          <ul className="divide-y divide-border">
            {versions.map((version, index) => {
              const stats = revisionStats(state.positions, version);
              return (
                <li key={version.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-[13px] font-medium">
                      {version.version}
                      {index === 0 && <StatusBadge tone="accent">Актуальная</StatusBadge>}
                    </span>
                    <span className="tnum text-caption text-text-muted">
                      {fmtDate(version.uploadedAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-caption text-text-secondary">
                    {version.sheetCount} листов · извлечено {fmtNum(stats.total)} · проверено{" "}
                    {fmtNum(stats.verified)}
                  </p>
                  <div className="mt-2">
                    <Bar
                      value={stats.verified}
                      total={stats.total}
                      tone={stats.verified < stats.total ? "warn" : "ok"}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Block>
    </div>
  );
}

/* ---------- Материалы ---------- */

export function MaterialsPreview(props: Props) {
  const livePositions = useSpecStore((st) => st.positions);
  const positions = livePositions.filter(
    (item) => item.projectId === props.projectId && isActive(item),
  );
  if (positions.length) return <LiveMaterialsPreview {...props} positions={positions} />;
  return (
    <Block
      title="Спецификация материалов"
      count={`${fmtNum(props.overview.specTotal)} поз. · непроверено ${fmtNum(props.overview.specUnverified)}`}
      to={`/projects/${props.projectId}/materials`}
      onLinkClick={props.scope}
    >
      <BlockEmpty>
        {props.overview.specTotal
          ? `Позиции спецификации (${fmtNum(props.overview.specTotal)}) ещё не загружены в систему — в демо загружена только спецификация «Северной Короны»`
          : "Спецификация ещё не загружена"}
      </BlockEmpty>
    </Block>
  );
}

const levelWeight = { low: 0, mid: 1, high: 2 } as const;

function LiveMaterialsPreview({
  projectId,
  overview,
  scope,
  positions,
}: Props & { positions: ExtractedPosition[] }) {
  const items = [...positions]
    .sort(
      (a, b) =>
        Number(isVerified(a)) - Number(isVerified(b)) ||
        levelWeight[confidenceLevel(a.confidence)] - levelWeight[confidenceLevel(b.confidence)],
    )
    .slice(0, PREVIEW);

  return (
    <Block
      title="Спецификация материалов"
      count={`${fmtNum(overview.specTotal)} поз. · непроверено ${fmtNum(overview.specUnverified)}`}
      to={`/projects/${projectId}/materials`}
      onLinkClick={scope}
    >
      <PreviewTable
        minWidth={820}
        head={
          <>
            <Th>Поз.</Th>
            <Th>Наименование</Th>
            <Th>Раздел</Th>
            <Th right>Количество</Th>
            <Th>Проверка</Th>
            <Th>Источник</Th>
          </>
        }
      >
        {items.map((item) => (
          <tr key={item.id}>
            <Td className="mono text-caption">{item.position}</Td>
            <Td className="max-w-[300px] truncate font-medium text-text-primary">
              {item.projectName}
            </Td>
            <Td className="whitespace-nowrap">{item.group}</Td>
            <Td right className="whitespace-nowrap">
              {item.qty > 0 ? (
                `${fmtNum(item.qty)} ${item.unit}`
              ) : (
                <span className="text-warn">по месту</span>
              )}
            </Td>
            <Td className="whitespace-nowrap">
              {isVerified(item) ? (
                <StatusBadge tone="ok">
                  <Check className="size-3" /> {employeeName(item.reviewedBy ?? "")}
                </StatusBadge>
              ) : (
                <ConfidenceIndicator value={item.confidence} />
              )}
            </Td>
            <Td>
              <Link
                to="/projects/$id/documents/$docId"
                params={{ id: projectId, docId: item.documentId }}
                search={{ position: item.id }}
                className="inline-flex items-center gap-1 rounded-[var(--r-xs)] px-1.5 py-0.5 text-caption text-info hover:bg-info-bg"
              >
                <FileText className="size-3" /> л. {item.sheetNumber}
              </Link>
            </Td>
          </tr>
        ))}
      </PreviewTable>
      <More
        shown={items.length}
        total={overview.specTotal}
        unit="позиций, сначала требующие разбора"
      />
    </Block>
  );
}

/* ---------- Закупки ---------- */

const deliveryTone: Record<Delivery["status"], Tone> = {
  expected: "neutral",
  in_transit: "info",
  received: "ok",
  rejected: "danger",
};

export function PurchasesPreview({ projectId, overview, scope }: Props) {
  const store = useSpecStore((st) => st);
  const requests = [...store.requests.filter((r) => r.projectId === projectId)].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  const deliveries = [...store.deliveries.filter((d) => d.projectId === projectId)].sort((a, b) =>
    b.expectedAt.localeCompare(a.expectedAt),
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <Block
        title="Запросы поставщикам"
        count={`активных ${overview.activeRequests} · просрочено ${overview.overdueRequests}`}
        to={`/projects/${projectId}/procurement`}
        onLinkClick={scope}
      >
        {requests.length === 0 ? (
          <BlockEmpty>Запросов по объекту нет</BlockEmpty>
        ) : (
          <PreviewTable
            head={
              <>
                <Th>Запрос</Th>
                <Th>Позиции</Th>
                <Th right>Ответов</Th>
                <Th right>Лучшая цена</Th>
                <Th>Состояние</Th>
              </>
            }
          >
            {requests.slice(0, PREVIEW).map((request) => {
              const calc = compareOffers(store, request);
              const status = rfqStatusMeta[rfqStatus(store, request)];
              return (
                <tr key={request.id}>
                  <Td className="whitespace-nowrap font-medium text-text-primary">
                    {request.number}
                    <div className="text-caption font-normal text-text-muted">
                      {fmtDate(request.createdAt)}
                    </div>
                  </Td>
                  <Td className="max-w-[240px] truncate">
                    {request.items.map((item) => item.name).join(", ")}
                  </Td>
                  <Td right>
                    {calc.answered} из {request.sentTo.length}
                  </Td>
                  <Td right className="whitespace-nowrap">
                    {calc.best ? fmtMoney(calc.best.total) : "—"}
                  </Td>
                  <Td>
                    <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                  </Td>
                </tr>
              );
            })}
          </PreviewTable>
        )}
      </Block>

      <Block
        title="Поставки"
        count={`в пути ${overview.inTransit} поз.`}
        to={`/projects/${projectId}/procurement`}
        onLinkClick={scope}
      >
        {deliveries.length === 0 ? (
          <BlockEmpty>Поставок по объекту нет</BlockEmpty>
        ) : (
          <ul className="divide-y divide-border">
            {deliveries.slice(0, PREVIEW).map((delivery) => (
              <li key={delivery.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">
                    {delivery.items.map((item) => item.name).join(", ")}
                  </p>
                  <p className="mt-0.5 text-caption text-text-muted">
                    {counterpartyName(delivery.supplierId)} ·{" "}
                    {delivery.receivedAt
                      ? `принята ${fmtDate(delivery.receivedAt)}`
                      : `ожидается ${fmtDate(delivery.expectedAt)}`}
                  </p>
                </div>
                <StatusBadge tone={deliveryTone[delivery.status]}>
                  {deliveryStatusLabel[delivery.status]}
                </StatusBadge>
              </li>
            ))}
          </ul>
        )}
      </Block>
    </div>
  );
}

/* ---------- Ход работ ---------- */

const milestoneTone: Record<Milestone["status"], Tone> = {
  planned: "neutral",
  at_risk: "warn",
  done: "ok",
  overdue: "danger",
};

export function ProgressPreview({ projectId, scope, onSource }: Props) {
  const allZones = useSpecStore((st) => st.zones);
  const allMilestones = useSpecStore((st) => st.milestones);
  const zones = allZones.filter((zone) => zone.projectId === projectId);
  const milestones = allMilestones
    .filter((milestone) => milestone.projectId === projectId)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const planQty = zones.reduce((acc, zone) => acc + zone.planQty, 0);
  const factQty = zones.reduce((acc, zone) => acc + zone.factQty, 0);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <Block title="Объёмы по захваткам" count={`${fmtNum(factQty)} из ${fmtNum(planQty)} м²`}>
        {zones.length === 0 ? (
          <BlockEmpty>Захватки не заведены</BlockEmpty>
        ) : (
          <ul className="divide-y divide-border">
            {zones.map((zone) => {
              const pct = zone.planQty ? Math.round((zone.factQty / zone.planQty) * 100) : 0;
              return (
                <li key={zone.id} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-[13px] font-medium">{zone.name}</span>
                    <span className="tnum shrink-0 text-caption text-text-secondary">
                      {fmtNum(zone.factQty)} / {fmtNum(zone.planQty)} {zone.unit} ·{" "}
                      <b className="font-semibold text-text-primary">{pct}%</b>
                    </span>
                  </div>
                  <p className="mt-0.5 text-caption text-text-muted">Этажи {zone.floors ?? "—"}</p>
                  <div className="mt-2">
                    <Bar
                      value={zone.factQty}
                      total={zone.planQty}
                      tone={pct >= 100 ? "ok" : "accent"}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Block>

      <Block title="Контрольные точки договора" count={milestones.length}>
        {milestones.length === 0 ? (
          <BlockEmpty>Контрольные точки не извлечены</BlockEmpty>
        ) : (
          <ul className="divide-y divide-border">
            {milestones.map((milestone) => (
              <li key={milestone.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">{milestone.name}</p>
                  <p className="mt-0.5 text-caption text-text-muted">
                    до {fmtDate(milestone.dueDate)} · {milestone.requirement}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <StatusBadge tone={milestoneTone[milestone.status]}>
                    {milestoneStatusLabel[milestone.status]}
                  </StatusBadge>
                  <SourceRef
                    sourceId={milestone.sourceId}
                    onOpen={() => onSource(milestone.sourceId)}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Block>
    </div>
  );
}

/* ---------- Решения ---------- */

interface PendingItem {
  id: string;
  title: string;
  details: string;
  link: string;
  kind: "request" | "replacement";
}

/** «Ждут решения»: запросы, по которым ответили все, и предложенные замены материалов объекта */
function pendingDecisions(state: SpecState, projectId: string): PendingItem[] {
  const requests: PendingItem[] = state.requests
    .filter((request) => request.projectId === projectId && rfqStatus(state, request) === "ready")
    .map((request) => ({
      id: request.id,
      title: `Выбрать поставщика по запросу ${request.number}`,
      details: `Ответили все ${request.sentTo.length}: ${request.items.map((item) => item.name).join(", ")}`,
      link: `/projects/${projectId}/procurement/${request.id}`,
      kind: "request",
    }));
  const families = new Set(
    state.positions.filter((item) => item.projectId === projectId).map((item) => item.family),
  );
  const replacements: PendingItem[] = state.replacements
    .filter((item) => item.status === "proposed" && families.has(item.family))
    .map((item) => ({
      id: item.id,
      title: `Замена: ${item.name}`,
      details: `${item.reason} · цена ${item.priceDeltaPct > 0 ? "+" : ""}${item.priceDeltaPct}%`,
      link: `/projects/${projectId}/materials`,
      kind: "replacement",
    }));
  return [...requests, ...replacements];
}

export function DecisionsPreview({ projectId, scope, onSource }: Props) {
  const state = useSpecStore((st) => st);
  const pending = pendingDecisions(state, projectId);
  const decisions = state.decisions
    .filter((item) => item.projectId === projectId)
    .sort((a, b) => b.approvedAt.localeCompare(a.approvedAt));

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Block
        title="Ждут решения"
        count={pending.length}
        to={`/projects/${projectId}/timeline`}
        onLinkClick={scope}
      >
        {pending.length === 0 ? (
          <BlockEmpty>Открытых вопросов нет</BlockEmpty>
        ) : (
          <ul className="divide-y divide-border">
            {pending.slice(0, PREVIEW).map((item) => (
              <li key={item.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <Link to={item.link} className="text-[13px] font-medium hover:text-accent">
                    {item.title}
                  </Link>
                  <StatusBadge tone={item.kind === "request" ? "accent" : "info"}>
                    {item.kind === "request" ? "Сравнение готово" : replacementStatusLabel.proposed}
                  </StatusBadge>
                </div>
                <p className="mt-1 line-clamp-2 text-caption text-text-secondary">{item.details}</p>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block
        title="Принятые решения"
        count={decisions.length}
        to={`/projects/${projectId}/timeline`}
        onLinkClick={scope}
      >
        {decisions.length === 0 ? (
          <BlockEmpty>Решений по объекту пока нет</BlockEmpty>
        ) : (
          <ul className="divide-y divide-border">
            {decisions.slice(0, PREVIEW).map((decision) => (
              <li key={decision.id} className="flex gap-3 px-4 py-3">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-ok-bg text-ok">
                  <Check className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium">{decision.title}</p>
                  <p className="mt-0.5 text-caption text-text-secondary">
                    {decision.choice}. {decision.reason}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-caption text-text-muted">
                    {employeeName(decision.approvedBy)} · {fmtDateTime(decision.approvedAt)}
                    <SourceRef
                      sourceId={decision.basisSourceId}
                      onOpen={() => onSource(decision.basisSourceId)}
                    />
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Block>
    </div>
  );
}

/* ---------- История ---------- */

export function HistoryPreview({ projectId, scope, onSource }: Props) {
  const state = useSpecStore((st) => st);
  const log = timelineOf(state, projectId);

  return (
    <Block
      title="Журнал действий"
      count={log.length}
      to={`/projects/${projectId}/timeline`}
      onLinkClick={scope}
    >
      {log.length === 0 ? (
        <BlockEmpty>Записей в журнале нет</BlockEmpty>
      ) : (
        <PreviewTable
          minWidth={760}
          head={
            <>
              <Th>Когда</Th>
              <Th>Кто</Th>
              <Th>Действие</Th>
              <Th>Подробности</Th>
              <Th />
            </>
          }
        >
          {log.slice(0, 10).map((entry) => (
            <tr key={entry.id}>
              <Td className="tnum whitespace-nowrap">{fmtDateTime(entry.at)}</Td>
              <Td className="whitespace-nowrap">
                <span className="inline-flex items-center gap-1.5">
                  {entry.actorId ? (
                    <UserRound className="size-3.5 text-text-muted" />
                  ) : (
                    <Bot className="size-3.5 text-text-muted" />
                  )}
                  {entry.actorId
                    ? (employeeById(entry.actorId)?.name ?? "—")
                    : "Автоматическая обработка"}
                </span>
              </Td>
              <Td className="max-w-[320px] truncate font-medium text-text-primary">
                {entry.title}
              </Td>
              <Td className="max-w-[240px] truncate">{entry.details ?? "—"}</Td>
              <Td>
                <SourceRef sourceId={entry.sourceId} onOpen={() => onSource(entry.sourceId)} />
              </Td>
            </tr>
          ))}
        </PreviewTable>
      )}
    </Block>
  );
}

/* ---------- Команда ---------- */

export function TeamPreview({ projectId }: Props) {
  const employees = useSpecStore((st) => st.employees);
  const allCrews = useSpecStore((st) => st.crews);
  const people = employees.filter((item) => item.projectIds.includes(projectId));
  const crews = allCrews.filter((crew) => crew.projectId === projectId);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Block title="Люди на объекте" count={people.length}>
        <ul className="divide-y divide-border">
          {people.map((person) => (
            <li key={person.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-pastel-slate text-[11px] font-medium text-pastel-slate-fg">
                {person.name
                  .split(" ")
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join("")}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{person.name}</p>
                <p className="truncate text-caption text-text-muted">{person.position}</p>
              </div>
              <span className="hidden text-caption text-text-secondary sm:inline">
                {person.telegram ?? "Без Telegram"}
              </span>
              <span className="tnum hidden text-caption text-text-muted md:inline">
                {person.phone}
              </span>
            </li>
          ))}
        </ul>
      </Block>

      <Block title="Бригады" count={crews.length}>
        {crews.length === 0 ? (
          <BlockEmpty>Бригады не назначены</BlockEmpty>
        ) : (
          <ul className="divide-y divide-border">
            {crews.map((crew) => (
              <li key={crew.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] font-medium">{crew.name}</p>
                  <span className="tnum text-caption text-text-secondary">
                    {crew.headcount} чел.
                  </span>
                </div>
                <p className="mt-0.5 text-caption text-text-muted">
                  {crew.specialization} · прораб {employeeName(crew.foremanId)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Block>
    </div>
  );
}
