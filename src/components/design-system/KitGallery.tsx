/**
 * Витрина компонентов финального интерфейса (ADR-045, раздел 4) для приёмки: каждый
 * компонент во всех состояниях (обычное, нажатие, фокус, недоступно, загрузка, ошибка, пусто).
 * Нажатие и фокус показаны атрибутом data-force: это те же стили, что у живого касания.
 */
import { useState, type ReactNode } from "react";
import {
  CalendarDays,
  Clock,
  Inbox,
  MapPin,
  MoreHorizontal,
  Search,
  Users,
  Wallet,
} from "lucide-react";
import {
  Button,
  CalendarSheet,
  Chip,
  ChipRow,
  DataTable,
  EmptyBlock,
  ErrorBlock,
  Field,
  FieldGroup,
  FieldRow,
  FiltersButton,
  FiltersSheet,
  HintRow,
  IconButton,
  ListGroup,
  ListRow,
  MetricCard,
  NothingFound,
  OfflineBar,
  PickerSheet,
  ScrollTabs,
  SearchBar,
  Segmented,
  Sheet,
  SidePanel,
  SkeletonCards,
  SkeletonRows,
  SourceWord,
  StageList,
  StatusDot,
  TimeChips,
  WeekStrip,
  notify,
  type EntryStatus,
} from "@/components/ui/kit";
import { timeSlots } from "@/lib/ui/kit-logic";

function Block({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="surface-1 p-card" data-kit-block={title}>
      <h3 className="text-heading">{title}</h3>
      {note ? <p className="mt-1 text-meta text-text-3">{note}</p> : null}
      <div className="mt-block flex flex-col gap-block">{children}</div>
    </section>
  );
}

function State({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-meta text-text-3">{label}</span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

const DAYS = [
  { date: "2026-09-28", weekday: "Пн", day: "28", count: 18 },
  { date: "2026-09-29", weekday: "Вт", day: "29", count: 17 },
  { date: "2026-09-30", weekday: "Ср", day: "30", count: 16 },
  { date: "2026-10-01", weekday: "Чт", day: "1", count: 17 },
  { date: "2026-10-02", weekday: "Пт", day: "2", count: 16 },
  { date: "2026-10-03", weekday: "Сб", day: "3", count: 18 },
  { date: "2026-10-04", weekday: "Вс", day: "4", count: 0 },
];

const OBJECTS = [
  { value: "ob-200", label: "ст. Петровская, ул. Демо, 200 - котел", meta: "Бригада 1" },
  { value: "ob-101", label: "ст. Петровская, ул. Демо, 101 - котел", meta: "Бригада 1" },
  { value: "ob-102", label: "г. Славянск н/К, ул. Демо, 102 - котел, насос", meta: "Бригада 2" },
  { value: "ob-8", label: "г. Славянск н/К, ул. Демо, 8 - котел", meta: "Бригада 2" },
];

interface Row {
  id: string;
  number: string;
  brigade: string;
  object: string;
  hours: string;
  sum: string;
  status: EntryStatus;
}

const ROWS: Row[] = [
  {
    id: "1",
    number: "ГЗ-00095",
    brigade: "Бригада 1",
    object: "ст. Петровская, ул. Демо, 101 - котел",
    hours: "2,50",
    sum: "14 700 ₽",
    status: "pending",
  },
  {
    id: "2",
    number: "ГЗ-00096",
    brigade: "Бригада 2",
    object: "г. Славянск н/К, ул. Демо, 102 - котел, насос",
    hours: "7,75",
    sum: "19 950 ₽",
    status: "ok",
  },
  {
    id: "3",
    number: "ГЗ-00098",
    brigade: "Бригада 3",
    object: "ст. Петровская, ул. Демо, 79 - котел",
    hours: "8,00",
    sum: "18 375 ₽",
    status: "clarify",
  },
];

export function KitGallery() {
  const [seg, setSeg] = useState<"customer" | "analytics">("customer");
  const [tab, setTab] = useState("pending");
  const [query, setQuery] = useState("");
  const [day, setDay] = useState<string | null>("2026-10-03");
  const [time, setTime] = useState<string | null>("12:00");
  const [amount, setAmount] = useState("14 700");
  const [end, setEnd] = useState("11:00");
  const [sheet, setSheet] = useState(false);
  const [picker, setPicker] = useState(false);
  const [object, setObject] = useState<string | null>("ob-200");
  const [filters, setFilters] = useState(false);
  const [calendar, setCalendar] = useState(false);
  const [panel, setPanel] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  return (
    <div className="flex flex-col gap-section" data-testid="kit-gallery">
      <header>
        <p className="text-meta text-text-3">ADR-045 · раздел 4 · компоненты</p>
        <h2 className="text-title">Компоненты</h2>
        <p className="mt-1 text-body text-text-2">
          Экраны собираются только из них. Нажатие и фокус показаны так же, как при живом касании.
        </p>
      </header>

      <Block title="Кнопки" note="Главная 48 одна на экран, остальные 44, иконка 40 с областью 44">
        <State label="Обычное">
          <Button variant="primary" size="lg">
            Подтвердить
          </Button>
          <Button variant="outline">На уточнение</Button>
          <Button variant="quiet">Изменить</Button>
          <Button variant="destructive">Отклонить</Button>
          <IconButton label="Ещё действия">
            <MoreHorizontal aria-hidden />
          </IconButton>
        </State>
        <State label="Нажатие">
          <Button variant="primary" size="lg" data-force="press">
            Подтвердить
          </Button>
          <Button variant="outline" data-force="press">
            На уточнение
          </Button>
        </State>
        <State label="Фокус">
          <Button variant="primary" size="lg" data-force="focus">
            Подтвердить
          </Button>
          <Button variant="outline" data-force="focus">
            На уточнение
          </Button>
        </State>
        <State label="Недоступно, причина рядом">
          <Button variant="primary" size="lg" disabled>
            Отклонить запись
          </Button>
          <span className="text-meta text-text-3">Выберите причину</span>
        </State>
        <State label="Загрузка: подпись процесса, ширина не прыгает">
          <Button variant="primary" size="lg" loading loadingText="Подтверждаю...">
            Подтвердить
          </Button>
          <Button variant="outline" loading loadingText="Готовлю файл...">
            Выгрузить Excel
          </Button>
        </State>
        <State label="Полевое действие прораба 56">
          <Button variant="primary" size="field">
            Верно
          </Button>
        </State>
      </Block>

      <Block title="Поля ввода" note="48, подпись над полем, ошибка после выхода из поля">
        <Field
          label="Сумма работ"
          value={amount}
          onChange={setAmount}
          inputMode="decimal"
          unit="₽"
          hint="Стоимость работ объекта без материалов"
        />
        <Field
          label="Окончание"
          value={end}
          onChange={setEnd}
          inputMode="numeric"
          placeholder="ЧЧ:ММ"
          error="Окончание раньше начала"
          showError
        />
        <Field
          label="Комментарий"
          value=""
          onChange={() => undefined}
          disabled
          placeholder="Недоступно"
        />
      </Block>

      <Block title="Статусы и метки" note="Точка 8 и слово. Метки 24, не больше двух и «+N»">
        <div className="flex flex-col gap-2 text-meta text-text-2">
          {(["pending", "ok", "clarify", "rejected", "draft"] as const).map((s) => (
            <StatusDot key={s} status={s} />
          ))}
        </div>
        <State label="Метки по тону">
          <Chip tone="block">Пересечение времени</Chip>
          <Chip tone="decide">Нет суммы</Chip>
          <Chip tone="info">Объект на несколько дней</Chip>
        </State>
        <State label="Пять признаков одной строкой">
          <ChipRow
            onMore={() => notify("Полный список признаков в карточке записи")}
            chips={[
              { label: "Пересечение времени", tone: "block" },
              { label: "Нет суммы", tone: "decide" },
              { label: "Вчерашняя запись", tone: "decide" },
              { label: "Введено вручную", tone: "decide" },
              { label: "Объект на несколько дней", tone: "info" },
            ]}
          />
        </State>
        <State label="Активный фильтр с крестиком, источник данных">
          <Chip tone="neutral" onRemove={() => undefined}>
            Бригада 2
          </Chip>
          <span className="text-body tnum">14 700 ₽</span>
          <SourceWord source="demo" />
        </State>
      </Block>

      <Block
        title="Сегменты и вкладки"
        note="Сегмент до трёх вариантов; вкладки прокручиваются с затуханием"
      >
        <Segmented
          label="Вид отчёта"
          value={seg}
          onChange={setSeg}
          options={[
            { value: "customer", label: "Формат заказчика" },
            { value: "analytics", label: "Аналитика" },
          ]}
        />
        <ScrollTabs
          label="Статус"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "pending", label: "Ожидает проверки", count: 6 },
            { value: "clarify", label: "Требует уточнения", count: 1 },
            { value: "draft", label: "Черновик", count: 2 },
            { value: "ok", label: "Подтверждено", count: 92 },
            { value: "rejected", label: "Отклонено", count: 1 },
          ]}
        />
      </Block>

      <Block title="Поиск и фильтры" note="Поиск 44 с задержкой 200 мс, фильтры шторкой">
        <SearchBar
          label="Поиск по журналу"
          value={query}
          onChange={setQuery}
          placeholder="Номер, объект, бригада"
        />
        <div className="flex items-center gap-2">
          <FiltersButton active={2} onClick={() => setFilters(true)} />
          <FiltersButton active={0} onClick={() => setFilters(true)} />
        </div>
        <NothingFound query="ул. Лесная" onReset={() => setQuery("")} />
      </Block>

      <Block title="Дата и время" note="Полоса недели 44, кнопки времени 48, занятые с подписью">
        <div className="overflow-x-auto">
          <WeekStrip
            days={DAYS}
            value={day}
            today="2026-10-03"
            onChange={setDay}
            allLabel="Неделя"
          />
        </div>
        <TimeChips
          label="Во сколько начали"
          slots={timeSlots("07:00", "12:00")}
          busy={["08:30", "09:00"]}
          value={time}
          onPick={setTime}
          other={() => notify("Поле с маской ЧЧ:ММ")}
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setCalendar(true)}>
            <CalendarDays aria-hidden />
            Календарь
          </Button>
          <Button variant="outline" onClick={() => setPicker(true)}>
            <MapPin aria-hidden />
            Выбрать объект
          </Button>
        </div>
      </Block>

      <Block title="Строки списка" note="Две строки от 64, одна строка 52, вся строка нажимается">
        <ListGroup title="Сб 03.10 · 18 записей" aside="312 450 ₽" sticky>
          <li>
            <ListRow
              title="ст. Петровская, ул. Демо, 101 - котел"
              status="pending"
              meta="Бригада 1 · 12:00-14:30 · 2,50 ч"
              value="14 700 ₽"
              valueMeta="5 880 ₽/ч"
              chips={
                <ChipRow
                  chips={[
                    { label: "Пересечение времени", tone: "block" },
                    { label: "Нет суммы", tone: "decide" },
                    { label: "Вчерашняя запись", tone: "decide" },
                  ]}
                />
              }
              onClick={() => setSheet(true)}
            />
          </li>
          <li>
            <ListRow
              title="г. Славянск н/К, ул. Демо, 102 - котел, насос"
              status="ok"
              meta="Бригада 2 · 08:00-16:30 · 7,75 ч"
              value="19 950 ₽"
              valueMeta="ГЗ-00096 · Демо"
              onClick={() => setPanel(true)}
            />
          </li>
          <li>
            <ListRow
              title="ст. Петровская, ул. Демо, 79 - котел"
              status="clarify"
              meta="Бригада 3 · 08:00-16:00 · 8,00 ч"
              value="18 375 ₽"
              selectable
              selected={selected.includes("79")}
              onSelect={(on) => setSelected(on ? ["79"] : [])}
              onClick={() => undefined}
            />
          </li>
        </ListGroup>
        <ListGroup title="Справочники">
          <li>
            <ListRow
              compact
              leading={<Users className="size-5" />}
              title="Бригады"
              onClick={() => undefined}
            />
          </li>
          <li>
            <ListRow
              compact
              leading={<MapPin className="size-5" />}
              title="Объекты"
              onClick={() => undefined}
            />
          </li>
        </ListGroup>
      </Block>

      <Block
        title="Показатели и поля детали"
        note="Показатель text-title, главный экрана text-hero, только один"
      >
        <MetricCard
          label="Итог недели"
          value="1 618 632"
          unit="₽"
          note="389,08 ч · 4 160 ₽/ч · 100 записей"
          hero
        />
        <div className="grid grid-cols-2 gap-block">
          <MetricCard label="Часы" value="389,08" unit="ч" />
          <MetricCard label="Доходность" value="4 160" unit="₽/ч" source="Демо" />
        </div>
        <FieldGroup title="Ввёл бригадир">
          <FieldRow icon={MapPin} label="Объект" value="ст. Петровская, ул. Демо, 101 - котел" />
          <FieldRow icon={CalendarDays} label="День работы" value="Сб 03.10.2026" />
          <FieldRow icon={Clock} label="Начало и окончание" value="12:00-14:30" aside="Демо" />
        </FieldGroup>
        <FieldGroup title="Посчитала система">
          <FieldRow icon={Wallet} label="Сумма начисления" value="14 700 ₽" />
        </FieldGroup>
      </Block>

      <Block
        title="Таблица"
        note="Компьютер: шапка липкая, первый столбец закреплён, выбор флажками"
      >
        <DataTable
          label="Журнал записей"
          rows={ROWS}
          rowKey={(row) => row.id}
          selectable
          onRowClick={() => setPanel(true)}
          bulkActions={(keys, clear) => (
            <Button
              variant="primary"
              onClick={() => {
                notify(`Подтверждено ${keys.length}`, { undo: () => undefined });
                clear();
              }}
            >
              Подтвердить
            </Button>
          )}
          columns={[
            { key: "number", title: "Номер", cell: (r) => r.number },
            { key: "brigade", title: "Бригада", cell: (r) => r.brigade },
            { key: "object", title: "Объект", cell: (r) => r.object },
            { key: "hours", title: "Часы", cell: (r) => r.hours, numeric: true },
            { key: "sum", title: "Сумма", cell: (r) => r.sum, numeric: true },
            { key: "status", title: "Статус", cell: (r) => <StatusDot status={r.status} /> },
          ]}
        />
      </Block>

      <Block
        title="Состояния экрана"
        note="Скелетоны без спиннера, пусто с действием, ошибка с «Повторить»"
      >
        <SkeletonRows rows={2} />
        <SkeletonCards />
        <EmptyBlock
          icon={Inbox}
          title="Очередь пуста"
          text="Новые записи бригадиров появятся здесь"
          action={<Button variant="outline">Открыть журнал</Button>}
        />
        <ErrorBlock what="Не удалось загрузить журнал" onRetry={() => undefined} />
        <div className="-mx-card">
          <OfflineBar demo />
        </div>
      </Block>

      <Block
        title="Работа модели и подсказка экрана"
        note="Этапы текстом, подсказка одной строкой 44"
      >
        <StageList
          stages={[
            { label: "Распознаю речь", state: "done" },
            { label: "Сопоставляю с захватками", state: "current" },
            { label: "Готовлю отчёт", state: "wait" },
          ]}
        />
        <HintRow
          id="design-system"
          steps={[
            "Откройте запись, сверьте время и сумму.",
            "Нажмите «Подтвердить»: отменить можно 6 секунд.",
          ]}
        />
      </Block>

      <Block
        title="Шторка, панель, тост"
        note="Шторка до 92%, «назад» закрывает; панель справа 420"
      >
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setSheet(true)}>
            Открыть шторку
          </Button>
          <Button variant="outline" onClick={() => setPanel(true)}>
            Открыть панель справа
          </Button>
          <Button
            variant="outline"
            onClick={() => notify("Подтверждено 4 записи на 58 800 ₽", { undo: () => undefined })}
          >
            Тост с отменой
          </Button>
          <Button variant="outline" onClick={() => notify("Вы смотрите как руководитель")}>
            Тост 4 секунды
          </Button>
        </div>
      </Block>

      <Sheet
        open={sheet}
        onOpenChange={setSheet}
        id="kit-entry"
        size="full"
        eyebrow="ГЗ-00095 · Сб 03.10"
        title="ст. Петровская, ул. Демо, 101 - котел"
        actions={
          <>
            <Button variant="primary" size="lg" className="flex-1" onClick={() => setSheet(false)}>
              Подтвердить
            </Button>
            <Button variant="outline" size="lg">
              На уточнение
            </Button>
            <IconButton label="Ещё действия" variant="outline">
              <MoreHorizontal aria-hidden />
            </IconButton>
          </>
        }
      >
        <p className="text-meta text-text-3">Бригада 1 · 12:00-14:30 · 2,50 ч</p>
        <p className="mt-2 flex items-baseline gap-2">
          <span className="text-title tnum">14 700 ₽</span>
          <span className="text-body text-text-2 tnum">5 880 ₽/ч</span>
        </p>
        <FieldGroup title="Ввёл бригадир">
          <FieldRow icon={MapPin} label="Объект" value="ст. Петровская, ул. Демо, 101 - котел" />
          <FieldRow icon={Search} label="Источник" value="Бот MAX" aside="Демо" />
        </FieldGroup>
      </Sheet>

      <SidePanel
        open={panel}
        onOpenChange={setPanel}
        eyebrow="ГЗ-00096 · Сб 03.10"
        title="г. Славянск н/К, ул. Демо, 102"
        onPrev={() => undefined}
        onNext={() => undefined}
        actions={
          <Button variant="primary" size="lg" className="flex-1" onClick={() => setPanel(false)}>
            Подтвердить
          </Button>
        }
      >
        <FieldGroup title="Ввёл бригадир">
          <FieldRow icon={Clock} label="Начало и окончание" value="08:00-16:30, перерыв 45 мин" />
        </FieldGroup>
      </SidePanel>

      <PickerSheet
        open={picker}
        onOpenChange={setPicker}
        title="Объект"
        options={OBJECTS}
        value={object}
        onPick={setObject}
        searchLabel="Поиск адреса"
      />
      <FiltersSheet open={filters} onOpenChange={setFilters} count={34} onReset={() => undefined}>
        <section>
          <h3 className="text-meta-strong text-text-2">Бригада</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            <Chip tone="neutral" onClick={() => undefined}>
              Бригада 1
            </Chip>
            <Chip tone="neutral" onClick={() => undefined}>
              Бригада 2
            </Chip>
          </div>
        </section>
      </FiltersSheet>
      <CalendarSheet
        open={calendar}
        onOpenChange={setCalendar}
        value={day}
        today="2026-10-03"
        onPick={setDay}
        onWeek={() => setDay(null)}
      />
    </div>
  );
}
