import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, PackageCheck } from "lucide-react";
import { DetailsLayout } from "@/components/common/DetailsPanel";
import { MobileActionBar } from "@/components/common/MobileActionBar";
import { ScreenGate, ScreenSkeleton } from "@/components/common/ScreenStates";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  loadProject,
  ProjectNotFound,
  withProject,
  type ProjectPageProps,
} from "@/components/project/ProjectNotFound";
import { SubpageHeader } from "@/components/project/SubpageHeader";
import { AcceptanceDialog } from "@/components/deliveries/AcceptanceDialog";
import { DeliveryDetails, DeliveryMoves } from "@/components/deliveries/DeliveryDetails";
import { deliveryTone } from "@/lib/procurement";
import { Button } from "@/components/ui/button";
import { deliveryStatusLabel, type Delivery } from "@/contracts";
import { useDirectory } from "@/api/directory";
import { useMoveDelivery } from "@/api/mutations";
import { prefetch } from "@/api/prefetch";
import { queries } from "@/api/queries";
import { useScreenState } from "@/lib/screen-state";
import { fmtDate, fmtNum } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

interface DeliveriesSearch {
  delivery?: string | undefined;
}

export const Route = createFileRoute("/projects/$id/deliveries")({
  validateSearch: (search: Record<string, unknown>): DeliveriesSearch => ({
    delivery: typeof search["delivery"] === "string" ? search["delivery"] : undefined,
  }),
  loader: async ({ params, context }) => {
    const [result] = await Promise.all([
      loadProject(context.queryClient, params.id),
      prefetch(context.queryClient, queries.deliveries(params.id)),
    ]);
    return result;
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [{ title: `Поставки — ${loaderData.project?.name ?? "Объект"} — neeklo FieldOps` }]
      : [],
  }),
  notFoundComponent: ProjectNotFound,
  component: withProject(DeliveriesPage),
});

/** Группы экрана: что требует действия сейчас — сверху */
const groups: { id: string; title: string; match: (item: Delivery) => boolean }[] = [
  { id: "accept", title: "К приёмке", match: (item) => item.status === "arrived" },
  {
    id: "moving",
    title: "В пути и ожидаются",
    match: (item) =>
      item.status === "expected" || item.status === "shipped" || item.status === "in_transit",
  },
  {
    id: "done",
    title: "Приняты",
    match: (item) => item.status === "accepted" || item.status === "accepted_with_remarks",
  },
  { id: "rejected", title: "Отклонены", match: (item) => item.status === "rejected" },
];

function DeliveriesPage({ project, overview }: ProjectPageProps): React.JSX.Element {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { counterpartyById } = useDirectory();
  const listQuery = useQuery(queries.deliveries(project.id));
  const deliveries = listQuery.data ?? [];
  const openId = search.delivery ?? null;
  const cardQuery = useQuery({ ...queries.delivery(openId ?? ""), enabled: !!openId });
  const card = openId ? (cardQuery.data ?? null) : null;
  const move = useMoveDelivery();
  const [acceptOpen, setAcceptOpen] = useState(false);

  const open = (id: string | null) =>
    navigate({ search: { delivery: id ?? undefined }, replace: true, resetScroll: false });
  // DetailsLayout держит последний обработчик сам, стабильная ссылка ему не нужна
  const close = () => open(null);

  const toAccept = deliveries.filter((item) => item.status === "arrived");
  const screen = useScreenState({
    pending: listQuery.isPending,
    error: listQuery.isError,
    empty: deliveries.length === 0,
  });

  const onMove = (
    status: "shipped" | "in_transit" | "arrived" | "rejected",
    note: string | null,
  ) => {
    if (!card) return;
    move.mutate(
      { deliveryId: card.delivery.id, status, note },
      {
        onSuccess: () =>
          toast.success(`Поставка: ${deliveryStatusLabel[status].toLowerCase()}`, {
            description:
              status === "arrived"
                ? "Теперь её можно принять: факт, входной контроль, фото."
                : status === "rejected"
                  ? "Причина передана снабжению в очередь «Требует решения»."
                  : "Отмечено в движении поставки с вашим именем.",
          }),
        onError: (error) => toast.error("Не сохранилось", { description: error.message }),
      },
    );
  };

  return (
    <DetailsLayout
      open={!!card}
      onClose={close}
      title={card ? `Поставка по запросу ${card.requestNumber}` : ""}
      subtitle={card ? deliveryStatusLabel[card.delivery.status] : undefined}
      footer={
        card ? (
          <DeliveryMoves
            status={card.delivery.status}
            pending={move.isPending}
            onMove={onMove}
            onAccept={() => setAcceptOpen(true)}
          />
        ) : null
      }
      panel={card ? <DeliveryDetails card={card} projectId={project.id} /> : null}
    >
      <SubpageHeader
        project={project}
        title="Поставки"
        description="Что везут на объект, что уже приняли и с какими замечаниями. Поставка появляется после решения по запросу поставщикам."
        actions={
          toAccept[0] ? (
            <Button variant="accent" onClick={() => open(toAccept[0]!.id)}>
              <PackageCheck className="size-4" /> К приёмке: {toAccept.length}
            </Button>
          ) : (
            <Button variant="secondary" asChild>
              <Link to="/projects/$id/procurement" params={{ id: project.id }}>
                К закупкам <ArrowRight className="size-4" />
              </Link>
            </Button>
          )
        }
      />

      <ul className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Сводка поставок">
        {[
          { label: "К приёмке", value: toAccept.length },
          { label: "В пути, позиций", value: overview.inTransit },
          { label: "Поставлено позиций", value: overview.delivered },
          { label: "Открытых замечаний", value: overview.openRemarks },
        ].map((tile) => (
          <li key={tile.label} className="card-surface px-4 py-3">
            <span className="block text-[13px] text-text-2">{tile.label}</span>
            <span className="tnum mt-1 block text-[22px] font-semibold text-text">
              {fmtNum(tile.value)}
            </span>
          </li>
        ))}
      </ul>

      <ScreenGate
        state={screen}
        onRetry={() => void listQuery.refetch()}
        skeleton={<ScreenSkeleton kind="feed" />}
        copy={{
          section: "Поставки",
          roles: "руководителю проекта, снабжению и прорабу",
          errorTitle: "Не удалось загрузить поставки",
          empty: {
            icon: PackageCheck,
            title: "Поставок по объекту пока нет",
            description:
              "Поставка создаётся, когда по запросу поставщикам зафиксировано решение. Выберите поставщика в сравнении предложений.",
            actionLabel: "К закупкам",
            onAction: () =>
              navigate({ to: "/projects/$id/procurement", params: { id: project.id } }),
          },
        }}
      >
        <div className="grid gap-6">
          {groups.map((group) => {
            const items = deliveries.filter(group.match);
            if (!items.length) return null;
            return (
              <section key={group.id} aria-labelledby={`dl-group-${group.id}`}>
                <h2
                  id={`dl-group-${group.id}`}
                  className="mb-2 text-[13px] font-medium text-text-2"
                >
                  {group.title} · {items.length}
                </h2>
                <ul
                  data-tour={group.id === "accept" ? "deliveries-accept" : undefined}
                  className="card-surface divide-y divide-line overflow-hidden"
                >
                  {items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => open(item.id)}
                        aria-current={item.id === openId ? "true" : undefined}
                        className={cn(
                          "focus-ring flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-left transition-fast hover:bg-surface-2",
                          item.id === openId && "bg-surface-2",
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] text-text">
                            {item.items.map((line) => line.name).join(", ")}
                          </span>
                          <span className="block truncate text-[13px] text-text-3">
                            {counterpartyById(item.supplierId)?.name ?? "—"} ·{" "}
                            {item.receivedAt
                              ? `принята ${fmtDate(item.receivedAt)}`
                              : `ожидается ${fmtDate(item.expectedAt)}`}
                            {!item.sourceId &&
                              !item.receivedAt &&
                              " · без подтверждения поставщика"}
                          </span>
                        </span>
                        <StatusBadge tone={deliveryTone[item.status]}>
                          {deliveryStatusLabel[item.status]}
                        </StatusBadge>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </ScreenGate>

      {toAccept[0] && !card && (
        <MobileActionBar>
          <Button variant="accent" onClick={() => open(toAccept[0]!.id)}>
            <PackageCheck className="size-4" /> К приёмке: {toAccept.length}
          </Button>
        </MobileActionBar>
      )}

      {card && card.delivery.status === "arrived" && (
        <AcceptanceDialog delivery={card.delivery} open={acceptOpen} onOpenChange={setAcceptOpen} />
      )}
    </DetailsLayout>
  );
}
