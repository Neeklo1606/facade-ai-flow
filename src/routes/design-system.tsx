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
import { WidgetGallery } from "@/components/design-system/WidgetGallery";
import { GaikaGallery } from "@/components/design-system/GaikaGallery";
import { ScaleGallery } from "@/components/design-system/ScaleGallery";
import { KitGallery } from "@/components/design-system/KitGallery";
import { GraphiteGallery } from "@/components/design-system/GraphiteGallery";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/design-system")({
  head: () => ({
    meta: [
      { title: "Дизайн-система — гайка" },
      {
        name: "description",
        content: "Палитра, типографика, свет и компоненты дизайн-системы ГАЙКИ, версия 2.",
      },
      { property: "og:title", content: "Дизайн-система — гайка" },
      { property: "og:description", content: "Токены и правила визуального слоя ГАЙКИ." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DesignSystemPage,
});

/*
 * Витрины нет ни в демонстрации, ни в рабочем контуре: в собранном приложении модуль маршрута
 * подменяется заглушкой, и адрес отвечает «Раздел не найден» (vite.config.ts, TASK-A5).
 * Собрать её намеренно: KEEP_DESIGN_SYSTEM=1 bun run build.
 */

/* ---------------------------------------------------------------- Данные витрины */

interface Token {
  name: string;
  value: string;
  note?: string;
}

const palette: { title: string; tokens: Token[] }[] = [
  {
    title: "Поверхности",
    tokens: [
      { name: "--bg", value: "#0A0908", note: "фон окна, тёплый чёрный" },
      { name: "--base", value: "#0F0D0C", note: "оболочка приложения" },
      { name: "--bg-elevated", value: "#131110", note: "карточки" },
      { name: "--bg-raised", value: "#1B1816", note: "вложенные блоки, наведение" },
      { name: "--surface-3", value: "#241F1C", note: "поповеры, активные состояния" },
      { name: "--surface-glass", value: "rgba(255,244,235,.05)", note: "стекло панели и шторки" },
    ],
  },
  {
    title: "Линии",
    tokens: [
      { name: "--line", value: "rgba(255,244,235,.08)" },
      { name: "--line-strong", value: "rgba(255,244,235,.14)" },
      { name: "--line-warm", value: "rgba(217,195,171,.14)" },
    ],
  },
  {
    title: "Текст",
    tokens: [
      { name: "--text", value: "#F7F3EF", note: "основной, тёплый белый" },
      { name: "--text-2", value: "#A8A099", note: "вторичный" },
      { name: "--text-3", value: "#9A918A", note: "подписи; документ давал #6E6761, ниже AA" },
      { name: "--text-4", value: "#3A342F", note: "разделители в тексте" },
      { name: "--on-orange", value: "#FFFFFF", note: "на оранжевой заливке" },
    ],
  },
  {
    title: "Свет",
    tokens: [
      { name: "--ember", value: "#FF7A45", note: "запись, главное действие" },
      { name: "--ember-hot", value: "#FF8F63", note: "наведение" },
      { name: "--ember-deep", value: "#8F1D0B", note: "низ градиента, заливка под белым" },
      { name: "--ember-soft", value: "rgba(255,122,69,.12)", note: "подложка" },
      { name: "--sand", value: "#D9C3AB", note: "ИИ думает" },
      { name: "--sand-soft", value: "rgba(217,195,171,.10)" },
    ],
  },
];

const statuses = [
  { name: "ok", label: "Подтверждено", value: "#6FCF97" },
  { name: "warn", label: "Нужно уточнить", value: "#F2B84B" },
  { name: "danger", label: "Критично", value: "#FF5A5F" },
  { name: "info", label: "Система и источник", value: "#7AA7E8" },
] as const;

const typeScale = [
  { cls: "text-greeting", spec: "40 / 44 / 600 · −0.02em", use: "Приветствие и герой" },
  { cls: "text-page-title", spec: "32 / 36 → 40 / 44 / 600", use: "Заголовок экрана" },
  { cls: "text-metric", spec: "48 / 52 / 600 · tnum", use: "Крупная цифра сводки" },
  { cls: "text-section-title", spec: "24 / 32 / 600", use: "Заголовок секции" },
  { cls: "text-card-title", spec: "20 / 28 / 600", use: "Заголовок карточки" },
  { cls: "text-list", spec: "17 / 24 → 15 / 22 / 500", use: "Строка списка" },
  { cls: "text-body", spec: "17 / 24 → 15 / 22 / 400", use: "Основной текст" },
  { cls: "text-caption", spec: "14 / 20 / 400", use: "Подписи" },
  { cls: "text-table", spec: "13 / 18 / 400", use: "Таблицы, самый плотный текст" },
  { cls: "text-badge", spec: "13 / 18 / 500", use: "Бейджи" },
] as const;

const layers = [
  { token: "--bg", label: "Окно", lift: null },
  { token: "--base", label: "Оболочка", lift: "--lift-3" },
  { token: "--bg-elevated", label: "Карточка", lift: "--lift-1" },
  { token: "--bg-raised", label: "Вложенный блок", lift: "--lift-1" },
  { token: "--surface-3", label: "Поповер", lift: "--lift-2" },
] as const;

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
  const [activeNav, setActiveNav] = useState("materials");

  const navDemo = [
    { key: "documents", label: "Документация", icon: FileText, badge: 0, critical: false },
    { key: "materials", label: "Материалы", icon: Boxes, badge: 535, critical: false },
    { key: "procurement", label: "Закупки", icon: PackageSearch, badge: 2, critical: true },
    { key: "projects", label: "Объекты", icon: Building2, badge: 0, critical: false },
  ];

  return (
    <div className="space-y-12 pb-8">
      <PageHeader
        title="Дизайн-система ГАЙКИ"
        description="Финальный интерфейс (ADR-045): одна шкала, два уровня поверхностей, один акцент на экран. Ниже прежние витрины версии 2 и v3: их приёмы на рабочих экранах отменены. Витрина доступна только в сборке для проверки."
      />
      <ScaleGallery />
      <KitGallery />
      <GaikaGallery />

      {/* ---------------------------------------------------------- Палитра */}
      <Section
        title="Графит"
        caption="ADR-052: токены обеих тем, кнопки во всех состояниях, метки, полоса показателей и панели с данными. Переключите тему, чтобы увидеть светлую."
      >
        <GraphiteGallery />
      </Section>

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
        caption="Golos Text 400, 500, 600 (ADR-052). Цифры одной ширины во всех данных, строчная l с хвостом отличается от I. Вес выше 600 и капса не используются."
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
        caption="--ember-gradient — герой и одна главная карточка. Без зерна градиент выглядит заливкой, с зерном — материалом."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <figure className="space-y-2">
            <div className="bg-ember h-48 rounded-[var(--r-lg)]" />
            <figcaption className="text-caption text-text-3">--ember-gradient без зерна</figcaption>
          </figure>
          <figure className="space-y-2">
            <div className="bg-ember grain h-48 rounded-[var(--r-lg)]" />
            <figcaption className="text-caption text-text-3">
              --ember-gradient + .grain: feTurbulence 0.85, прозрачность 0.04, overlay
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
              className="bg-ember-field absolute -bottom-24 -left-24 size-72 rounded-full opacity-50 blur-[80px]"
            />
            <div className="relative space-y-2">
              <span className="block text-card-title">--ember-field</span>
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
          </Panel>
        </div>
      </Section>

      {/* ---------------------------------------------------------- Виджеты */}
      <Section
        title="Библиотека виджетов"
        caption="Всё из @/components/common. Состояния наведения и фокуса показаны без мыши через data-force."
      >
        <WidgetGallery />
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
