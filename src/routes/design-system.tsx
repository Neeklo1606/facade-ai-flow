import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Boxes,
  Building2,
  FileText,
  PackageSearch,
  Plus,
  Search,
  TriangleAlert,
} from "lucide-react";
import {
  ConfidenceIndicator,
  DataTable,
  EmptyState,
  FilterBar,
  FilterChip,
  PageHeader,
  Panel,
  StatusBadge,
  TableSkeleton,
  type Column,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/design-system")({
  head: () => ({
    meta: [
      { title: "Дизайн-система EMBER — neeklo FieldOps" },
      {
        name: "description",
        content: "Палитра, типографика, фирменный градиент и глубина слоёв дизайн-системы EMBER.",
      },
      { property: "og:title", content: "Дизайн-система EMBER — neeklo FieldOps" },
      { property: "og:description", content: "Токены и правила визуального слоя EMBER." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DesignSystemPage,
});

/* ---------------------------------------------------------------- Данные витрины */

interface Token {
  name: string;
  value: string;
  note?: string;
}

const palette: { title: string; tokens: Token[] }[] = [
  {
    title: "Глубина",
    tokens: [
      { name: "--void", value: "#000000", note: "фон окна" },
      { name: "--base", value: "#0A0A0A", note: "оболочка приложения" },
      { name: "--surface", value: "#121212", note: "карточки" },
      { name: "--surface-2", value: "#1A1A1A", note: "вложенные блоки, наведение" },
      { name: "--surface-3", value: "#242424", note: "поповеры, активные состояния" },
    ],
  },
  {
    title: "Линии",
    tokens: [
      { name: "--line", value: "rgba(255,255,255,.07)" },
      { name: "--line-2", value: "rgba(255,255,255,.12)" },
      { name: "--line-warm", value: "rgba(217,195,171,.14)" },
    ],
  },
  {
    title: "Текст",
    tokens: [
      { name: "--text", value: "#F9F9F9", note: "основной" },
      { name: "--text-2", value: "#A7A7A7", note: "вторичный" },
      { name: "--text-3", value: "#646464", note: "подписи" },
      { name: "--text-4", value: "#333333", note: "разделители в тексте" },
      { name: "--on-orange", value: "#FFFFFF", note: "на оранжевом" },
    ],
  },
  {
    title: "Бренд",
    tokens: [
      { name: "--orange", value: "#E85002", note: "главное действие, активный пункт" },
      { name: "--orange-hot", value: "#F16001", note: "наведение" },
      { name: "--orange-deep", value: "#C10801" },
      { name: "--orange-dim", value: "rgba(232,80,2,.12)" },
      { name: "--orange-line", value: "rgba(232,80,2,.28)" },
      { name: "--sand", value: "#D9C3AB" },
      { name: "--sand-dim", value: "rgba(217,195,171,.10)" },
    ],
  },
];

const statuses = [
  { name: "ok", label: "Подтверждено", value: "#4ADE80" },
  { name: "warn", label: "Внимание", value: "#F5C451" },
  { name: "danger", label: "Критично", value: "#FF5A6E" },
  { name: "info", label: "Система и источник", value: "#6BA5FF" },
] as const;

const typeScale = [
  { cls: "text-greeting", spec: "44 / 1.05 / 600 · −0.025em", use: "Приветствие на экране агента" },
  { cls: "text-page-title", spec: "34 / 1.15 / 600 · −0.025em", use: "Заголовок страницы" },
  { cls: "text-section-title", spec: "20 / 1.25 / 600 · −0.015em", use: "Заголовок секции" },
  { cls: "text-card-title", spec: "16 / 1.35 / 600", use: "Заголовок карточки" },
  { cls: "text-list", spec: "15 / 1.45 / 500", use: "Строка списка" },
  { cls: "text-body", spec: "14 / 1.5 / 400", use: "Основной текст" },
  { cls: "text-table", spec: "13 / 1.45 / 400", use: "Таблицы" },
  { cls: "text-caption", spec: "12 / 1.4 / 400", use: "Подписи, шапки таблиц, группы меню" },
  { cls: "text-badge", spec: "11 / 1.3 / 500", use: "Бейджи" },
] as const;

const layers = [
  { token: "--void", label: "Окно", lift: null },
  { token: "--base", label: "Оболочка", lift: "--lift-3" },
  { token: "--surface", label: "Карточка", lift: "--lift-1" },
  { token: "--surface-2", label: "Вложенный блок", lift: "--lift-1" },
  { token: "--surface-3", label: "Поповер", lift: "--lift-2" },
] as const;

interface Row {
  id: string;
  name: string;
  qty: string;
  confidence: number;
  status: "ok" | "warn" | "danger";
}

const rows: Row[] = [
  {
    id: "1",
    name: "Керамогранит 600×600, антрацит",
    qty: "1 240,000 м²",
    confidence: 0.96,
    status: "ok",
  },
  {
    id: "2",
    name: "Подсистема НВФ, кронштейн 180",
    qty: "3 860 шт.",
    confidence: 0.81,
    status: "warn",
  },
  {
    id: "3",
    name: "Утеплитель минераловатный 100 мм",
    qty: "912,500 м²",
    confidence: 0.62,
    status: "danger",
  },
];

const statusLabel: Record<Row["status"], string> = {
  ok: "Проверено",
  warn: "Проверить",
  danger: "Уточнить",
};

/* ---------------------------------------------------------------- Блоки витрины */

function Section({
  title,
  caption,
  children,
}: {
  title: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-section-title">{title}</h2>
        <p className="mt-1 text-[13px] text-text-2">{caption}</p>
      </div>
      {children}
    </section>
  );
}

function Swatch({ token }: { token: Token }) {
  return (
    <li className="flex items-center gap-3">
      <span
        className="size-10 shrink-0 rounded-[var(--r-sm)] shadow-[inset_0_0_0_1px_var(--line-2)]"
        style={{ background: `var(${token.name})` }}
      />
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-text proportional-nums">
          {token.name}
        </span>
        <span className="block truncate text-caption text-text-3 proportional-nums">
          {token.value}
          {token.note && ` · ${token.note}`}
        </span>
      </span>
    </li>
  );
}

function DesignSystemPage() {
  const [filter, setFilter] = useState<"all" | "open">("all");
  const [activeNav, setActiveNav] = useState("materials");

  const columns: Column<Row>[] = [
    { key: "name", header: "Позиция", cell: (r) => r.name, primary: true },
    { key: "qty", header: "Количество", cell: (r) => <span className="tnum">{r.qty}</span> },
    {
      key: "conf",
      header: "Уверенность",
      cell: (r) => <ConfidenceIndicator value={r.confidence} />,
    },
    {
      key: "status",
      header: "Состояние",
      cell: (r) => <StatusBadge tone={r.status}>{statusLabel[r.status]}</StatusBadge>,
    },
  ];
  const visible = filter === "all" ? rows : rows.filter((r) => r.status !== "ok");

  const navDemo = [
    { key: "documents", label: "Документация", icon: FileText, badge: 0, critical: false },
    { key: "materials", label: "Материалы", icon: Boxes, badge: 535, critical: false },
    { key: "procurement", label: "Закупки", icon: PackageSearch, badge: 2, critical: true },
    { key: "projects", label: "Объекты", icon: Building2, badge: 0, critical: false },
  ];

  return (
    <div className="space-y-12 pb-8">
      <PageHeader
        title="Дизайн-система EMBER"
        description="Одна тёмная тема: пять уровней глубины, свет вместо теней, оранжевый акцент. Градиент — только для главной метрики и свечения, всегда с зерном."
      />

      {/* ---------------------------------------------------------- Палитра */}
      <Section
        title="Палитра"
        caption="Образцы окрашены самими токенами из styles.css — витрина не расходится с кодом."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {palette.map((group) => (
            <Panel key={group.title} title={group.title}>
              <ul className="space-y-3">
                {group.tokens.map((token) => (
                  <Swatch key={token.name} token={token} />
                ))}
              </ul>
            </Panel>
          ))}
        </div>
        <Panel title="Статусы">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {statuses.map((status) => (
              <div
                key={status.name}
                className="flex flex-col items-start gap-3 rounded-[var(--r-sm)] p-4"
                style={{ background: `var(--${status.name}-bg)` }}
              >
                <StatusBadge tone={status.name}>{status.label}</StatusBadge>
                <span className="block text-card-title" style={{ color: `var(--${status.name})` }}>
                  {status.value}
                </span>
                <span className="block text-caption text-text-3 proportional-nums">
                  --{status.name} · фон --{status.name}-bg, 10%
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </Section>

      {/* ---------------------------------------------------------- Типографика */}
      <Section
        title="Типографика"
        caption="Inter 400, 500, 600. Цифры одной ширины во всех данных; в заголовках знаки пропорциональные — в Inter признак tnum расширяет и дефис. Вес выше 600 и капса не используются."
      >
        <Panel bodyClassName="p-0">
          <ul className="divide-y divide-line">
            {typeScale.map((item) => (
              <li
                key={item.cls}
                className="grid gap-2 px-5 py-4 md:grid-cols-[220px_minmax(0,1fr)] md:items-baseline md:gap-6"
              >
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-text">{item.use}</span>
                  <span className="block text-caption text-text-3">
                    .{item.cls} · {item.spec}
                  </span>
                </span>
                <span className={cn(item.cls, "min-w-0 truncate")}>
                  {item.cls === "text-greeting"
                    ? "Добрый день, Игорь"
                    : item.cls === "text-badge"
                      ? "535 непроверенных"
                      : "Корона · 847 позиций, проверено 312"}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Цифры одной ширины">
          <div className="grid gap-1 text-table sm:max-w-sm">
            {["1 111,000", "8 888,500", "4 070,125"].map((n) => (
              <div
                key={n}
                className="flex justify-between border-b border-line py-1.5 last:border-0"
              >
                <span className="text-text-2">Количество, м²</span>
                <span className="text-text">{n}</span>
              </div>
            ))}
          </div>
        </Panel>
      </Section>

      {/* ---------------------------------------------------------- Градиент */}
      <Section
        title="Фирменный градиент"
        caption="--ember — только главная метрика и свечение агента. Без зерна градиент выглядит заливкой, с зерном — материалом."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <figure className="space-y-2">
            <div className="bg-ember h-48 rounded-[var(--r-lg)]" />
            <figcaption className="text-caption text-text-3">--ember без зерна</figcaption>
          </figure>
          <figure className="space-y-2">
            <div className="bg-ember grain h-48 rounded-[var(--r-lg)]" />
            <figcaption className="text-caption text-text-3">
              --ember + .grain: feTurbulence 0.85, прозрачность 0.04, overlay
            </figcaption>
          </figure>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="bg-ember grain flex min-h-56 flex-col justify-between overflow-hidden rounded-[var(--r-lg)] p-6">
            <span className="relative z-[2] text-[13px] text-white/80">
              Главная метрика объекта
            </span>
            <span className="relative z-[2]">
              <span className="block text-[64px] leading-none font-semibold tracking-[-0.025em] text-white">
                312 <span className="text-[28px] text-white/70">из 847</span>
              </span>
              <span className="mt-2 block text-[14px] text-white/80">
                позиций спецификации проверено
              </span>
            </span>
          </div>
          <div className="relative overflow-hidden rounded-[var(--r-lg)] bg-surface p-6">
            <div
              aria-hidden
              className="bg-ember-soft absolute -bottom-24 -left-24 size-72 rounded-full opacity-50 blur-[80px]"
            />
            <div className="relative space-y-2">
              <span className="block text-card-title">--ember-soft</span>
              <p className="text-[13px] text-text-2">
                Мягкая версия градиента — фоновое свечение окна: 50vw, blur 180px, прозрачность 0.5,
                левый нижний угол. Здесь показано в уменьшенном виде.
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* ---------------------------------------------------------- Глубина */}
      <Section
        title="Глубина слоёв"
        caption="Пять уровней с минимальной разницей. Разделяют свет сверху (--lift) и радиус, а не тени и рамки."
      >
        <div className="rounded-[var(--r-xl)] bg-void p-4 shadow-[inset_0_0_0_1px_var(--line)] md:p-6">
          <LayerStack index={1} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { name: "--lift-1", note: "карточки" },
            { name: "--lift-2", note: "выпадающие" },
            { name: "--lift-3", note: "оболочка, диалоги" },
            { name: "--glow-orange", note: "активный пункт, главное действие" },
            { name: "--glow-soft", note: "свечение агента" },
          ].map((item) => (
            <div key={item.name} className="space-y-3">
              <div
                className={cn(
                  "grid h-24 place-items-center rounded-[var(--r-md)]",
                  item.name.startsWith("--glow") ? "bg-orange text-on-orange" : "bg-surface-2",
                )}
                style={{ boxShadow: `var(${item.name})` }}
              >
                <span className="text-caption">{item.name}</span>
              </div>
              <p className="text-caption text-text-3">{item.note}</p>
            </div>
          ))}
        </div>
        <Panel title="Радиусы">
          <div className="flex flex-wrap items-end gap-4">
            {["--r-sm", "--r-md", "--r-lg", "--r-xl", "--r-pill"].map((r) => (
              <div key={r} className="space-y-2 text-center">
                <div className="h-16 w-24 bg-surface-3" style={{ borderRadius: `var(${r})` }} />
                <span className="block text-caption text-text-3">{r}</span>
              </div>
            ))}
          </div>
        </Panel>
      </Section>

      {/* ---------------------------------------------------------- Оболочка */}
      <Section
        title="Элементы оболочки"
        caption="Состояния пункта меню, бейджи, поиск, иконочные кнопки и главное действие шапки."
      >
        <div className="grid gap-4 lg:grid-cols-[288px_minmax(0,1fr)]">
          <Panel title="Меню" bodyClassName="p-3">
            <div className="nav-group-label pt-1">Работа</div>
            <ul className="space-y-1">
              {navDemo.map((item) => (
                <li key={item.key}>
                  <button
                    type="button"
                    data-active={activeNav === item.key}
                    onClick={() => setActiveNav(item.key)}
                    className="nav-item focus-ring w-full transition-fast"
                  >
                    <item.icon strokeWidth={1.5} />
                    <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
                    {item.badge > 0 && (
                      <span className={cn("nav-badge", item.critical && "nav-badge-critical")}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-3 px-3 text-caption text-text-3">
              Покой — --text-2, наведение — --surface-2, активный — оранжевая заливка и свечение.
            </p>
          </Panel>
          <Panel title="Шапка контента">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="header-search">
                <Search strokeWidth={1.5} />
                <span className="flex-1">Поиск по объектам</span>
                <kbd className="kbd">Ctrl K</kbd>
              </div>
              <button type="button" className="icon-button focus-ring" aria-label="Предупреждения">
                <TriangleAlert strokeWidth={1.5} />
              </button>
              <button type="button" className="btn-primary focus-ring">
                <Plus className="size-4" /> Добавить объект
              </button>
              <span className="avatar">СИ</span>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Button variant="accent">Главное действие</Button>
              <Button>Подтвердить</Button>
              <Button variant="secondary">Открыть источник</Button>
              <Button variant="outline">Вернуть на проверку</Button>
              <Button variant="ghost">Отмена</Button>
              <Button disabled>Недоступно</Button>
            </div>
            <p className="mt-3 text-caption text-text-3">
              Оранжевая кнопка на экране одна — она главное действие.
            </p>
          </Panel>
        </div>
        <Panel title="Реестр" bodyClassName="p-0">
          <FilterBar>
            <FilterChip
              active={filter === "all"}
              count={rows.length}
              onClick={() => setFilter("all")}
            >
              Все позиции
            </FilterChip>
            <FilterChip active={filter === "open"} count={2} onClick={() => setFilter("open")}>
              Требуют проверки
            </FilterChip>
          </FilterBar>
          <DataTable columns={columns} rows={visible} />
        </Panel>
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Загрузка" bodyClassName="p-0">
            <TableSkeleton rows={3} />
          </Panel>
          <Panel title="Пусто" bodyClassName="p-0">
            <EmptyState
              icon={Building2}
              variant="empty"
              title="Записей по объекту ещё нет"
              description="Данные появятся, когда прораб пришлёт первый отчёт с площадки."
            />
          </Panel>
        </div>
      </Section>
    </div>
  );
}

/** Вложенные уровни глубины: каждый следующий внутри предыдущего */
function LayerStack({ index }: { index: number }) {
  const layer = layers[index];
  if (!layer) return null;
  return (
    <div
      className="rounded-[var(--r-lg)] p-4 md:p-5"
      style={{
        background: `var(${layer.token})`,
        boxShadow: layer.lift ? `var(${layer.lift})` : undefined,
      }}
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-[13px] font-medium text-text">{layer.label}</span>
        <span className="text-caption text-text-3">
          {layer.token}
          {layer.lift && ` · ${layer.lift}`}
        </span>
      </div>
      {index < layers.length - 1 ? (
        <LayerStack index={index + 1} />
      ) : (
        <p className="text-caption text-text-2">Верхний уровень: поповеры и выпадающие списки.</p>
      )}
    </div>
  );
}
