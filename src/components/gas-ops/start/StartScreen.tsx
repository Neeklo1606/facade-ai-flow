/**
 * Стартовый экран контура газа (ADR-044, F2, п. 1): лицо продукта для заказчика.
 * Сверху вниз: герой с двухтоновым заголовком и главной кнопкой показа, путь записи
 * в четыре шага, вход ролью, граница договора, подвал. Заголовок экрана (h1) рисует шапка
 * оболочки, здесь секции начинаются с h2.
 */
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowRight,
  Calculator,
  Check,
  ClipboardCheck,
  FileSpreadsheet,
  MessagesSquare,
  Play,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ROLE_LABEL, fmtHours, fmtRate, fmtRub, useGasActions, type Role } from "@/api/gas-ops";
import { useRoleSwitch } from "@/components/gas-ops/shell/use-role-switch";
import { useGasBrand, useIsClientContour } from "@/lib/gas-ops/contour";
import { ROLE_ABOUT, ROLE_HOME, ROLE_ORDER, gasScreen, roleInitial } from "@/lib/gas-ops/screens";
import { startGasShow } from "@/lib/gas-ops/show";
import { showExample } from "@/lib/gas-ops/start-examples";
import { clearScenario, getGuideState } from "@/lib/guide/store";
import { cn } from "@/lib/utils";

const SHOW = showExample();

type StepTo = "/gas/foreman" | "/gas/moderation" | "/gas/guide" | "/gas/reports";

const FLOW: readonly {
  title: string;
  where: string;
  text: string;
  to: StepTo;
  role: Role | null;
  icon: LucideIcon;
}[] = [
  {
    title: "Бригадир вносит время",
    where: "Бот MAX",
    text: "Объект на сегодня, начало, окончание и перерыв кнопками.",
    to: "/gas/foreman",
    role: "foreman",
    icon: MessagesSquare,
  },
  {
    title: "Менеджер проверяет",
    where: "Очередь",
    text: "Сначала записи с замечаниями, остальные пачкой.",
    to: "/gas/moderation",
    role: "manager",
    icon: ClipboardCheck,
  },
  {
    title: "Система считает",
    where: "Расчёт",
    text: "Минуты, сумма по смете и доходность часа.",
    to: "/gas/guide",
    role: null,
    icon: Calculator,
  },
  {
    title: "Отчёт и Excel",
    where: "Неделя",
    text: "Неделя в структуре вашего файла и выгрузка XLSX.",
    to: "/gas/reports",
    role: "director",
    icon: FileSpreadsheet,
  },
];

const IN_CONTRACT = [
  "Бот MAX для бригадира: время по объекту кнопками",
  "Справочники объектов, бригад и сотрудников",
  "Расчёт минут, суммы по смете и доходности часа",
  "Проверка записей менеджером: подтвердить, исправить, вернуть",
  "Недельный отчёт в структуре вашего Excel",
  "Выгрузка XLSX, таблица Google или Яндекс как представление",
] as const;

const GROWTH = [
  "Веб-кабинет с настройкой ролей и правил",
  "Сводка и дашборд руководителя",
  "Аналитика провалов по бригадам и объектам",
  "Распознавание смет",
  "Связь с 1С и Bitrix24",
] as const;

export function StartScreen() {
  const brand = useGasBrand();
  const clientContour = useIsClientContour();
  const switchRole = useRoleSwitch();
  const actions = useGasActions();
  const [busy, setBusy] = useState(false);

  const startShow = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // Повторный показ начинается с чистых данных: прошлая запись заняла бы окно 12:00–14:30
      if (getGuideState().chain.gasEntryId) {
        await actions.reset();
        clearScenario();
      }
      startGasShow();
      await switchRole("foreman");
    } finally {
      setBusy(false);
    }
  };

  const openRoles = () => {
    const target = document.getElementById("gas-roles");
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
    target?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
  };

  // Пришли с /demo: показ стартует сразу или открывается выбор роли, параметр убирается
  const search = useSearch({ from: "/gas/" });
  const navigate = useNavigate();
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current || (!search.start && !search.roles)) return;
    handled.current = true;
    void navigate({ to: "/gas", search: {}, replace: true });
    if (search.start) void startShow();
    else requestAnimationFrame(openRoles);
    // Один раз на заход: startShow и openRoles стабильны по смыслу, параметр читается при монтировании
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-12 pb-4 lg:gap-16">
      <Hero onStart={startShow} onRoles={openRoles} busy={busy} />
      <Flow onRole={(role) => void switchRole(role, { stay: true })} />
      <Roles onPick={(role) => void switchRole(role)} />
      <Contract />
      <footer className="text-meta flex flex-col gap-2 border-t border-line pt-6 text-text-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-[640px]">
          {clientContour
            ? `Демонстрация на обезличенных данных из вашего отчёта за ${brand.periodLabel}.`
            : "Демонстрация на вымышленных данных: неделя «Демо-подрядчика» в структуре настоящего отчёта."}{" "}
          Бот MAX и таблицы пока не подключены.
        </p>
        <p className="shrink-0">{brand.credit}</p>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ Герой */

function Hero({
  onStart,
  onRoles,
  busy,
}: {
  onStart: () => void;
  onRoles: () => void;
  busy: boolean;
}) {
  const brand = useGasBrand();
  const clientContour = useIsClientContour();
  return (
    <section
      aria-labelledby="gas-start-title"
      className="hero-brand px-5 pt-6 pb-6 sm:px-10 sm:pt-10 sm:pb-10 lg:px-14 lg:pt-14 lg:pb-12"
    >
      <span
        aria-hidden
        className="orb-brand -top-24 -right-20 size-[300px] sm:-top-28 sm:-right-10 sm:size-[420px] lg:right-10 lg:size-[520px]"
      />
      <p className="text-meta-strong glass inline-flex min-h-9 items-center gap-2 rounded-full px-3.5 font-medium text-text-2">
        <Sparkles className="size-4 text-orange" aria-hidden />
        {clientContour ? `Для ${brand.client}` : "Пример: Демо-подрядчик"}
      </p>

      {/* На телефоне заголовок экрана в шапке контура, здесь только с планшета (ADR-048, 5) */}
      <h2
        id="gas-start-title"
        className="text-display mt-8 hidden max-w-[860px] text-balance sm:mt-12 md:block lg:mt-16"
      >
        Учёт выработки бригад.{" "}
        <span className="tone-2 block">От сообщения бригадира до недельного Excel.</span>
      </h2>
      <p className="mt-3 max-w-[620px] text-body text-text-2">
        Бригадир отмечает время в MAX, менеджер проверяет, система считает выработку по смете и
        собирает недельный отчёт в вашем формате Excel.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={onStart}
          disabled={busy}
          data-testid="gas-start-show"
          className="text-body pill-action press focus-ring w-full sm:w-auto"
        >
          <Play className="size-4 fill-current" aria-hidden />
          Пройти показ: 3 минуты
        </button>
        <button
          type="button"
          onClick={onRoles}
          className="text-body-strong glass press focus-ring inline-flex min-h-14 w-full ring-1 ring-line-2 ring-inset items-center justify-center gap-2 rounded-full px-6 font-medium text-text sm:w-auto lg:min-h-12"
        >
          Войти как…
          <ArrowDown className="size-4" aria-hidden />
        </button>
      </div>

      {/* Капсула примера, как поле ввода у Catalist: путь одной записи показа в цифрах */}
      <div className="glass mt-10 flex flex-col gap-3 rounded-[var(--r-2xl)] p-4 sm:mt-14 sm:flex-row sm:items-center sm:gap-0 sm:rounded-full sm:p-2 sm:ps-6 lg:max-w-[760px]">
        <p className="text-meta text-text-3 sm:w-28 sm:shrink-0">
          Запись показа
          <span className="block text-text-2">ОБ-200 · Демо</span>
        </p>
        <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 sm:gap-0">
          {[
            { label: "Время", value: `${SHOW.start}–${SHOW.end}` },
            { label: "Часы", value: fmtHours(SHOW.hours) },
            { label: "Сумма", value: fmtRub(SHOW.amountRub) },
            { label: "Доходность", value: fmtRate(SHOW.rate), main: true },
          ].map((item) => (
            <div
              key={item.label}
              className={cn(
                "min-w-0 sm:px-4",
                item.main && "sm:rounded-full sm:bg-pill sm:py-2 sm:text-pill-text",
              )}
            >
              <dt
                className={cn(
                  "text-meta text-text-3",
                  item.main && "sm:opacity-70 sm:text-inherit",
                )}
              >
                {item.label}
              </dt>
              <dd className="text-heading tnum whitespace-nowrap">{item.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ Путь записи */

function Flow({ onRole }: { onRole: (role: Role) => void }) {
  return (
    <section aria-labelledby="gas-flow-title">
      <SectionHead
        id="gas-flow-title"
        title="Как идёт запись"
        tone="Четыре шага, каждый открывает свой экран."
      />
      <ol className="mt-6 flex flex-col items-stretch lg:flex-row">
        {FLOW.map((step, index) => (
          <li key={step.title} className="flex flex-col items-stretch lg:flex-1 lg:flex-row">
            <Link
              to={step.to}
              {...(step.to === "/gas/guide" ? { search: { tab: "calc" as const } } : {})}
              onClick={() => step.role && onRole(step.role)}
              data-testid={`gas-flow-${index + 1}`}
              className="card-v3 press focus-ring group flex flex-1 flex-col gap-2 p-5 lg:min-h-[232px] lg:gap-3 lg:p-6"
            >
              <span className="flex items-center justify-between gap-3">
                <span className="text-meta-strong tnum font-semibold text-orange">
                  0{index + 1}
                </span>
                <span className="text-meta-strong rounded-full bg-surface-2 px-2.5 py-1 font-medium text-text-2">
                  {step.where}
                </span>
              </span>
              <step.icon
                className="mt-2 hidden size-6 text-text-2 lg:block"
                strokeWidth={1.5}
                aria-hidden
              />
              <span className="text-heading text-balance">{step.title}</span>
              <span className="text-body text-text-3">{step.text}</span>
              <span className="text-body-strong mt-auto inline-flex items-center gap-1.5 pt-1 lg:pt-2 font-medium text-text-2 group-hover:text-text">
                Открыть экран
                <ArrowRight className="size-4" aria-hidden />
              </span>
            </Link>
            {index < FLOW.length - 1 ? (
              <span
                aria-hidden
                className="grid h-8 place-items-center text-text-3 lg:h-auto lg:w-10 lg:shrink-0"
              >
                <ArrowDown className="size-5 lg:hidden" />
                <ArrowRight className="hidden size-5 lg:block" />
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ------------------------------------------------------------------ Роли */

function Roles({ onPick }: { onPick: (role: Role) => void }) {
  return (
    <section id="gas-roles" aria-labelledby="gas-roles-title" className="scroll-mt-24">
      <SectionHead
        id="gas-roles-title"
        title="Войти как…"
        tone="Одно касание: роль сменится и откроется её экран."
      />
      <ul className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ROLE_ORDER.map((role) => {
          const home = gasScreen(ROLE_HOME[role]);
          return (
            <li key={role} className="flex">
              <button
                type="button"
                onClick={() => onPick(role)}
                data-testid={`gas-role-${role}`}
                className="card-v3 press focus-ring group flex w-full flex-col items-start gap-3 p-5 text-left lg:p-6"
              >
                <span className="flex w-full items-center gap-3">
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-11 shrink-0 place-items-center rounded-full text-body-strong",
                      role === "foreman"
                        ? "bg-orange-strong text-on-orange"
                        : "bg-surface-2 text-text",
                    )}
                  >
                    {roleInitial(role)}
                  </span>
                  <span className="text-heading">{ROLE_LABEL[role]}</span>
                </span>
                <span className="text-body text-text-2">{ROLE_ABOUT[role]}</span>
                <span className="text-meta mt-auto flex w-full items-center justify-between gap-2 rounded-full bg-surface-2 py-2 ps-4 pe-2 text-text-2">
                  <span className="min-w-0 truncate">
                    Попадёте: <span className="font-medium text-text">{home.title}</span>
                  </span>
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-pill text-pill-text transition-transform group-hover:translate-x-0.5">
                    <ArrowRight className="size-4" aria-hidden />
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ Договор */

function Contract() {
  return (
    <section aria-labelledby="gas-contract-title">
      <SectionHead
        id="gas-contract-title"
        title="Что входит в договор"
        tone="ТЗ v1.0 от 16.10.2026. Развитие показываем отдельно и один раз."
      />
      <div className="mt-6 grid gap-3 lg:grid-cols-2">
        <div className="card-v3 p-5 lg:p-7">
          <h3 className="text-heading flex items-center justify-between gap-3">
            В договоре
            <span className="text-meta-strong rounded-full bg-orange-dim px-2.5 py-1 font-medium text-orange">
              v1.0
            </span>
          </h3>
          <ul className="mt-4 flex flex-col gap-3">
            {IN_CONTRACT.map((item) => (
              <li key={item} className="text-body flex gap-3">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-orange-strong text-on-orange">
                  <Check className="size-3" strokeWidth={3} aria-hidden />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-[var(--r-xl)] bg-surface-2 p-5 lg:p-7">
          <h3 className="text-heading flex items-center justify-between gap-3">
            Развитие
            <span className="text-meta-strong rounded-full bg-surface-3 px-2.5 py-1 font-medium text-text-2">
              Вне договора v1.0
            </span>
          </h3>
          <ul className="mt-4 flex flex-col gap-3">
            {GROWTH.map((item) => (
              <li key={item} className="text-body flex gap-3 text-text-2">
                <span
                  aria-hidden
                  className="mt-2 size-2 shrink-0 rounded-full border border-text-3"
                />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/** Двухтоновый подзаголовок секции: название основным цветом, пояснение тише */
export function SectionHead({ id, title, tone }: { id: string; title: string; tone: string }) {
  return (
    <h2 id={id} className="max-w-[760px] text-title text-balance">
      {title} <span className="tone-2">{tone}</span>
    </h2>
  );
}
