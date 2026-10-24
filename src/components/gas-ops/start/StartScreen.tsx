/**
 * Стартовый экран контура газа (ADR-044, F2; шаг L3): рабочий старт, а не лендинг внутри
 * приложения. Одна строка о системе, главная кнопка показа в первом экране, «Войти как…»
 * тихой ссылкой, путь записи и роли строками списка, договор свёрнут. Заголовок экрана (h1)
 * рисует шапка оболочки на телефоне, с планшета он здесь.
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
import {
  ROLE_LABEL,
  fmtHours,
  fmtRate,
  fmtRub,
  useGasActions,
  useGasActor,
  type Role,
} from "@/api/gas-ops";
import { useRoleSwitch } from "@/components/gas-ops/shell/use-role-switch";
import { useGasBrand, useIsClientContour } from "@/lib/gas-ops/contour";
import { ROLE_ABOUT, ROLE_HOME, ROLE_ORDER, gasScreen, roleInitial } from "@/lib/gas-ops/screens";
import { startGasShow } from "@/lib/gas-ops/show";
import { showExample } from "@/lib/gas-ops/start-examples";
import { clearScenario, getGuideState } from "@/lib/guide/store";

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
    <div className="flex flex-col gap-section pb-4 lg:gap-12">
      <Lead onStart={startShow} onRoles={openRoles} busy={busy} />
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

/* ------------------------------------------------------------------ Начало */

function Lead({
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
  const canAsk = useGasActor().role !== "foreman";
  return (
    <section aria-labelledby="gas-start-title" className="flex flex-col gap-4 lg:gap-5">
      {/* На телефоне заголовок экрана в шапке контура, здесь с планшета (ADR-048, 5) */}
      <h2 id="gas-start-title" className="hidden text-page-title text-balance md:block lg:hidden">
        Учёт выработки бригад
      </h2>
      <p className="max-w-[620px] text-body text-text-2">
        Бригадир отмечает время в мессенджере, менеджер проверяет, система считает выработку по
        смете и собирает недельный отчёт в вашем формате Excel.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <button
          type="button"
          onClick={onStart}
          disabled={busy}
          data-testid="gas-start-show"
          className="text-body pill-action press focus-ring w-full sm:w-auto"
        >
          <Play className="size-4 fill-current" aria-hidden />
          Начать показ: 3 минуты
        </button>
        <button
          type="button"
          onClick={onRoles}
          className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-full px-4 text-body text-text-2 focus-ring is-hover:text-text"
        >
          Войти как…
          <ArrowDown className="size-4" aria-hidden />
        </button>
        {/* «Спросить ГАЙКУ» (ADR-052): бригадиру нет, суммы ему не показываются */}
        {canAsk ? (
          <Link
            to="/gas/ask"
            className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-full px-4 text-body text-text-2 focus-ring is-hover:text-text"
          >
            <Sparkles className="size-4" strokeWidth={1.75} aria-hidden />
            Спросить о неделе
          </Link>
        ) : null}
      </div>
      <p className="text-meta text-text-3 tnum">
        {clientContour ? `Для ${brand.client}` : "Пример: Демо-подрядчик"} · запись показа ОБ-200:{" "}
        {SHOW.start}–{SHOW.end} = {fmtHours(SHOW.hours)}, {fmtRub(SHOW.amountRub)},{" "}
        {fmtRate(SHOW.rate)}
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ Путь записи */

function Flow({ onRole }: { onRole: (role: Role) => void }) {
  return (
    <section aria-labelledby="gas-flow-title" className="flex flex-col gap-3">
      <h2 id="gas-flow-title" className="text-heading">
        Как идёт запись
      </h2>
      <ol className="overflow-hidden rounded-card bg-surface ring-1 ring-line lg:grid lg:grid-cols-4 [&>li+li]:border-t [&>li+li]:border-line lg:[&>li+li]:border-t-0 lg:[&>li+li]:border-l">
        {FLOW.map((step, index) => (
          <li key={step.title} className="flex">
            <Link
              to={step.to}
              {...(step.to === "/gas/guide" ? { search: { tab: "calc" as const } } : {})}
              onClick={() => step.role && onRole(step.role)}
              data-testid={`gas-flow-${index + 1}`}
              className="flex min-h-row w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-100 focus-ring active:bg-surface-2 is-hover:bg-surface-2 lg:flex-col lg:items-start lg:gap-2 lg:p-5"
            >
              <span
                aria-hidden
                className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-meta-strong text-text-2 tnum"
              >
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-body-strong text-text">{step.title}</span>
                <span className="mt-0.5 block text-meta text-text-3">{step.text}</span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-text-3 lg:hidden" aria-hidden />
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ------------------------------------------------------------------ Роли */

function Roles({ onPick }: { onPick: (role: Role) => void }) {
  return (
    <section
      id="gas-roles"
      aria-labelledby="gas-roles-title"
      className="flex scroll-mt-24 flex-col gap-3"
    >
      <h2 id="gas-roles-title" className="text-heading">
        Войти как…{" "}
        <span className="text-body font-normal text-text-3">
          одно касание, откроется экран роли
        </span>
      </h2>
      <ul className="overflow-hidden rounded-card bg-surface ring-1 ring-line sm:grid sm:grid-cols-2 xl:grid-cols-4 [&>li+li]:border-t [&>li+li]:border-line sm:[&>li+li]:border-t-0">
        {ROLE_ORDER.map((role) => {
          const home = gasScreen(ROLE_HOME[role]);
          return (
            <li
              key={role}
              className="flex sm:border-line sm:[&:nth-child(n+3)]:border-t xl:[&:nth-child(n+3)]:border-t-0"
            >
              <button
                type="button"
                onClick={() => onPick(role)}
                data-testid={`gas-role-${role}`}
                className="flex min-h-row w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-100 focus-ring active:bg-surface-2 is-hover:bg-surface-2"
              >
                <span
                  aria-hidden
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-body-strong text-text"
                >
                  {roleInitial(role)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-body-strong text-text">{ROLE_LABEL[role]}</span>
                  <span className="mt-0.5 block text-meta text-text-3">
                    {ROLE_ABOUT[role]} Откроется: {home.title}.
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-text-3" aria-hidden />
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
  // ТЗ и договор газового заказчика видны только в его личном контуре (L3)
  const client = useIsClientContour();
  return (
    <details className="group rounded-card bg-surface ring-1 ring-line">
      <summary className="flex min-h-row cursor-pointer list-none items-center gap-3 px-4 py-3 text-body-strong text-text focus-ring [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          {client ? "Что входит в договор" : "Что входит в первую версию"}
          <span className="block text-meta font-normal text-text-3">
            {client ? "ТЗ v1.0 от 16.10.2026. " : ""}Развитие показываем отдельно.
          </span>
        </span>
        <ArrowDown
          className="size-4 shrink-0 text-text-3 transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="grid gap-6 border-t border-line px-4 py-4 lg:grid-cols-2 lg:p-6">
        <div>
          <h3 className="text-meta-strong text-text-2">
            {client ? "В договоре v1.0" : "Первая версия"}
          </h3>
          <ul className="mt-3 flex flex-col gap-2.5">
            {IN_CONTRACT.map((item) => (
              <li key={item} className="text-body flex gap-3">
                <Check className="mt-0.5 size-4 shrink-0 text-ok" strokeWidth={2.5} aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-meta-strong text-text-2">
            {client ? "Развитие, вне договора v1.0" : "Развитие"}
          </h3>
          <ul className="mt-3 flex flex-col gap-2.5">
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
    </details>
  );
}
