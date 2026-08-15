import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Mail,
  Plus,
  ShoppingCart,
  Sparkles,
  Trophy,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel } from "@/components/common/Panel";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge, type StatusTone } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { projects } from "@/mock/projects";
import { suppliers, getSupplier } from "@/mock/suppliers";
import {
  bestQuote,
  bestTotal,
  getNom,
  nomenclature,
  purchaseRequestsV2,
  quoteStatusLabels,
  quoteTotal,
  requestStatusLabels,
  type PurchaseRequestV2,
  type QuoteStatus,
  type RequestStatus,
} from "@/mock/procurement";
import { fmtDate, fmtMoney, fmtNum } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/procurement")({
  validateSearch: (s: Record<string, unknown>) => ({
    req: typeof s['req'] === "string" ? (s['req'] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Заявки и закупки — ФАСАД-РП" },
      { name: "description", content: "Заявки поставщикам, автоподбор, сбор и сравнение коммерческих предложений." },
      { property: "og:title", content: "Заявки и закупки — ФАСАД-РП" },
      { property: "og:description", content: "Заявки поставщикам, автоподбор, сбор и сравнение коммерческих предложений." },
    ],
  }),
  component: ProcurementPage,
});

const statusTone: Record<RequestStatus, StatusTone> = {
  draft: "neutral",
  sent: "info",
  awaiting: "warn",
  chosen: "accent",
  ordered: "ok",
};

const quoteTone: Record<QuoteStatus, StatusTone> = {
  replied: "ok",
  pending: "neutral",
  late: "danger",
};

const projectName = (id: string) => projects.find((p) => p.id === id)?.shortName ?? id;

const DemoBadge = () => (
  <span className="inline-flex items-center gap-1.5 rounded-sm bg-accent-subtle px-2 py-1 text-caption text-accent">
    <Sparkles className="size-3.5" /> Рассылка: демо-имитация
  </span>
);

function ProcurementPage() {
  const { req } = Route.useSearch();
  const navigate = useNavigate();
  const [list, setList] = useState<PurchaseRequestV2[]>(purchaseRequestsV2);
  const [projectFilter, setProjectFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | RequestStatus>("all");
  const [wizardOpen, setWizardOpen] = useState(false);

  const open = req ? list.find((r) => r.id === req) : undefined;

  const rows = useMemo(
    () =>
      list.filter(
        (r) =>
          (projectFilter === "all" || r.projectId === projectFilter) &&
          (statusFilter === "all" || r.status === statusFilter),
      ),
    [list, projectFilter, statusFilter],
  );

  if (open) {
    return (
      <RequestDetail
        request={open}
        onBack={() => navigate({ to: "/procurement", search: {} })}
        onChoose={(supplierId) =>
          setList((p) =>
            p.map((r) => (r.id === open.id ? { ...r, chosenSupplierId: supplierId, status: "chosen" } : r)),
          )
        }
      />
    );
  }

  const columns: Column<PurchaseRequestV2>[] = [
    {
      key: "id",
      header: "Заявка",
      width: "20%",
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-text-primary">{r.id}</p>
          <p className="truncate text-caption text-text-muted">{projectName(r.projectId)}</p>
        </div>
      ),
    },
    {
      key: "items",
      header: "Позиции",
      width: "22%",
      cell: (r) => (
        <span className="text-text-secondary">
          {r.items.length} поз. · {fmtNum(r.items.reduce((s, i) => s + i.qty, 0))} ед.
        </span>
      ),
    },
    { key: "sent", header: "Разослано", align: "right", cell: (r) => r.quotes.length || "—" },
    {
      key: "replies",
      header: "Ответов",
      align: "right",
      cell: (r) => r.quotes.filter((q) => q.status === "replied").length || "—",
    },
    {
      key: "best",
      header: "Лучшая цена",
      align: "right",
      width: "16%",
      cell: (r) => {
        const b = bestTotal(r);
        return b ? <span className="font-medium text-text-primary">{fmtMoney(b)}</span> : "—";
      },
    },
    {
      key: "delivery",
      header: "Срок",
      align: "right",
      cell: (r) => {
        const b = bestQuote(r);
        return b?.deliveryDays ? `${b.deliveryDays} дн.` : "—";
      },
    },
    {
      key: "status",
      header: "Статус",
      width: "16%",
      cell: (r) => <StatusBadge tone={statusTone[r.status]}>{requestStatusLabels[r.status]}</StatusBadge>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Заявки и закупки"
        description="Заявки поставщикам, автоподбор по категориям и сравнение предложений."
        meta={<DemoBadge />}
        actions={
          <Button className="gap-2" onClick={() => setWizardOpen(true)}>
            <Plus className="size-4" /> Новая заявка
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="h-9 w-[220px]">
            <SelectValue placeholder="Объект" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все объекты</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.shortName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="h-9 w-[200px]">
            <SelectValue placeholder="Статус" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            {(Object.keys(requestStatusLabels) as RequestStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {requestStatusLabels[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-caption text-text-muted">Заявок: {rows.length}</span>
      </div>

      <Panel bodyClassName="p-0">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          onRowClick={(r) => navigate({ to: "/procurement", search: { req: r.id } })}
          empty={<EmptyState title="Заявок нет" description="Измените фильтры или создайте новую заявку." />}
        />
      </Panel>

      <Wizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onCreate={(r) => setList((p) => [r, ...p])}
      />
    </div>
  );
}

/* ---------------------------------- Деталь заявки: сравнение ответов --------------------------------- */

function RequestDetail({
  request,
  onBack,
  onChoose,
}: {
  request: PurchaseRequestV2;
  onBack: () => void;
  onChoose: (supplierId: string) => void;
}) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const best = bestTotal(request);

  const bestUnit = (nomId: string) => {
    const vals = request.quotes
      .map((q) => q.unitPrices?.[nomId])
      .filter((v): v is number => typeof v === "number");
    return vals.length ? Math.min(...vals) : undefined;
  };

  return (
    <div>
      <button onClick={onBack} className="mb-3 inline-flex items-center gap-1.5 text-caption text-text-muted hover:text-text-primary">
        <ArrowLeft className="size-3.5" /> К списку заявок
      </button>

      <PageHeader
        title={`Заявка ${request.id}`}
        description={`${projectName(request.projectId)} · создана ${fmtDate(request.createdAt)} · нужно к ${fmtDate(request.neededBy)}`}
        meta={
          <>
            <StatusBadge tone={statusTone[request.status]}>{requestStatusLabels[request.status]}</StatusBadge>
            <DemoBadge />
          </>
        }
      />

      {request.chosenSupplierId && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md bg-ok-bg px-4 py-3 text-table text-ok">
          <Check className="size-4" />
          Выбран поставщик: {getSupplier(request.chosenSupplierId)?.name}. Заявка переведена в статус «
          {requestStatusLabels[request.status]}».
        </div>
      )}

      <Panel title="Сравнение ответов" bodyClassName="p-0">
        {request.quotes.length === 0 ? (
          <EmptyState title="Заявка ещё не разослана" description="Черновик: отправьте письма поставщикам, чтобы собрать предложения." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="border-b border-border bg-subtle">
                  <th className="sticky left-0 z-10 bg-subtle px-4 py-2.5 text-left text-caption font-medium text-text-muted">
                    Позиция
                  </th>
                  {request.quotes.map((q) => (
                    <th key={q.supplierId} className="px-4 py-2.5 text-right text-caption font-medium text-text-muted">
                      <Link
                        to="/suppliers"
                        search={{ id: q.supplierId }}
                        className="text-text-primary hover:text-accent"
                      >
                        {getSupplier(q.supplierId)?.name}
                      </Link>
                      <div className="mt-1 flex justify-end">
                        <StatusBadge tone={quoteTone[q.status]}>{quoteStatusLabels[q.status]}</StatusBadge>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {request.items.map((it) => {
                  const nom = getNom(it.nomId);
                  const bu = bestUnit(it.nomId);
                  return (
                    <tr key={it.nomId} className="border-b border-border">
                      <td className="sticky left-0 z-10 bg-surface px-4 py-2.5 text-table">
                        <p className="text-text-primary">{nom?.name}</p>
                        <p className="text-caption text-text-muted">
                          {fmtNum(it.qty)} {nom?.unit}
                        </p>
                      </td>
                      {request.quotes.map((q) => {
                        const price = q.unitPrices?.[it.nomId];
                        return (
                          <td
                            key={q.supplierId}
                            className={cn(
                              "tnum px-4 py-2.5 text-right text-table",
                              price !== undefined && price === bu && "bg-ok-bg font-medium text-ok",
                            )}
                          >
                            {price === undefined ? (
                              <span className="text-text-muted">—</span>
                            ) : (
                              <>
                                {fmtMoney(price * it.qty)}
                                <div className="text-caption font-normal text-text-muted">
                                  {fmtMoney(price)} / {nom?.unit}
                                </div>
                              </>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                <tr className="border-b border-border bg-subtle">
                  <td className="sticky left-0 z-10 bg-subtle px-4 py-2.5 text-table text-text-muted">Срок поставки</td>
                  {request.quotes.map((q) => (
                    <td key={q.supplierId} className="tnum px-4 py-2.5 text-right text-table">
                      {q.deliveryDays ? `${q.deliveryDays} дн.` : "—"}
                    </td>
                  ))}
                </tr>
                <tr className="bg-subtle">
                  <td className="sticky left-0 z-10 bg-subtle px-4 py-3 text-table font-medium text-text-primary">Итого</td>
                  {request.quotes.map((q) => {
                    const total = quoteTotal(request, q);
                    const isBest = total !== undefined && total === best;
                    return (
                      <td key={q.supplierId} className={cn("px-4 py-3 text-right", isBest && "bg-ok-bg")}>
                        <div className={cn("tnum text-table font-semibold", isBest ? "text-ok" : "text-text-primary")}>
                          {total ? fmtMoney(total) : "—"}
                        </div>
                        {isBest && (
                          <div className="mt-0.5 inline-flex items-center gap-1 text-caption text-ok">
                            <Trophy className="size-3" /> Лучшая цена
                          </div>
                        )}
                        {total !== undefined && (
                          <div className="mt-2">
                            <Button
                              size="sm"
                              variant={isBest ? "default" : "outline"}
                              className="h-8"
                              disabled={request.chosenSupplierId === q.supplierId}
                              onClick={() => setConfirm(q.supplierId)}
                            >
                              {request.chosenSupplierId === q.supplierId ? "Выбран" : "Выбрать поставщика"}
                            </Button>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {request.quotes.some((q) => q.note) && (
        <ul className="mt-3 space-y-1 text-caption text-text-muted">
          {request.quotes
            .filter((q) => q.note)
            .map((q) => (
              <li key={q.supplierId}>
                {getSupplier(q.supplierId)?.name}: {q.note}
              </li>
            ))}
        </ul>
      )}

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Выбрать поставщика</DialogTitle>
            <DialogDescription>
              {confirm && getSupplier(confirm)?.name} по заявке {request.id}. Статус заявки изменится на «Выбран
              поставщик». Заказ размещается вручную.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Отмена
            </Button>
            <Button
              onClick={() => {
                if (confirm) {
                  onChoose(confirm);
                  toast.success(`Поставщик «${getSupplier(confirm)?.name}» выбран (демо)`);
                }
                setConfirm(null);
              }}
            >
              Подтвердить выбор
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------- Мастер создания заявки ------------------------------------- */

const steps = ["Объект", "Позиции", "Поставщики", "Письмо"];

function Wizard({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (r: PurchaseRequestV2) => void;
}) {
  const [step, setStep] = useState(0);
  const [projectId, setProjectId] = useState(projects[0]!.id);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [body, setBody] = useState("");

  const chosenItems = nomenclature
    .filter((n) => Number(qty[n.id]) > 0)
    .map((n) => ({ nomId: n.id, qty: Number(qty[n.id]) }));
  const categories = [...new Set(chosenItems.map((i) => getNom(i.nomId)!.category))];

  const matched = suppliers
    .map((s) => ({ s, hits: s.categories.filter((c) => categories.includes(c)) }))
    .filter((m) => m.hits.length > 0);

  const selectedSuppliers = matched.filter((m) => picked[m.s.id] !== false);

  const reset = () => {
    setStep(0);
    setQty({});
    setPicked({});
    setBody("");
  };

  const draftBody = () =>
    `Здравствуйте!\n\nПросим предоставить коммерческое предложение на поставку материалов для объекта «${
      projects.find((p) => p.id === projectId)?.name
    }».\n\nПозиции:\n${chosenItems
      .map((i) => `• ${getNom(i.nomId)!.name} — ${fmtNum(i.qty)} ${getNom(i.nomId)!.unit}`)
      .join("\n")}\n\nПросим указать цену за единицу без НДС, срок изготовления и условия оплаты.\nОтвет просим направить в течение 2 рабочих дней.\n\nС уважением,\nСоколов И.П., руководитель проекта`;

  const canNext = step === 1 ? chosenItems.length > 0 : step === 2 ? selectedSuppliers.length > 0 : true;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-h-[92vh] w-full max-w-2xl overflow-y-auto max-lg:h-[100dvh] max-lg:max-h-none max-lg:max-w-none max-lg:rounded-none">
        <DialogHeader>
          <DialogTitle>Новая заявка · шаг {step + 1} из 4</DialogTitle>
          <DialogDescription>{steps[step]}</DialogDescription>
        </DialogHeader>

        <div className="mb-1 flex gap-1">
          {steps.map((s, i) => (
            <div
              key={s}
              className={cn("h-1 flex-1 rounded-full", i <= step ? "bg-accent" : "bg-subtle")}
              title={s}
            />
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-3">
            <p className="text-caption text-text-muted">Объект, для которого закупаются материалы</p>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {step === 1 && (
          <div className="divide-y divide-border rounded-md border border-border">
            {nomenclature.map((n) => (
              <div key={n.id} className="flex min-h-11 items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-table text-text-primary">{n.name}</p>
                  <p className="text-caption text-text-muted">
                    {n.category} · {n.unit}
                  </p>
                </div>
                <Input
                  inputMode="numeric"
                  placeholder="0"
                  value={qty[n.id] ?? ""}
                  onChange={(e) => setQty((p) => ({ ...p, [n.id]: e.target.value.replace(/\D/g, "") }))}
                  className="h-11 w-24 text-right"
                />
              </div>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-2">
            <p className="text-caption text-text-muted">
              Автоподбор по категориям: {categories.join(", ") || "—"}
            </p>
            {matched.map(({ s, hits }) => (
              <label
                key={s.id}
                className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-border p-3 hover:bg-subtle"
              >
                <Checkbox
                  checked={picked[s.id] !== false}
                  onCheckedChange={(v) => setPicked((p) => ({ ...p, [s.id]: v === true }))}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-table font-medium text-text-primary">{s.name}</span>
                    <StatusBadge tone={s.rating >= 4 ? "ok" : s.rating >= 3 ? "warn" : "danger"}>
                      Рейтинг {s.rating.toFixed(1)}
                    </StatusBadge>
                  </div>
                  <p className="mt-0.5 text-caption text-text-muted">
                    Соответствие: категории «{hits.join(", ")}» · ответ ~{s.avgReplyHours} ч · поставка ~
                    {s.avgDeliveryDays} дн.
                  </p>
                  {s.ratingNote && <p className="mt-0.5 text-caption text-danger">{s.ratingNote}</p>}
                </div>
              </label>
            ))}
            {matched.length === 0 && (
              <p className="text-table text-text-muted">Нет поставщиков по выбранным категориям.</p>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-2">
            <p className="text-caption text-text-muted">
              Получатели ({selectedSuppliers.length}): {selectedSuppliers.map((m) => m.s.name).join(", ")}
            </p>
            <Textarea
              value={body || draftBody()}
              onChange={(e) => setBody(e.target.value)}
              className="min-h-[280px] font-mono text-caption"
            />
            <p className="text-caption text-text-muted">
              Письмо редактируемое. Отправка выполняется только после подтверждения человеком.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="ghost"
            className="h-11 gap-1.5"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            <ChevronLeft className="size-4" /> Назад
          </Button>
          {step < 3 ? (
            <Button className="h-11 gap-1.5" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
              Далее <ChevronRight className="size-4" />
            </Button>
          ) : (
            <Button
              className="h-11 gap-2"
              onClick={() => {
                const id = `З-2026-${Math.floor(Math.random() * 80 + 130)}`;
                onCreate({
                  id,
                  projectId,
                  items: chosenItems,
                  status: "sent",
                  createdAt: new Date().toISOString().slice(0, 10),
                  neededBy: "2026-09-15",
                  emailBody: body || draftBody(),
                  quotes: selectedSuppliers.map((m) => ({ supplierId: m.s.id, status: "pending" as const })),
                });
                onOpenChange(false);
                reset();
                toast.success(`Письма разосланы ${selectedSuppliers.length} поставщикам (демо-имитация)`);
              }}
            >
              <Mail className="size-4" /> Отправить {selectedSuppliers.length} поставщикам
            </Button>
          )}
        </DialogFooter>

        <p className="flex items-center gap-1.5 text-caption text-text-muted">
          <ShoppingCart className="size-3.5" /> В проде — рассылка через корпоративную почту и учёт ответов.
        </p>
      </DialogContent>
    </Dialog>
  );
}
