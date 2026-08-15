import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Mail, Phone, Search, Star, Truck, Users } from "lucide-react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel } from "@/components/common/Panel";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge, type StatusTone } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { projects } from "@/mock/projects";
import { suppliers, supplierCategories, type Supplier } from "@/mock/suppliers";
import { supplierHistory } from "@/mock/procurement";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/suppliers")({
  validateSearch: (s: Record<string, unknown>) => ({
    id: typeof s['id'] === "string" ? (s['id'] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Поставщики — ФАСАД-РП" },
      { name: "description", content: "Реестр поставщиков: категории, сроки ответа и поставки, рейтинг надёжности." },
      { property: "og:title", content: "Поставщики — ФАСАД-РП" },
      { property: "og:description", content: "Реестр поставщиков: категории, сроки ответа и поставки, рейтинг надёжности." },
    ],
  }),
  component: SuppliersPage,
});

const ratingTone = (r: number): StatusTone => (r >= 4.5 ? "ok" : r >= 3.5 ? "info" : r >= 3 ? "warn" : "danger");

const projectName = (id: string) => projects.find((p) => p.id === id)?.shortName ?? id;

function Rating({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Star className={cn("size-3.5", value >= 3.5 ? "text-warn" : "text-danger")} fill="currentColor" />
      <span className="tnum font-medium text-text-primary">{value.toFixed(1)}</span>
    </span>
  );
}

function SuppliersPage() {
  const { id } = Route.useSearch();
  const navigate = useNavigate();
  const [category, setCategory] = useState("all");
  const [q, setQ] = useState("");

  const rows = useMemo(
    () =>
      suppliers.filter(
        (s) =>
          (category === "all" || s.categories.includes(category)) &&
          (q.trim() === "" ||
            s.name.toLowerCase().includes(q.toLowerCase()) ||
            s.contactPerson.toLowerCase().includes(q.toLowerCase())),
      ),
    [category, q],
  );

  const open = id ? suppliers.find((s) => s.id === id) : undefined;
  if (open) return <SupplierCard supplier={open} onBack={() => navigate({ to: "/suppliers", search: { id: undefined } })} />;

  const columns: Column<Supplier>[] = [
    {
      key: "name",
      header: "Поставщик",
      width: "24%",
      cell: (s) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-text-primary">{s.name}</p>
          <p className="truncate text-caption text-text-muted">{s.contactPerson}</p>
        </div>
      ),
    },
    {
      key: "cats",
      header: "Категории",
      width: "22%",
      cell: (s) => <span className="text-text-secondary">{s.categories.join(", ")}</span>,
    },
    {
      key: "contacts",
      header: "Контакты",
      width: "20%",
      cell: (s) => (
        <div className="min-w-0 text-text-secondary">
          <p className="tnum truncate">{s.phone}</p>
          <p className="truncate text-caption text-text-muted">{s.email}</p>
        </div>
      ),
    },
    { key: "reply", header: "Ответ", align: "right", cell: (s) => `${s.avgReplyHours} ч` },
    { key: "delivery", header: "Поставка", align: "right", cell: (s) => `${s.avgDeliveryDays} дн.` },
    { key: "orders", header: "Заявок", align: "right", cell: (s) => s.ordersDone },
    {
      key: "rating",
      header: "Рейтинг",
      align: "right",
      width: "12%",
      cell: (s) => (
        <div className="flex flex-col items-end gap-0.5">
          <Rating value={s.rating} />
          {s.ratingNote && <span className="text-caption text-danger">просрочки</span>}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Поставщики"
        description="Реестр поставщиков, сроки ответа и надёжность по выполненным заявкам."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-[260px]">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск по названию или контакту"
            className="h-9 pl-9"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-9 w-[220px]">
            <SelectValue placeholder="Категория" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все категории</SelectItem>
            {supplierCategories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-caption text-text-muted">Поставщиков: {rows.length}</span>
      </div>

      <Panel bodyClassName="p-0">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(s) => s.id}
          onRowClick={(s) => navigate({ to: "/suppliers", search: { id: s.id } })}
          empty={<EmptyState icon={Users} title="Поставщиков нет" description="Измените фильтр категории или поисковый запрос." />}
        />
      </Panel>
    </div>
  );
}

function SupplierCard({ supplier, onBack }: { supplier: Supplier; onBack: () => void }) {
  const history = supplierHistory[supplier.id] ?? [];

  const historyColumns: Column<(typeof history)[number]>[] = [
    {
      key: "req",
      header: "Заявка",
      width: "18%",
      cell: (r) => (
        <Link to="/procurement" search={{ req: r.requestId }} className="font-medium text-accent hover:underline">
          {r.requestId}
        </Link>
      ),
    },
    { key: "obj", header: "Объект", width: "20%", cell: (r) => projectName(r.projectId) },
    { key: "items", header: "Позиции", width: "26%", cell: (r) => <span className="text-text-secondary">{r.items}</span> },
    { key: "price", header: "Цена", align: "right", cell: (r) => (r.price ? fmtMoney(r.price) : "—") },
    { key: "days", header: "Срок", align: "right", cell: (r) => (r.deliveryDays ? `${r.deliveryDays} дн.` : "—") },
    {
      key: "status",
      header: "Статус",
      width: "14%",
      cell: (r) => (
        <StatusBadge
          tone={r.status === "Поставлено" ? "ok" : r.status === "Просрочка" ? "danger" : r.status === "Проиграна" ? "neutral" : "info"}
        >
          {r.status}
        </StatusBadge>
      ),
    },
  ];

  return (
    <div>
      <button onClick={onBack} className="mb-3 inline-flex items-center gap-1.5 text-caption text-text-muted hover:text-text-primary">
        <ArrowLeft className="size-3.5" /> К реестру поставщиков
      </button>

      <PageHeader
        title={supplier.name}
        description={supplier.categories.join(" · ")}
        meta={
          <>
            <StatusBadge tone={ratingTone(supplier.rating)}>Рейтинг надёжности {supplier.rating.toFixed(1)} / 5</StatusBadge>
            {supplier.ratingNote && <StatusBadge tone="danger">{supplier.ratingNote}</StatusBadge>}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Контакты">
          <dl className="space-y-2 text-table">
            <div className="flex justify-between gap-3">
              <dt className="text-text-muted">Контактное лицо</dt>
              <dd className="text-text-primary">{supplier.contactPerson}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="inline-flex items-center gap-1.5 text-text-muted">
                <Phone className="size-3.5" /> Телефон
              </dt>
              <dd className="tnum text-text-primary">{supplier.phone}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="inline-flex items-center gap-1.5 text-text-muted">
                <Mail className="size-3.5" /> E-mail
              </dt>
              <dd className="truncate text-text-primary">{supplier.email}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="inline-flex items-center gap-1.5 text-text-muted">
                <Truck className="size-3.5" /> Средний срок
              </dt>
              <dd className="text-text-primary">
                ответ {supplier.avgReplyHours} ч · поставка {supplier.avgDeliveryDays} дн.
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-text-muted">Выполнено заявок</dt>
              <dd className="tnum text-text-primary">{supplier.ordersDone}</dd>
            </div>
          </dl>
        </Panel>

        <Panel title="Рейтинг за 6 месяцев" className="lg:col-span-2">
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={supplier.ratingTrend} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} stroke="var(--color-text-muted)" />
                <YAxis domain={[2, 5]} tickLine={false} axisLine={false} fontSize={12} stroke="var(--color-text-muted)" />
                <RTooltip
                  contentStyle={{
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                />
                <Line type="monotone" dataKey="rating" stroke="var(--color-accent)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel title="История заявок" className="mt-4" bodyClassName="p-0">
        <DataTable
          columns={historyColumns}
          rows={history}
          rowKey={(r) => r.requestId + r.items}
          empty={<EmptyState icon={Users} title="Заявок пока не было" description="История появится после первой заявки поставщику." />}
        />
      </Panel>
    </div>
  );
}
