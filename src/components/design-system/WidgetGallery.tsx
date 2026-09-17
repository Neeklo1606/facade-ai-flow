import { useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Boxes,
  CircleCheck,
  Clock,
  FileSpreadsheet,
  FileText,
  Filter,
  Layers,
  MoreHorizontal,
  PackageSearch,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Truck,
  Upload,
} from "lucide-react";
import {
  ConfidenceIndicator,
  CountPill,
  DeltaPill,
  DetailsLayout,
  EmptyState,
  ErrorState,
  Field,
  HeroMetric,
  InsightBlock,
  MetricStrip,
  MetricStripSkeleton,
  NumberValue,
  PillTabs,
  PrimaryCell,
  ProgressBar,
  ProgressCell,
  ProgressRing,
  SourceBadge,
  StatList,
  StatusBadge,
  WidgetCard,
  WidgetCardHeader,
  WidgetTable,
  type Delta,
  type WidgetColumn,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------- Каркас витрины */

function Block({
  title,
  caption,
  children,
}: {
  title: string;
  caption: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-card-title">{title}</h3>
        <p className="mt-1 text-[13px] text-text-2">{caption}</p>
      </div>
      {children}
    </section>
  );
}

/** Подпись состояния под образцом */
function State({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col items-start gap-2", className)}>
      {children}
      <span className="text-[12px] text-text-3">{label}</span>
    </div>
  );
}

/* ---------------------------------------------------------------- Данные витрины */

const better = (text: string, direction: Delta["direction"] = "up"): Delta => ({
  text,
  direction,
  effect: "better",
});
const worse = (text: string, direction: Delta["direction"] = "up"): Delta => ({
  text,
  direction,
  effect: "worse",
});
const flat: Delta = { text: "0", direction: "flat", effect: "neutral" };

interface SupplierRow {
  id: string;
  name: string;
  contact: string;
  amount: string;
  term: string;
  answered: number;
  total: number;
}

const supplierRows: SupplierRow[] = [
  {
    id: "fk",
    name: "Фасад-Комплект",
    contact: "Ирина Лебедева",
    amount: "8 534 400",
    term: "16",
    answered: 12,
    total: 12,
  },
  {
    id: "kt",
    name: "Керамика Трейд",
    contact: "Олег Мартынов",
    amount: "8 668 800",
    term: "24",
    answered: 9,
    total: 12,
  },
  {
    id: "sk",
    name: "СтройКомплект",
    contact: "Анна Сорокина",
    amount: "—",
    term: "—",
    answered: 3,
    total: 12,
  },
];

const noop = () => undefined;

/* ---------------------------------------------------------------- Витрина */

export function WidgetGallery() {
  const [tab, setTab] = useState<"all" | "attention" | "verified">("all");
  const [filter, setFilter] = useState<"ready" | "sent" | "decided">("ready");
  const [switchOn, setSwitchOn] = useState(true);
  // На телефоне панель занимает весь экран — в витрине она открывается по кнопке
  const [panelOpen, setPanelOpen] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
  );
  const [ringKey, setRingKey] = useState(0);

  const columns: WidgetColumn<SupplierRow>[] = [
    {
      key: "name",
      header: "Поставщик",
      cell: (row) => (
        <PrimaryCell title={row.name} caption={row.contact} avatarName={row.contact} />
      ),
    },
    {
      key: "amount",
      header: "Сумма с НДС",
      align: "right",
      cell: (row) => (
        <NumberValue value={row.amount} {...(row.amount !== "—" ? { unit: "₽" } : {})} />
      ),
    },
    {
      key: "term",
      header: "Срок",
      align: "right",
      cell: (row) => (
        <NumberValue value={row.term} {...(row.term !== "—" ? { unit: "дн." } : {})} />
      ),
    },
    {
      key: "answered",
      header: "Ответ по позициям",
      cell: (row) => {
        const ratio = row.answered / row.total;
        const tone = ratio === 1 ? "ok" : ratio >= 0.5 ? "warn" : "danger";
        return (
          <ProgressCell
            value={row.answered}
            max={row.total}
            tone={tone}
            reference={10}
            label={`Ответ по позициям: ${row.answered} из ${row.total}`}
            valueLabel={`${row.answered} из ${row.total}`}
            badge={
              <StatusBadge tone={tone} dot>
                {ratio === 1 ? "Полный" : ratio >= 0.5 ? "Частичный" : "Нет ответа"}
              </StatusBadge>
            }
          />
        );
      },
    },
  ];

  return (
    <div className="space-y-12">
      {/* ------------------------------------------------ Метрики */}
      <Block
        title="Полоса метрик"
        caption="Одна карточка 104px, 4–6 метрик через линии 56px. Цвет дельты — смысл метрики, стрелка — направление величины."
      >
        <MetricStrip
          items={[
            { icon: FileSpreadsheet, label: "Позиций", value: "847", delta: flat },
            { icon: CircleCheck, label: "Проверено", value: "312", delta: better("+48") },
            { icon: AlertTriangle, label: "Просрочено", value: "2", delta: worse("+1") },
            { icon: Clock, label: "Ответ, дн.", value: "3,4", delta: better("−0,8", "down") },
            { icon: Truck, label: "В пути", value: "43", delta: worse("−5", "down") },
          ]}
        />
        <State
          label="Четыре метрики: капсула справа. При пяти-шести узкая ячейка ставит капсулу к значению"
          className="w-full items-stretch"
        >
          <MetricStrip
            items={[
              { icon: FileSpreadsheet, label: "Позиций в спецификации", value: "847", delta: flat },
              { icon: CircleCheck, label: "Проверено позиций", value: "312", delta: better("+48") },
              {
                icon: AlertTriangle,
                label: "Просроченных ответов",
                value: "2",
                delta: worse("+1"),
              },
              { icon: Truck, label: "Поставок в пути", value: "43", delta: worse("−5", "down") },
            ]}
          />
        </State>
        <div className="flex flex-wrap gap-x-8 gap-y-4">
          <State label="Проверено выросло — улучшение">
            <DeltaPill delta={better("+48")} />
          </State>
          <State label="Просрочки выросли — ухудшение">
            <DeltaPill delta={worse("+1")} />
          </State>
          <State label="Срок ответа сократился — улучшение">
            <DeltaPill delta={better("−0,8 дн.", "down")} />
          </State>
          <State label="Поставок в пути меньше — ухудшение">
            <DeltaPill delta={worse("−5", "down")} />
          </State>
          <State label="Без изменений">
            <DeltaPill delta={flat} />
          </State>
        </div>
        <State label="Загрузка" className="w-full items-stretch">
          <MetricStripSkeleton count={5} />
        </State>
      </Block>

      {/* ------------------------------------------------ Главная метрика */}
      <Block
        title="Главная метрика с градиентом"
        caption="Одна на экран. Слои: --ember, зерно, затемнение 18%, контент. Тень --lift-2 и --glow-soft."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <HeroMetric
            label="Проверено позиций спецификации"
            value="312"
            unit="из 847"
            note="До передачи в закупку осталось 535 позиций — 37% готовности"
          />
          <HeroMetric
            label="Экономия по выбранным поставщикам"
            value="1,24"
            unit="млн ₽"
            note="По 4 запросам из 6, относительно средней цены предложений"
          />
        </div>
      </Block>

      {/* ------------------------------------------------ Карточка */}
      <Block
        title="Карточка"
        caption="Отступ 24px, заголовок 32px и 20px до контента. Кликабельная при наведении — граница --line-2 и --lift-2."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <State label="Со счётчиком" className="items-stretch">
            <WidgetCard>
              <WidgetCardHeader
                icon={Boxes}
                title="Материалы"
                hint="по объекту"
                aside={<CountPill>535</CountPill>}
              />
              <StatList
                items={[
                  { label: "Не в работе", value: "27" },
                  { label: "В запросе", value: "123" },
                ]}
              />
            </WidgetCard>
          </State>
          <State label="С кнопкой действия" className="items-stretch">
            <WidgetCard>
              <WidgetCardHeader
                icon={FileText}
                title="Документация"
                hint="Рев. 3"
                aside={
                  <Button variant="ghost" size="sm">
                    Открыть
                  </Button>
                }
              />
              <p className="text-[13px] text-text-2">12 листов, 847 позиций извлечено.</p>
            </WidgetCard>
          </State>
          <State label="Кликабельная: покой, наведение, фокус" className="items-stretch">
            <div className="grid gap-3">
              {([undefined, "hover", "focus"] as const).map((force) => (
                <WidgetCard key={force ?? "rest"} interactive data-force={force} className="p-4">
                  <WidgetCardHeader
                    icon={PackageSearch}
                    title="З-2026/323"
                    hint="ответили 2 из 2"
                    className="mb-0"
                  />
                </WidgetCard>
              ))}
            </div>
          </State>
        </div>
      </Block>

      {/* ------------------------------------------------ Табы */}
      <Block
        title="Табы-пилюли"
        caption="Покой, наведение, активная. Главный фильтр с оранжевой активной пилюлей — один набор на экран. Стрелки ← → переключают."
      >
        <div className="space-y-5">
          <State label="Обычные — работают">
            <PillTabs
              label="Вид проверки"
              value={tab}
              onChange={setTab}
              tabs={[
                { value: "all", label: "Все", count: 847 },
                { value: "attention", label: "Требуют внимания", count: 9 },
                { value: "verified", label: "Проверено", count: 312 },
              ]}
            />
          </State>
          <State label="Состояния: активная, наведение, фокус с клавиатуры, покой">
            <PillTabs
              label="Состояния пилюль"
              value="a"
              onChange={noop}
              tabs={[
                { value: "a", label: "Активная", count: 12 },
                { value: "b", label: "Наведение", count: 4, force: "hover" },
                { value: "c", label: "Фокус", force: "focus" },
                { value: "d", label: "Покой", count: 0 },
              ]}
            />
          </State>
          <State label="Главный фильтр экрана">
            <PillTabs
              variant="primary"
              label="Этап запроса"
              value={filter}
              onChange={setFilter}
              tabs={[
                { value: "ready", label: "Готовы к запросу", count: 27 },
                { value: "sent", label: "Отправлены", count: 5 },
                { value: "decided", label: "Решение принято", count: 3 },
              ]}
            />
          </State>
        </div>
      </Block>

      {/* ------------------------------------------------ Таблица */}
      <Block
        title="Таблица и прогресс в ячейке"
        caption="Шапка 40px, строка 56px, без зебры. Вторая строка показана в состоянии наведения — справа действия. Риска на полосе — эталон 10 из 12."
      >
        <WidgetCard>
          <WidgetCardHeader
            icon={Truck}
            title="Предложения поставщиков"
            hint="З-2026/323"
            aside={<CountPill>3</CountPill>}
          />
          <WidgetTable
            columns={columns}
            rows={supplierRows}
            forceHoverRowId="kt"
            rowActions={(row) => (
              <>
                <Button variant="ghost" size="icon" aria-label={`Написать: ${row.name}`}>
                  <Pencil />
                </Button>
                <Button variant="ghost" size="icon" aria-label={`Ещё действия: ${row.name}`}>
                  <MoreHorizontal />
                </Button>
              </>
            )}
          />
        </WidgetCard>
        <div className="grid gap-6 md:grid-cols-2">
          <State label="Полоса: тона статусов и риска эталона" className="items-stretch">
            <div className="space-y-4">
              <ProgressBar value={100} tone="ok" label="Готово" />
              <ProgressBar value={62} tone="warn" reference={80} label="Отстаёт от плана" />
              <ProgressBar value={18} tone="danger" reference={50} label="Критично" />
              <ProgressBar value={37} tone="accent" label="Проверка спецификации" />
            </div>
          </State>
          <State label="В ячейке: полоса, значение, бейдж" className="items-stretch">
            <ProgressCell
              value={312}
              max={847}
              reference={400}
              tone="warn"
              label="Проверено позиций"
              valueLabel="37%"
              badge={<StatusBadge tone="warn">Отстаёт</StatusBadge>}
            />
          </State>
        </div>
      </Block>

      {/* ------------------------------------------------ Кольцо и список */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Block
          title="Кольцо прогресса"
          caption="132px, дуга 10px, заполнение 700ms один раз при появлении."
        >
          <WidgetCard>
            <div key={ringKey} className="flex flex-wrap items-start justify-around gap-6">
              <ProgressRing value={0} caption="Нет данных" />
              <ProgressRing value={37} display="37" caption="Проверено, %" />
              <ProgressRing value={5} max={5} display="5" caption="Поставок в срок из 5" />
            </div>
            <div className="mt-5 flex justify-center">
              <Button variant="ghost" size="sm" onClick={() => setRingKey((k) => k + 1)}>
                <RotateCcw /> Повторить появление
              </Button>
            </div>
          </WidgetCard>
        </Block>
        <Block
          title="Список показателей"
          caption="Строка 40px, разделителей нет. С точечной линией и без."
        >
          <WidgetCard>
            <StatList
              items={[
                { label: "Договор", value: "ДСК-2026/008" },
                { label: "Объём фасада", value: "12 480 м²" },
                { label: "Поставщиков в работе", value: "4" },
              ]}
            />
            <div className="my-4 h-px bg-line" />
            <StatList
              leader="none"
              items={[
                { label: "Начало работ", value: "12.05.2026" },
                { label: "Окончание", value: "31.03.2027" },
              ]}
            />
          </WidgetCard>
        </Block>
      </div>

      {/* ------------------------------------------------ Бейджи */}
      <Block
        title="Бейджи"
        caption="24px, капсула, 12px/500, без границы. Уверенность — точка и слово, процент в подсказке. Значок источника при наведении синий."
      >
        <WidgetCard className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="ok">Подтверждено</StatusBadge>
            <StatusBadge tone="warn">Внимание</StatusBadge>
            <StatusBadge tone="danger">Просрочено</StatusBadge>
            <StatusBadge tone="info">Отправлен</StatusBadge>
            <StatusBadge tone="neutral">Черновик</StatusBadge>
            <StatusBadge tone="accent">В закупке</StatusBadge>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="ok" dot>
              Полный ответ
            </StatusBadge>
            <StatusBadge tone="warn" dot>
              Частичный
            </StatusBadge>
            <StatusBadge tone="danger" dot>
              Нет ответа
            </StatusBadge>
            <StatusBadge tone="info" dot>
              Ждём ответа
            </StatusBadge>
            <StatusBadge tone="neutral" dot>
              Не начат
            </StatusBadge>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-4">
            <State label="Высокая, 96%">
              <ConfidenceIndicator value={0.96} />
            </State>
            <State label="Средняя, 81%">
              <ConfidenceIndicator value={0.81} />
            </State>
            <State label="Низкая, 58%">
              <ConfidenceIndicator value={0.58} />
            </State>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-4">
            {([undefined, "hover", "focus"] as const).map((force) => (
              <State
                key={force ?? "rest"}
                label={force === "hover" ? "Наведение" : force === "focus" ? "Фокус" : "Источник"}
              >
                <SourceBadge
                  agent="Разбор спецификации"
                  at="2026-09-05T15:10:00"
                  source="Спецификация, лист 84"
                  confidence={0.94}
                  {...(force ? { force } : {})}
                />
              </State>
            ))}
          </div>
        </WidgetCard>
      </Block>

      {/* ------------------------------------------------ Кнопки */}
      <Block
        title="Кнопки"
        caption="Основная одна на экран. Градиентных кнопок нет. Строки: покой, наведение, фокус, недоступна."
      >
        <WidgetCard className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="h-10 border-b border-line text-[12px] text-text-3">
                <th className="font-normal">Состояние</th>
                <th className="font-normal">Основная</th>
                <th className="font-normal">Вторичная</th>
                <th className="font-normal">Призрачная</th>
                <th className="font-normal">Опасная</th>
                <th className="font-normal">Иконочная</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Покой", undefined, false],
                  ["Наведение", "hover", false],
                  ["Фокус", "focus", false],
                  ["Недоступна", undefined, true],
                ] as const
              ).map(([label, force, disabled]) => (
                <tr key={label} className="h-16">
                  <td className="text-[12px] text-text-3">{label}</td>
                  <td>
                    <Button variant="accent" data-force={force} disabled={disabled}>
                      <Plus /> Добавить объект
                    </Button>
                  </td>
                  <td>
                    <Button variant="secondary" data-force={force} disabled={disabled}>
                      Открыть источник
                    </Button>
                  </td>
                  <td>
                    <Button variant="ghost" data-force={force} disabled={disabled}>
                      Отмена
                    </Button>
                  </td>
                  <td>
                    <Button variant="destructive" data-force={force} disabled={disabled}>
                      Исключить
                    </Button>
                  </td>
                  <td>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Фильтры"
                      data-force={force}
                      disabled={disabled}
                    >
                      <Filter />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </WidgetCard>
      </Block>

      {/* ------------------------------------------------ Поля и переключатель */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Block
          title="Поля ввода"
          caption="44px, --surface-2 без границы. Фокус: --surface-3, граница --orange-line, кольцо 3px."
        >
          <WidgetCard className="grid gap-5 sm:grid-cols-2">
            <Field label="Название объекта">
              <Input placeholder="Например, ЖК «Северная Корона»" />
            </Field>
            <Field label="В фокусе" hint="Состояние показано без клавиатуры">
              <Input defaultValue="ДСК-2026/008" data-force="focus" />
            </Field>
            <Field label="Количество" error="Не больше трёх знаков после запятой">
              <Input defaultValue="12,4805" />
            </Field>
            <Field label="Недоступно">
              <Input defaultValue="Москва" disabled />
            </Field>
            <Field label="Причина выбора поставщика" className="sm:col-span-2">
              <Textarea placeholder="Лучшая цена и полный объём" />
            </Field>
          </WidgetCard>
        </Block>
        <Block title="Переключатель" caption="44×26px, бегунок 20px, переход 160ms.">
          <WidgetCard className="space-y-4">
            {(
              [
                ["Работает", switchOn, false, undefined, setSwitchOn],
                ["Выключен", false, false, undefined, undefined],
                ["Включён", true, false, undefined, undefined],
                ["Фокус с клавиатуры", true, false, "focus", undefined],
                ["Недоступен", false, true, undefined, undefined],
              ] as const
            ).map(([label, checked, disabled, force, onChange]) => (
              <label
                key={label}
                className="flex h-10 items-center justify-between gap-4 text-[13px] text-text-2"
              >
                {label}
                <Switch
                  checked={checked}
                  disabled={disabled}
                  data-force={force}
                  onCheckedChange={onChange ?? noop}
                />
              </label>
            ))}
          </WidgetCard>
        </Block>
      </div>

      {/* ------------------------------------------------ Инсайт */}
      <Block
        title="Инсайт-блок"
        caption="--orange-dim, граница --orange-line, зерно. Не чаще одного на экран."
      >
        <InsightBlock
          title="Керамика Трейд третий раз подряд отвечает позже срока"
          text="В двух запросах из трёх предложение пришло после выбора поставщика. Стоит отправлять им запрос на день раньше."
          action={
            <Button variant="ghost" size="sm">
              Подробнее
            </Button>
          }
        />
      </Block>

      {/* ------------------------------------------------ Панель деталей */}
      <Block
        title="Панель деталей"
        caption="480px справа, сжимает контент и не перекрывает его. Esc закрывает. Ниже 1024px — на весь экран."
      >
        <div className="overflow-hidden rounded-[var(--r-lg)] bg-base p-4 shadow-[inset_0_0_0_1px_var(--line)]">
          <DetailsLayout
            open={panelOpen}
            onClose={() => setPanelOpen(false)}
            title="Кронштейн КР-150 оцинкованный"
            subtitle="Позиция 1.1 · лист 84 · 230 шт"
            footer={
              <>
                <Button variant="ghost" onClick={() => setPanelOpen(false)}>
                  Закрыть
                </Button>
                <Button variant="secondary">Исправить</Button>
              </>
            }
            panel={
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone="info" dot>
                    Исправлено
                  </StatusBadge>
                  <ConfidenceIndicator value={0.94} />
                </div>
                <StatList
                  items={[
                    { label: "Материал", value: "сталь 08пс" },
                    { label: "Толщина", value: "2 мм" },
                    { label: "Покрытие", value: "Zn 275 г/м²" },
                    { label: "Количество", value: "230 шт" },
                  ]}
                />
              </div>
            }
          >
            <WidgetCard className="min-h-[340px]">
              <WidgetCardHeader
                icon={Layers}
                title="Позиции листа 84"
                aside={
                  <Button variant="secondary" size="sm" onClick={() => setPanelOpen((v) => !v)}>
                    {panelOpen ? "Скрыть панель" : "Открыть панель"}
                  </Button>
                }
              />
              <StatList
                leader="none"
                items={[
                  { label: "1.1 Кронштейн КР-150, несущий", value: "230 шт" },
                  { label: "1.2 Кронштейн КР-150, опорный", value: "190 шт" },
                  { label: "1.3 Кронштейн КР-150, опорный", value: "160 шт" },
                  { label: "1.4 Кронштейн КР-150, стилобат", value: "110 шт" },
                ]}
              />
            </WidgetCard>
          </DetailsLayout>
        </div>
      </Block>

      {/* ------------------------------------------------ Состояния */}
      <Block
        title="Состояния"
        caption="Скелетон повторяет геометрию карточки. Пусто — с первым действием. Ошибка — человеческим языком и «Повторить»."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <State label="Загрузка" className="items-stretch">
            <WidgetCard aria-busy="true">
              <div className="mb-5 flex h-8 items-center gap-3">
                <span className="skeleton size-[30px] rounded-[var(--r-sm)]" />
                <span className="skeleton h-4 w-32" />
                <span className="skeleton ml-auto h-6 w-10 rounded-full" />
              </div>
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex h-10 items-center justify-between">
                  <span className="skeleton h-3 w-28" />
                  <span className="skeleton h-3 w-12" />
                </div>
              ))}
            </WidgetCard>
          </State>
          <State label="Пусто" className="items-stretch">
            <WidgetCard className="p-0">
              <EmptyState
                icon={Upload}
                title="Документации пока нет"
                description="Загрузите спецификацию — позиции извлекутся автоматически."
                actionLabel="Загрузить документацию"
                onAction={noop}
              />
            </WidgetCard>
          </State>
          <State label="Ошибка" className="items-stretch">
            <WidgetCard className="p-0">
              <ErrorState onRetry={noop} />
            </WidgetCard>
          </State>
        </div>
        <State label="Фокус с клавиатуры: кольцо 2px --orange-line с отступом 2px, мышь его не показывает">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" data-force="focus">
              <Search /> Найти
            </Button>
            <PillTabs
              label="Фокус"
              value="x"
              onChange={noop}
              tabs={[{ value: "x", label: "Вкладка", force: "focus" }]}
            />
          </div>
        </State>
      </Block>
    </div>
  );
}
