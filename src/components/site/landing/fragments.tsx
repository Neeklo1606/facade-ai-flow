import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  Check,
  ClipboardCheck,
  FileSpreadsheet,
  MessagesSquare,
  ScrollText,
  Sparkles,
  Users,
} from "lucide-react";
import { ASK_SAMPLE, SAMPLE } from "@/lib/site/sample";
import { cn } from "@/lib/utils";

/**
 * Живые фрагменты интерфейса для лендинга (ADR-050): пузырь бота с кнопками времени, строка
 * проверки, строка отчёта, кусок недельной таблицы. Те же токены и пропорции, что в приложении,
 * но без его данных и контекста: импорт кирпичей бота притянул бы в лендинг весь набор демо.
 * Числа из записи показа ОБ-200 (`SAMPLE`), посчитаны domain.
 */

/** Появление один раз, когда блок вошёл в экран. reduced-motion выключает анимацию в CSS */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  /** Внутри списка блок сам становится пунктом: `ol > div` невалидная разметка */
  as?: "div" | "li";
}) {
  const ref = useRef<HTMLDivElement & HTMLLIElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <Tag
      ref={ref}
      data-reveal
      data-shown={shown ? "" : undefined}
      style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}
      className={className}
    >
      {children}
    </Tag>
  );
}

/** Подпись под фрагментом: откуда цифры */
export function SampleNote({ className }: { className?: string }) {
  return (
    <p className={cn("site-caption text-text-3", className)}>
      Пример из демо: {SAMPLE.code}, вымышленные данные
    </p>
  );
}

/** Сообщение бота и кнопки времени, как в мессенджере бригадира */
export function BotFragment({ className }: { className?: string }) {
  const times = ["12:00", "13:00", "14:00", "14:30", "15:00", "16:00"];
  return (
    <div className={cn("flex flex-col gap-2", className)} aria-label="Пример: бот бригадира">
      <div className="max-w-[92%] self-start rounded-bubble rounded-bl-[var(--r-xs)] border border-line bg-surface px-3 py-3 text-body text-text">
        Во сколько закончили?
        <span className="mt-1 block text-meta text-text-3">
          {SAMPLE.object}, начало {SAMPLE.start}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {times.map((time) => (
          <span
            key={time}
            className={cn(
              "grid min-h-11 place-items-center rounded-control border text-body-strong tnum",
              time === SAMPLE.end
                ? "border-transparent bg-orange-strong text-on-orange"
                : "border-line bg-surface text-text",
            )}
          >
            {time}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Строка очереди проверки: запись подтверждена */
export function QueueFragment({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-card border border-line bg-surface px-4 py-3",
        className,
      )}
      aria-label="Пример: строка проверки"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-body-strong text-text">{SAMPLE.object}</span>
        <span className="mt-0.5 block text-meta text-text-3 tnum">
          {SAMPLE.brigade} · {SAMPLE.start}–{SAMPLE.end} · {SAMPLE.hours}
        </span>
        <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-ok-bg px-2 py-0.5 text-meta-strong text-ok">
          <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
          Подтверждено
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-body-strong text-text tnum">{SAMPLE.amount}</span>
        <span className="block text-meta text-text-3 tnum">{SAMPLE.number}</span>
      </span>
    </div>
  );
}

/** Расчёт одной строкой: минуты, сумма, доходность часа */
export function CalcFragment({ className }: { className?: string }) {
  const items = [
    { label: "Минуты", value: `${SAMPLE.minutes} мин` },
    { label: "Сумма по смете", value: SAMPLE.amount },
    { label: "Доходность часа", value: SAMPLE.rate },
  ];
  return (
    <dl
      className={cn(
        "grid grid-cols-3 gap-px overflow-hidden rounded-card border border-line bg-line",
        className,
      )}
      aria-label="Пример: расчёт записи"
    >
      {items.map((item) => (
        <div key={item.label} className="min-w-0 bg-surface px-3 py-3">
          <dt className="text-meta text-text-3">{item.label}</dt>
          <dd className="mt-0.5 text-body-strong text-text tnum">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Строка недельного отчёта: адрес, сумма, часы, ₽/ч */
export function ReportFragment({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-3",
        className,
      )}
      aria-label="Пример: строка недельного отчёта"
    >
      <FileSpreadsheet className="size-5 shrink-0 text-text-2" strokeWidth={1.75} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body-strong text-text">{SAMPLE.object}</span>
        <span className="block text-meta text-text-3 tnum">
          {SAMPLE.amount} · {SAMPLE.hours} · {SAMPLE.rate}
        </span>
      </span>
    </div>
  );
}

/** Кусок недельной таблицы: группа → бригада → адрес, по дням */
export function WeekTableFragment({ className }: { className?: string }) {
  const days = ["Чт 01.10", "Пт 02.10", SAMPLE.day];
  const rows: { label: string; level: 0 | 1 | 2; cells: (string | null)[] }[] = [
    { label: "1. Стальные", level: 0, cells: [null, null, SAMPLE.amount] },
    { label: SAMPLE.brigade, level: 1, cells: [null, null, SAMPLE.amount] },
    { label: SAMPLE.object, level: 2, cells: [null, null, SAMPLE.amount] },
  ];
  return (
    <div
      className={cn("overflow-hidden rounded-card border border-line bg-surface", className)}
      aria-label="Пример: недельный отчёт в структуре файла"
    >
      <table className="w-full table-fixed text-left">
        <thead>
          <tr className="border-b border-line text-meta text-text-3">
            <th className="w-[46%] px-3 py-2 font-normal">Бригада и адрес</th>
            {days.map((day, index) => (
              <th
                key={day}
                className={cn(
                  "px-2 py-2 text-right font-normal tnum",
                  index === 0 && "max-sm:hidden",
                )}
              >
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.label}
              className={cn(
                "border-b border-line last:border-0",
                row.level === 0 && "bg-surface-2",
              )}
            >
              <td
                className={cn(
                  "truncate px-3 py-2 text-meta",
                  row.level === 0 ? "font-medium text-text" : "text-text-2",
                  row.level === 1 && "ps-6",
                  row.level === 2 && "ps-9",
                )}
              >
                {row.label}
              </td>
              {row.cells.map((cell, index) => (
                <td
                  key={index}
                  className={cn(
                    "px-2 py-2 text-right text-meta whitespace-nowrap text-text tnum",
                    index === 0 && "max-sm:hidden",
                  )}
                >
                  {cell ?? <span className="text-text-3">–</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Ответ «Спросить ГАЙКУ» карточкой: число, строки со сносками, источники (ADR-052) */
export function AskFragment({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn("flex flex-col gap-3", className)}
      aria-label="Пример: ответ на вопрос о неделе"
    >
      <p className="max-w-[85%] self-end rounded-bubble bg-surface-2 px-3.5 py-2 text-body text-text">
        {ASK_SAMPLE.question}
      </p>
      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
        <p className="flex items-center gap-1.5 text-meta text-text-3">
          <Sparkles className="size-3.5" strokeWidth={1.75} aria-hidden />
          ГАЙКА · по данным недели
        </p>
        <div>
          <p className="text-heading text-text">{ASK_SAMPLE.title}</p>
          <p className="mt-0.5 text-body text-text-2">{ASK_SAMPLE.lead}</p>
        </div>
        <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-control border border-line bg-line">
          {ASK_SAMPLE.metrics.map((m) => (
            <div key={m.label} className="min-w-0 bg-surface px-2.5 py-2">
              <dt className="text-meta text-text-3">{m.label}</dt>
              <dd className="mt-0.5 text-body-strong whitespace-nowrap text-text tnum">
                {m.value}
              </dd>
            </div>
          ))}
        </dl>
        {compact ? null : (
          <ul className="flex flex-col [&>li+li]:border-t [&>li+li]:border-line">
            {ASK_SAMPLE.rows.map((row) => (
              <li key={row.label} className="flex items-center gap-2.5 py-2">
                <span className="min-w-0 flex-1 truncate text-body text-text">{row.label}</span>
                <span className="text-body-strong text-text tnum">{row.value}</span>
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-meta-strong text-text-2 tnum">
                  {row.source}
                </span>
              </li>
            ))}
          </ul>
        )}
        <ul className="flex flex-wrap gap-1.5" aria-label="Источники">
          {ASK_SAMPLE.sources.map((source, index) => (
            <li
              key={source}
              className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-meta text-text-2"
            >
              <span className="text-meta-strong text-text tnum">{index + 1}</span>
              <span className="truncate">{source}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const WINDOW_NAV = [
  { label: "Спросить", icon: Sparkles, active: true },
  { label: "Проверка", icon: ClipboardCheck, active: false },
  { label: "Отчёт", icon: FileSpreadsheet, active: false },
  { label: "Журнал", icon: ScrollText, active: false },
  { label: "Бригады", icon: Users, active: false },
  { label: "Бот", icon: MessagesSquare, active: false },
];

/**
 * Окно продукта для первого экрана (ADR-052): рамка приложения с меню и ответом
 * «Спросить ГАЙКУ». Не картинка: те же токены и кирпичи, что внутри продукта
 */
export function ProductWindow({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl bg-surface ring-1 ring-line shadow-[0_32px_80px_-32px_rgba(20,14,8,0.45)]",
        className,
      )}
      aria-label="Как выглядит ГАЙКА: экран «Спросить»"
      role="img"
    >
      <div className="flex h-10 items-center gap-1.5 border-b border-line bg-surface-2 px-4">
        <span aria-hidden className="size-2.5 rounded-full bg-line-2" />
        <span aria-hidden className="size-2.5 rounded-full bg-line-2" />
        <span aria-hidden className="size-2.5 rounded-full bg-line-2" />
        <span className="mx-auto text-meta text-text-3">гайка · Спросить</span>
        <span aria-hidden className="w-10" />
      </div>
      {/* minmax(0, 1fr): длинные подписи не растягивают окно шире экрана телефона */}
      <div className="grid grid-cols-[minmax(0,1fr)] md:grid-cols-[200px_minmax(0,1fr)]">
        <nav
          aria-hidden
          className="hidden flex-col gap-0.5 border-e border-line bg-base p-3 md:flex"
        >
          <span className="flex items-center gap-2 px-2 pb-3 text-body-strong text-text">
            <span className="grid size-6 place-items-center rounded-md bg-text text-meta-strong text-void">
              г
            </span>
            Учёт выработки
          </span>
          {WINDOW_NAV.map((item) => (
            <span
              key={item.label}
              className={cn(
                "flex min-h-9 items-center gap-2 rounded-control px-2 text-body",
                item.active ? "bg-surface-2 text-text" : "text-text-2",
              )}
            >
              <item.icon className="size-4" strokeWidth={1.75} />
              {item.label}
            </span>
          ))}
        </nav>
        <div className="min-w-0 bg-void p-3 sm:p-6">
          <AskFragment />
        </div>
      </div>
    </div>
  );
}
