import { useState } from "react";
import { Inbox, Plus, Search, Trash2 } from "lucide-react";
import { useGasOverview } from "@/api/gas-overview";
import {
  Button,
  Card,
  ConfirmDialog,
  DataView,
  DateStrip,
  DeltaChip,
  DetailPanel,
  EmptyState,
  ErrorState,
  FormField,
  MetricCard,
  MetricRow,
  NumberStepper,
  OfflineBadge,
  SegmentedPills,
  SelectSheet,
  ShareBar,
  Skeleton,
  StatusChip,
  Stepper,
  TimeChips,
  Timeline,
  Toggle,
  toastUndo,
} from "@/components/ui/mono";
import { TimeChart } from "@/components/ui/mono/time-chart";
import { chartPoints, deltaOf, formatRub } from "@/lib/ui/mono-logic";

/**
 * Витрина компонентов «Монохрома» (ADR-055, S3). Числа показателей, графика и долей —
 * расчёт обзора на демо-данных контура газа, а не нарисованные примеры. Прошлой недели
 * в демо-данных нет, поэтому сравнение на графике выключено, а метки изменения ниже
 * подписаны как примеры состояний.
 */

const PERIODS = [
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "quarter", label: "Квартал" },
  { value: "custom", label: "Свой" },
] as const;

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="type-small text-ink-3">{title}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

export function MonoKitGallery() {
  const o = useGasOverview();
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["value"]>("week");
  const [compare, setCompare] = useState(false);
  const [people, setPeople] = useState(4);
  const [object, setObject] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>("08:00");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  // Неделя демо-данных Пн-Сб; воскресенья в данных нет — на графике разрыв, а не ноль
  const points = chartPoints(
    [...o.days.map((d) => d.label), "Вс"],
    [...o.days.map((d) => d.value), null],
  );
  const top = o.brigades;
  const opened = o.brigades.find((b) => b.id === open) ?? null;

  return (
    <div className="flex flex-col gap-section rounded-surface bg-canvas p-card">
      <Row title="Кнопки: главная, вторичная, тихая, опасная, иконка; полевая 52; выключенная">
        <Button>Подтвердить</Button>
        <Button variant="secondary">Выгрузить Excel</Button>
        <Button variant="quiet">Отменить</Button>
        <Button variant="danger">Удалить</Button>
        <Button variant="icon" aria-label="Добавить">
          <Plus aria-hidden />
        </Button>
        <Button field>Внести время</Button>
        <Button disabled>Нет прав</Button>
      </Row>

      <Row title="Сегменты, переключатель, метки статуса и изменения">
        <SegmentedPills label="Период" options={PERIODS} value={period} onChange={setPeriod} />
        <Toggle label="Сравнить с прошлым периодом" checked={compare} onChange={setCompare} />
        <StatusChip tone="up">Подтверждено</StatusChip>
        <StatusChip tone="caution">Ждёт проверки</StatusChip>
        <StatusChip tone="down">Отклонено</StatusChip>
        <StatusChip tone="note">Уточнение</StatusChip>
        <StatusChip tone="neutral">Черновик</StatusChip>
      </Row>

      <Row title="Метка изменения по смыслу — примеры состояний, не данные">
        <DeltaChip delta={deltaOf(112, 100)!} />
        <DeltaChip delta={deltaOf(96, 100)!} />
        <DeltaChip delta={deltaOf(112, 100, "down")!} />
        <DeltaChip delta={deltaOf(100, 100)!} />
      </Row>

      <MetricRow label="Показатели недели">
        <MetricCard
          inverse
          label="Начислено"
          value={o.totalAmountRub}
          format={(v) => formatRub(v)}
          spark={o.kpis.amount.trend}
          note="Прошлой недели в данных нет"
          revealKey="ds:amount"
        />
        <MetricCard
          label="Эффективное время"
          value={null}
          text={o.kpis.hours.value}
          note="от минут"
          spark={o.kpis.hours.trend}
          revealKey="ds:hours"
        />
        <MetricCard
          label="Доходность часа"
          value={null}
          text={o.kpis.rate.value}
          note="за неделю"
          spark={o.kpis.rate.trend}
          revealKey="ds:rate"
        />
        <MetricCard
          label="Ждут решения"
          value={Number.parseInt(o.kpis.waiting.value, 10) || 0}
          note={o.kpis.waiting.note}
          revealKey="ds:waiting"
        />
      </MetricRow>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card title="Начислено по дням" action={<span className="type-small text-ink-3">₽</span>}>
          <TimeChart
            label="Начислено по дням недели, демо-данные"
            points={points}
            format={(v) => (v >= 1000 ? `${Math.round(v / 1000)} т` : String(v))}
            compare={compare}
            revealKey="ds:chart"
          />
        </Card>
        <Card title="Доли бригад">
          <ShareBar
            label="Доли начисления по бригадам"
            items={top.map((b) => ({
              key: b.id,
              label: b.label,
              note: b.meta,
              value: b.value,
              amount: b.text,
            }))}
          />
        </Card>
      </div>

      <Card
        title="Таблица и строки одним API"
        action={<span className="type-small text-ink-3">J K Enter Esc X</span>}
      >
        <DataView
          label="Бригады недели"
          rows={o.brigades}
          rowId={(b) => b.id}
          columns={[
            { key: "name", header: "Бригада", cell: (b) => b.label },
            { key: "meta", header: "Состав и часы", cell: (b) => b.meta },
            { key: "sum", header: "Начислено", cell: (b) => b.text, align: "end" },
          ]}
          title={(b) => b.label}
          meta={(b) => b.meta}
          aside={(b) => b.text}
          openId={open}
          onOpen={setOpen}
          selected={selected}
          onSelectedChange={setSelected}
          batch={(ids) => (
            <Button
              variant="secondary"
              className="bg-card"
              onClick={() => {
                const before = new Set(ids);
                setSelected(new Set());
                toastUndo(`Отмечено бригад: ${before.size}`, () => setSelected(before));
              }}
            >
              Снять отметку
            </Button>
          )}
        />
        <DetailPanel
          open={!!opened}
          onOpenChange={(next) => (next ? null : setOpen(null))}
          eyebrow="Бригада"
          title={opened?.label ?? ""}
          actions={<Button onClick={() => setOpen(null)}>Готово</Button>}
        >
          <p className="type-text text-ink-2">{opened?.meta}</p>
          <p className="mt-3 type-kpi">{opened?.text}</p>
        </DetailPanel>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Поля">
          <div className="flex flex-col gap-4">
            <FormField label="Комментарий" hint="Увидит менеджер при проверке">
              {(props) => (
                <input
                  {...props}
                  className="mono-input focus-ring"
                  placeholder="Например, задержка у заказчика"
                />
              )}
            </FormField>
            <FormField label="Минуты" error="Окончание раньше начала">
              {(props) => <input {...props} className="mono-input focus-ring" defaultValue="−30" />}
            </FormField>
            <SelectSheet
              label="Объект"
              value={object}
              onChange={setObject}
              options={o.costs.slice(0, 6).map((c) => ({ value: c.label, label: c.label }))}
            />
            <NumberStepper
              label="Людей на смене"
              unit="чел."
              value={people}
              onChange={setPeople}
              min={1}
              max={30}
            />
          </div>
        </Card>
        <Card title="Неделя и время">
          <div className="flex flex-col gap-4">
            <DateStrip
              days={o.days.map((d) => ({
                date: d.key,
                weekday: d.label.slice(0, 2),
                day: d.key.slice(8, 10),
              }))}
              value={day}
              onChange={setDay}
              allLabel="Неделя"
            />
            <TimeChips
              label="Начало"
              slots={["07:00", "07:30", "08:00", "08:30", "09:00", "09:30"]}
              busy={["07:30"]}
              value={time}
              onPick={setTime}
            />
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Шаги процесса">
          <Stepper
            label="Путь записи"
            steps={[
              { key: "in", label: "Внесено", note: "Бригадир", state: "done" },
              { key: "check", label: "Проверка", note: "Менеджер", state: "current" },
              { key: "report", label: "В отчёте", state: "todo" },
            ]}
          />
        </Card>
        <Card title="История изменений">
          <Timeline
            label="История записи"
            events={[
              {
                id: "2",
                at: "Пример",
                who: "Менеджер",
                what: "Исправил окончание",
                change: "14:00 → 14:30",
                reason: "Бригада задержалась у котла",
              },
              { id: "1", at: "Пример", who: "Бригадир", what: "Внёс запись в боте" },
            ]}
          />
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <EmptyState
          icon={Inbox}
          title="Проверять нечего"
          text="Новые записи бригадиров появятся здесь."
          action={
            <Button variant="secondary">
              <Search aria-hidden />
              Открыть журнал
            </Button>
          }
        />
        <Skeleton label="Загрузка записей" />
        <ErrorState what="записи" onRetry={() => undefined} />
      </div>

      <Row title="Где запись, тост с отменой 6 секунд, подтверждение только необратимого">
        <OfflineBadge state="local" />
        <OfflineBadge state="server" />
        <Button
          variant="secondary"
          onClick={() => toastUndo("Запись подтверждена", () => undefined)}
        >
          Показать тост
        </Button>
        <Button variant="danger" onClick={() => setConfirm(true)}>
          <Trash2 aria-hidden />
          Удалить версию сметы
        </Button>
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          title="Удалить версию сметы?"
          text="Версия и её разбор удалятся без возможности вернуть. Записи останутся."
          confirm="Удалить"
          onConfirm={() => setConfirm(false)}
        />
      </Row>
    </div>
  );
}
