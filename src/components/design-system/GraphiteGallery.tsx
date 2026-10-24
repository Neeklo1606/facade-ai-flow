import { ArrowRight, Check, Coins, Mic, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip, type ChipTone } from "@/components/ui/kit/status";
import { BarList, ColumnChart, KpiStrip, Panel, ProgressStack } from "@/components/ui/kit/charts";
import { useGasOverview } from "@/api/gas-overview";

/**
 * Витрина «Графита» (ADR-052): токены обеих тем, кнопки во всех состояниях, метки и данные.
 * Цвета показаны через переменные, а не литералами: значения живут только в styles.css.
 * Числа в графиках — расчёт обзора на демо-данных, а не нарисованные примеры.
 */
const SURFACES = ["rail", "canvas", "panel", "panel-2", "panel-3", "line", "line-2"];
const INKS = ["ink", "ink-2", "ink-3", "accent", "accent-hover", "accent-text", "field-line"];
const TONES = ["mint", "amber", "coral", "sky", "lavender", "periwinkle", "teal", "pink"];
const CHIP_TONES: ChipTone[] = [
  "ok",
  "decide",
  "block",
  "sky",
  "lavender",
  "teal",
  "pink",
  "periwinkle",
  "info",
];

function Swatch({ name }: { name: string }) {
  return (
    <li className="flex items-center gap-3">
      <span
        aria-hidden
        className="size-10 shrink-0 rounded-control border border-line"
        style={{ background: `var(--${name})` }}
      />
      <code className="text-meta text-text-2">--{name}</code>
    </li>
  );
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-meta text-text-3">{title}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

export function GraphiteGallery() {
  const o = useGasOverview();
  return (
    <div className="flex flex-col gap-section">
      <div className="grid gap-block md:grid-cols-3">
        <ul className="flex flex-col gap-2" aria-label="Поверхности">
          {SURFACES.map((n) => (
            <Swatch key={n} name={n} />
          ))}
        </ul>
        <ul className="flex flex-col gap-2" aria-label="Текст и акцент">
          {INKS.map((n) => (
            <Swatch key={n} name={n} />
          ))}
        </ul>
        <ul className="flex flex-col gap-2" aria-label="Тоны данных">
          {TONES.map((n) => (
            <Swatch key={n} name={n} />
          ))}
        </ul>
      </div>

      <div className="surface-1 flex flex-col gap-section p-card">
        <Row title="Главная: обычная, наведение, фокус, нажатие, загрузка, недоступна">
          <Button variant="primary" iconEnd={<ArrowRight />}>
            Подтвердить
          </Button>
          <Button variant="primary" data-force="hover" iconEnd={<ArrowRight />}>
            Подтвердить
          </Button>
          <Button variant="primary" data-force="focus">
            Подтвердить
          </Button>
          <Button variant="primary" loading loadingText="Подтверждаю...">
            Подтвердить
          </Button>
          <Button variant="primary" disabled>
            Подтвердить
          </Button>
        </Row>
        <Row title="Вторичная, тихая, опасная">
          <Button variant="secondary">
            <Plus aria-hidden />
            Добавить
          </Button>
          <Button variant="secondary" data-force="hover">
            Наведение
          </Button>
          <Button variant="quiet">Изменить</Button>
          <Button variant="quiet" data-force="hover">
            Изменить
          </Button>
          <Button variant="destructive">Отклонить</Button>
        </Row>
        <Row title="Иконка 40/44, полевое действие 52, голос 56">
          <Button variant="secondary" size="icon" aria-label="Готово">
            <Check aria-hidden />
          </Button>
          <Button variant="primary" size="field">
            Верно
          </Button>
          <button
            type="button"
            aria-label="Сказать голосом"
            className="grid h-voice w-14 place-items-center rounded-full bg-accent text-on-accent focus-ring press-97"
          >
            <Mic className="size-6" aria-hidden />
          </button>
        </Row>
        <Row title="Метки: фон тон 16 %, текст тоном">
          {CHIP_TONES.map((tone) => (
            <Chip key={tone} tone={tone}>
              {tone}
            </Chip>
          ))}
        </Row>
      </div>

      <KpiStrip
        label="Полоса показателей"
        items={[
          {
            label: "Начислено",
            value: o.kpis.amount.value,
            trend: o.kpis.amount.trend,
            series: "mint",
            note: "План не задан",
          },
          { label: "Время", value: o.kpis.hours.value, trend: o.kpis.hours.trend, series: "sky" },
          {
            label: "Доходность",
            value: o.kpis.rate.value,
            trend: o.kpis.rate.trend,
            series: "lavender",
          },
          { label: "Ждут решения", value: o.kpis.waiting.value, note: o.kpis.waiting.note },
        ]}
      />
      <div className="grid gap-block lg:grid-cols-2">
        <Panel icon={Coins} title="ColumnChart" footer={o.bestDay ?? "Нет данных"}>
          <ColumnChart columns={o.days} label="Начислено по дням" />
        </Panel>
        <Panel title="ProgressStack" footer={`Всего записей: ${o.statusTotal}`}>
          <ProgressStack parts={o.statuses} label="Записи по статусам" />
        </Panel>
        <Panel title="BarList" footer="Пустое состояние ниже">
          <BarList items={o.brigades.slice(0, 3)} empty="Нет данных" />
        </Panel>
        <Panel title="BarList, пусто">
          <BarList items={[]} empty="Подтверждённых начислений нет" />
        </Panel>
      </div>
    </div>
  );
}
