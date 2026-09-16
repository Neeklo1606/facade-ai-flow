import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, Layers, Moon, PackageCheck, Sun, TriangleAlert } from "lucide-react";
import {
  ConfidenceDot,
  ConfidenceIndicator,
  DataTable,
  EmptyState,
  EntityDrawer,
  ErrorState,
  ExplainPopover,
  FilterBar,
  FilterChip,
  ImpactPreview,
  MetricRing,
  MetricTile,
  PageHeader,
  Panel,
  Skeleton,
  SourceBadge,
  StatusBadge,
  TableSkeleton,
  type Column,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/app-context";

export const Route = createFileRoute("/design-system")({
  head: () => ({
    meta: [
      { title: "Библиотека интерфейса — neeklo FieldOps" },
      {
        name: "description",
        content:
          "Цвета двух тем, типографика, таблицы, бейджи, уверенность, источник, метрики и состояния экранов.",
      },
      { property: "og:title", content: "Библиотека интерфейса — neeklo FieldOps" },
      { property: "og:description", content: "Единая библиотека компонентов и токенов обеих тем." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DesignSystemPage,
});

interface Row {
  id: string;
  zone: string;
  plan: string;
  fact: string;
  status: "ok" | "warn" | "danger";
}

const rows: Row[] = [
  {
    id: "z1",
    zone: "Захватка 1, оси А-Г, этажи 5-8",
    plan: "1 900 м²",
    fact: "1 900 м²",
    status: "ok",
  },
  {
    id: "z2",
    zone: "Захватка 2, оси Г-К, этажи 9-11",
    plan: "2 400 м²",
    fact: "1 846 м²",
    status: "warn",
  },
  {
    id: "z3",
    zone: "Захватка 3, оси К-Р, этажи 12-14",
    plan: "2 100 м²",
    fact: "840 м²",
    status: "danger",
  },
];

const statusLabel: Record<Row["status"], string> = {
  ok: "Подтверждено",
  warn: "Внимание",
  danger: "Критично",
};

const lightTokens = [
  { name: "Фон страницы", value: "#F1F3F4" },
  { name: "Поверхность", value: "#FFFFFF" },
  { name: "Граница", value: "rgba(20,26,30,.08)" },
  { name: "Текст основной", value: "#14191D" },
  { name: "Текст вторичный", value: "#5D6870" },
  { name: "Текст приглушённый", value: "#8C969D" },
  { name: "Акцент", value: "#D75A2A" },
];

const darkTokens = [
  { name: "Фон страницы", value: "#0A0D10" },
  { name: "Оболочка", value: "#11151A" },
  { name: "Карточка", value: "#171C22" },
  { name: "Граница", value: "rgba(255,255,255,.08)" },
  { name: "Текст основной", value: "#F0F3F5" },
  { name: "Текст вторичный", value: "#9CA7B0" },
  { name: "Акцент", value: "#FF7A45" },
];

const statusTokens = [
  { name: "Подтверждено", css: "var(--ok)" },
  { name: "Внимание", css: "var(--warn)" },
  { name: "Критично", css: "var(--danger)" },
  { name: "Система и источник", css: "var(--info)" },
];

function Swatch({ name, value }: { name: string; value: string }) {
  return (
    <li className="flex items-center gap-3">
      <span
        className="size-9 shrink-0 rounded-[var(--r-sm)] border border-border"
        style={{ background: value }}
      />
      <span className="min-w-0">
        <span className="block text-[13px]">{name}</span>
        <span className="block text-caption text-text-muted">{value}</span>
      </span>
    </li>
  );
}

function DesignSystemPage() {
  const { theme, toggleTheme } = useApp();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "open">("all");

  const columns: Column<Row>[] = [
    { key: "zone", header: "Захватка", cell: (r) => r.zone, primary: true },
    { key: "plan", header: "План", cell: (r) => <span className="tnum">{r.plan}</span> },
    {
      key: "fact",
      header: "Факт",
      cell: (r) => (
        <span className="inline-flex items-center gap-1.5">
          <span className="tnum">{r.fact}</span>
          <ConfidenceDot value={r.status === "ok" ? 0.94 : r.status === "warn" ? 0.76 : 0.58} />
        </span>
      ),
    },
    {
      key: "status",
      header: "Состояние",
      cell: (r) => <StatusBadge tone={r.status}>{statusLabel[r.status]}</StatusBadge>,
    },
  ];

  const visible = filter === "all" ? rows : rows.filter((r) => r.status !== "ok");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Библиотека интерфейса"
        description="Токены обеих тем и компоненты, из которых собираются рабочие экраны. Данные синтетические."
        actions={
          <Button variant="secondary" size="sm" onClick={toggleTheme}>
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            {theme === "dark" ? "Светлая тема" : "Тёмная тема"}
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Светлая тема">
          <ul className="space-y-3">
            {lightTokens.map((t) => (
              <Swatch key={t.name} {...t} />
            ))}
          </ul>
        </Panel>
        <Panel title="Тёмная тема">
          <ul className="space-y-3">
            {darkTokens.map((t) => (
              <Swatch key={t.name} {...t} />
            ))}
          </ul>
        </Panel>
        <Panel title="Состояния">
          <ul className="space-y-3">
            {statusTokens.map((t) => (
              <Swatch key={t.name} name={t.name} value={t.css} />
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="Типографика">
        <div className="space-y-3">
          <p className="text-[28px] leading-tight font-semibold">Заголовок страницы, 28 пунктов</p>
          <p className="text-[18px] font-semibold">Заголовок блока, 18 пунктов</p>
          <p className="text-[14px]">
            Основной текст, 14 пунктов. Русский язык, предметные названия строителя.
          </p>
          <p className="text-table">Строка таблицы, 13 пунктов: захватка 2, оси Г-К, этажи 9-11.</p>
          <p className="text-caption text-text-muted">
            Метаданные, 12 пунктов: обновлено вчера в 18:40.
          </p>
        </div>
      </Panel>

      <Panel title="Кнопки">
        <div className="flex flex-wrap items-center gap-2">
          <Button>Подтвердить объём</Button>
          <Button variant="secondary">Открыть источник</Button>
          <Button variant="outline">Вернуть на уточнение</Button>
          <Button variant="ghost">Отмена</Button>
          <Button disabled>Недоступно</Button>
        </div>
        <p className="mt-3 text-caption text-text-muted">
          Оранжевая кнопка на экране одна — она главное действие.
        </p>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Метрики">
          <div className="grid gap-3 sm:grid-cols-2">
            <MetricTile
              icon={Layers}
              label="Выполнено по договору"
              value="68"
              unit="%"
              delta={4}
              deltaText="+4 п.п."
              polarity="higher-better"
              periodLabel="за неделю"
              trend={[52, 55, 58, 60, 63, 65, 68]}
            />
            <MetricTile
              icon={TriangleAlert}
              label="Незакрытый объём"
              value="2,4"
              unit="млн ₽"
              delta={0.3}
              deltaText="+0,3 млн"
              polarity="lower-better"
              tone="danger"
              variant="accent"
              trend={[1.2, 1.5, 1.7, 1.9, 2.1, 2.2, 2.4]}
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-6">
            <MetricRing value={68} caption="Готовность корпуса" ringLabel="%" status="accent" />
            <MetricRing
              value={2}
              max={6}
              caption="Критичных рисков"
              ringLabel="риска"
              status="danger"
              threshold={2}
            />
            <MetricRing
              value={5}
              max={5}
              caption="Поставок в срок"
              ringLabel="из 5"
              status="ok"
              threshold={5}
            />
          </div>
        </Panel>

        <Panel title="Происхождение значения">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[13px]">Выполнено 1 846 м²</span>
              <ExplainPopover
                title="Как получен выполненный объём"
                formula="сумма подтверждённых записей объёмов по захватке 2"
                sources={[
                  { label: "Голосовой отчёт от 05.09", hint: "Прораб Сергеев, Telegram" },
                  { label: "Фотофиксация оси Г-К", hint: "12 снимков, 05.09" },
                ]}
              />
              <SourceBadge
                agent="Разбор отчётов"
                at="2026-09-05T15:10:00Z"
                source="Голосовое сообщение, Telegram"
                confidence={0.76}
              />
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <ConfidenceIndicator value={0.94} />
              <ConfidenceIndicator value={0.76} />
              <ConfidenceIndicator value={0.58} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone="ok">Подтверждено</StatusBadge>
              <StatusBadge tone="warn">Внимание</StatusBadge>
              <StatusBadge tone="danger">Критично</StatusBadge>
              <StatusBadge tone="info">Источник</StatusBadge>
              <StatusBadge tone="neutral">Черновик</StatusBadge>
            </div>
            <ImpactPreview
              changes={[
                {
                  label: "Выполненный объём, захватка 2",
                  before: "370 м²",
                  after: "554 м²",
                  hint: "Из голосового отчёта от 05.09, подтверждает инженер ПТО",
                },
                { label: "Незакрытая стоимость", before: "1,6 млн ₽", after: "2,4 млн ₽" },
              ]}
            />
          </div>
        </Panel>
      </div>

      <Panel title="Реестр" bodyClassName="p-0">
        <FilterBar
          right={
            <Button size="sm" variant="secondary" onClick={() => setDrawerOpen(true)}>
              Открыть карточку
            </Button>
          }
        >
          <FilterChip
            active={filter === "all"}
            count={rows.length}
            onClick={() => setFilter("all")}
          >
            Все захватки
          </FilterChip>
          <FilterChip active={filter === "open"} count={2} onClick={() => setFilter("open")}>
            Требуют внимания
          </FilterChip>
        </FilterBar>
        <DataTable columns={columns} rows={visible} onRowClick={() => setDrawerOpen(true)} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Загрузка" bodyClassName="p-0">
          <TableSkeleton rows={4} />
        </Panel>
        <Panel title="Обработка">
          <div className="space-y-3">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <p className="text-caption text-text-muted">
              Скелетон повторяет геометрию будущего содержимого.
            </p>
          </div>
        </Panel>
        <Panel title="Пусто" bodyClassName="p-0">
          <EmptyState
            icon={Building2}
            variant="empty"
            title="Записей по объекту ещё нет"
            description="Данные появятся, когда прораб пришлёт первый отчёт с площадки."
          />
        </Panel>
        <Panel title="Ошибка" bodyClassName="p-0">
          <ErrorState onRetry={() => undefined} />
        </Panel>
      </div>

      <EntityDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title="Захватка 2, оси Г-К, этажи 9-11"
        subtitle="ЖК «Северная Корона», корпус 3 · договор ДСК-2026/008"
        badges={
          <>
            <StatusBadge tone="warn">Внимание</StatusBadge>
            <ConfidenceIndicator value={0.76} />
          </>
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setDrawerOpen(false)}>
              Закрыть
            </Button>
            <Button onClick={() => setDrawerOpen(false)}>Подтвердить объём</Button>
          </>
        }
      >
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-caption text-text-muted">План</dt>
            <dd className="tnum text-[14px]">2 400 м²</dd>
          </div>
          <div>
            <dt className="text-caption text-text-muted">Факт</dt>
            <dd className="tnum text-[14px]">1 846 м²</dd>
          </div>
          <div>
            <dt className="text-caption text-text-muted">Незакрытый объём</dt>
            <dd className="tnum text-[14px]">554 м²</dd>
          </div>
          <div>
            <dt className="text-caption text-text-muted">Незакрытая стоимость</dt>
            <dd className="tnum text-[14px]">2,4 млн ₽</dd>
          </div>
        </dl>
        <div className="mt-4 flex items-center gap-2 text-[13px] text-text-secondary">
          <PackageCheck className="size-4 text-info" />
          Поставка нащельников подтверждена на 14.09
        </div>
      </EntityDrawer>
    </div>
  );
}
