/**
 * Инструкция контура газа (ADR-044, F2, п. 3). Вкладки по ролям капсулами, шаги действием,
 * у каждого шага «Показать на экране»: переход на экран с `?tour=<цель>`, оболочка подсвечивает
 * элемент `data-tour` 4 секунды. Если шаг другой роли, роль меняется без перехода на её экран.
 *
 * Печать: все вкладки подряд, без оболочки и кнопок, тёмным по белому в любой теме.
 */
import { useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, Download } from "lucide-react";
import { useMemo } from "react";
import { ROLE_LABEL, fmtHours, fmtRate, fmtRub, useGasActor, type Role } from "@/api/gas-ops";
import { ScreenHint } from "@/components/gas-ops/page";
import { useRoleSwitch } from "@/components/gas-ops/shell/use-role-switch";
import { useGasBrand, useGasContour } from "@/lib/gas-ops/contour";
import { ROLE_ABOUT, ROLE_HOME, gasScreen, roleInitial } from "@/lib/gas-ops/screens";
import { calcExample, calcSampleOf } from "@/lib/gas-ops/start-examples";
import { cn } from "@/lib/utils";
import { GUIDE_TABS, type GuideTab } from "./guide-tabs";

interface GuideStep {
  title: string;
  text: string;
  to: string;
  /** Цель подсветки: строка или выбор между пунктом сайдбара и нижней панелью */
  tour: string | { desktop: string; mobile: string };
}

const nav = (screen: string) => ({ desktop: `nav-${screen}`, mobile: `tab-${screen}` });

const ROLE_STEPS: Record<Exclude<GuideTab, "calc">, { role: Role; steps: GuideStep[] }> = {
  foreman: {
    role: "foreman",
    steps: [
      {
        title: "Откройте бота",
        text: "Бот MAX открывается как чат: сообщения бота и кнопки под ними, без меню.",
        to: "/gas/foreman",
        tour: "bot",
      },
      {
        title: "Нажмите «Внести время»",
        text: "Бот начнёт новую запись и спросит объект.",
        to: "/gas/foreman",
        tour: "bot",
      },
      {
        title: "Выберите объект из списка на сегодня",
        text: "Бот показывает только объекты, назначенные вашей бригаде. Другой объект ищется поиском по разрешённым.",
        to: "/gas/foreman",
        tour: "bot",
      },
      {
        title: "Выберите день",
        text: "Обычно это сегодня. День записи видно в сводке до отправки.",
        to: "/gas/foreman",
        tour: "bot",
      },
      {
        title: "Выберите начало и окончание",
        text: "Время выбирается кнопками. Если окно занято другой записью бригады, бот скажет об этом сразу.",
        to: "/gas/foreman",
        tour: "bot",
      },
      {
        title: "Выберите перерыв",
        text: "Перерыв вычитается из смены. Без перерыва нажмите «0 мин».",
        to: "/gas/foreman",
        tour: "bot",
      },
      {
        title: "Проверьте минуты и нажмите «Отправить»",
        text: "В сводке стоят объект, день, время и минуты. После отправки придёт номер записи.",
        to: "/gas/foreman",
        tour: "bot-send",
      },
      {
        title: "Посмотрите статус и исправьте до проверки",
        text: "Мои записи показывают статус каждой. Пока запись ожидает проверки, её можно исправить.",
        to: "/gas/foreman",
        tour: "bot",
      },
      {
        title: "Если бот пишет о пересечении",
        text: "Время совпало с другой записью бригады. Нажмите «Изменить время» и выберите свободное окно.",
        to: "/gas/foreman",
        tour: "bot",
      },
      {
        title: "Несколько адресов за день",
        text: "На каждый адрес отдельная запись: бот предложит внести следующую после отправки.",
        to: "/gas/foreman",
        tour: "bot",
      },
    ],
  },
  manager: {
    role: "manager",
    steps: [
      {
        title: "Откройте проверку",
        text: "В меню пункт «Проверка». Там все записи бригадиров, которые ждут решения.",
        to: "/gas/moderation",
        tour: nav("moderation"),
      },
      {
        title: "Начните с группы «Требуют внимания»",
        text: "Наверху записи с замечаниями. Ниже записи без замечаний.",
        to: "/gas/moderation",
        tour: nav("moderation"),
      },
      {
        title: "Прочитайте метки",
        text: "Красная блокирует подтверждение: пересечение по времени. Янтарная требует решения: возможный дубль, нет суммы. Серая сообщает: Факт или Демо.",
        to: "/gas/moderation",
        tour: nav("moderation"),
      },
      {
        title: "Подтвердите запись",
        text: "Откройте запись, сверьте время, минуты и сумму, нажмите «Подтвердить».",
        to: "/gas/moderation",
        tour: "review-confirm",
      },
      {
        title: "Отклоните с причиной",
        text: "«Отклонить» просит причину: бригадир увидит её в боте.",
        to: "/gas/moderation",
        tour: "review-confirm",
      },
      {
        title: "Исправьте с комментарием",
        text: "Время или объект можно поправить. Комментарий обязателен, правка попадёт в историю записи.",
        to: "/gas/moderation",
        tour: "review-confirm",
      },
      {
        title: "Верните на уточнение",
        text: "Если не хватает данных, запись уходит бригадиру со статусом «Требует уточнения».",
        to: "/gas/moderation",
        tour: "review-confirm",
      },
      {
        title: "Подтвердите пачкой записи без замечаний",
        text: "Одна кнопка над группой «Без замечаний» подтверждает их все.",
        to: "/gas/moderation",
        tour: "review-confirm",
      },
      {
        title: "Найдите результат в отчёте",
        text: "Подтверждённая запись сразу появляется в недельном отчёте в строке своего объекта.",
        to: "/gas/reports",
        tour: "report-row",
      },
    ],
  },
  director: {
    role: "director",
    steps: [
      {
        title: "Откройте отчёт",
        text: "Пункт «Отчёт»: неделя по дням, группам, бригадам и адресам.",
        to: "/gas/reports",
        tour: nav("reports"),
      },
      {
        title: "Переключите «Формат заказчика» и «Аналитика»",
        text: "Формат заказчика повторяет ваш Excel. Аналитика показывает те же записи плоской таблицей.",
        to: "/gas/reports",
        tour: "report-row",
      },
      {
        title: "Выберите «только подтверждённые» или «предварительный»",
        text: "Предварительный добавляет записи, которые ещё ждут проверки. В выгрузку идёт выбранный вариант.",
        to: "/gas/reports",
        tour: "report-row",
      },
      {
        title: "Выгрузите Excel",
        text: "Кнопка «Выгрузить Excel» скачает файл в структуре вашего отчёта с листом «Как считалось».",
        to: "/gas/reports",
        tour: "export",
      },
      {
        title: "Что значит «нет суммы»",
        text: "У объекта нет подтверждённой стоимости работ. Часы учтены, доходность не считается, пока сумму не утвердят.",
        to: "/gas/reports",
        tour: "report-row",
      },
    ],
  },
};

const SHOW_STYLE = `
@media print {
  .gas-shell > aside, .gas-shell header, .gas-shell nav, [data-gas-show-dock], [data-sonner-toaster] { display: none !important; }
  html, body, .gas-shell, #gas-main { background: #fff !important; }
  #gas-main { padding: 0 !important; }
  .gas-guide {
    --text: #141210; --text-2: #3b3530; --text-3: #5d554e;
    --surface: #fff; --surface-2: #f3efea; --surface-3: #e9e3dc;
    --orange: #b23a07; --lift-1: none;
    color: #141210;
  }
  .gas-guide-step { break-inside: avoid; }
}
`;

export function GuideScreen({ tab, onTab }: { tab: GuideTab; onTab: (tab: GuideTab) => void }) {
  const brand = useGasBrand();
  return (
    <div className="gas-guide flex flex-col gap-6">
      <style>{SHOW_STYLE}</style>
      <div className="print:hidden">
        <ScreenHint screen="guide" className="mb-0" />
      </div>

      <div className="hidden print:block">
        <p className="text-title">Инструкция: {brand.product}</p>
        <p className="text-meta mt-1 text-text-3">
          {brand.client}. Демонстрация на данных за {brand.periodLabel}.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div className="-mx-gutter overflow-x-auto px-gutter pb-1 sm:mx-0 sm:px-0">
          <div role="tablist" aria-label="Роли инструкции" className="seg">
            {GUIDE_TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                id={`guide-tab-${item.key}`}
                aria-controls={`guide-panel-${item.key}`}
                aria-selected={tab === item.key}
                onClick={() => onTab(item.key)}
                className="seg-item focus-ring min-h-11"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="text-body-strong inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-control border border-line-2 bg-surface px-5 font-medium focus-ring press sm:self-auto"
        >
          <Download className="size-4" aria-hidden />
          Сохранить инструкцию в PDF
        </button>
      </div>

      {(["foreman", "manager", "director"] as const).map((key) => (
        <section
          key={key}
          role="tabpanel"
          id={`guide-panel-${key}`}
          aria-labelledby={`guide-tab-${key}`}
          className={cn(
            tab === key ? "block" : "hidden",
            "print:block print:break-before-page first-of-type:print:break-before-auto",
          )}
        >
          <h2 className="text-heading mb-4 hidden print:block">
            {GUIDE_TABS.find((t) => t.key === key)?.label}
          </h2>
          <RoleIntro role={ROLE_STEPS[key].role} count={ROLE_STEPS[key].steps.length} />
          <RoleSteps role={ROLE_STEPS[key].role} steps={ROLE_STEPS[key].steps} />
        </section>
      ))}

      <section
        role="tabpanel"
        id="guide-panel-calc"
        aria-labelledby="guide-tab-calc"
        className={cn(tab === "calc" ? "block" : "hidden", "print:block print:break-before-page")}
      >
        <h2 className="text-heading mb-4 hidden print:block">Как считается</h2>
        <CalcPanel />
      </section>
    </div>
  );
}

/** Кто это и куда попадёт: одна строка над шагами роли */
function RoleIntro({ role, count }: { role: Role; count: number }) {
  return (
    <div className="mb-4 flex items-center gap-4 px-1">
      <span
        aria-hidden
        className="text-heading grid size-12 shrink-0 place-items-center rounded-full bg-pill text-pill-text print:hidden"
      >
        {roleInitial(role)}
      </span>
      <p className="text-body min-w-0 text-text-2">
        <span className="font-semibold text-text">{ROLE_LABEL[role]}.</span> {ROLE_ABOUT[role]}{" "}
        <span className="text-text-3">
          {count} шагов, экран «{gasScreen(ROLE_HOME[role]).title}».
        </span>
      </p>
    </div>
  );
}

function RoleSteps({ role, steps }: { role: Role; steps: GuideStep[] }) {
  const actor = useGasActor();
  const switchRole = useRoleSwitch();
  const navigate = useNavigate();

  const show = async (step: GuideStep) => {
    const desktop = window.matchMedia("(min-width: 1024px)").matches;
    const target =
      typeof step.tour === "string" ? step.tour : desktop ? step.tour.desktop : step.tour.mobile;
    if (actor.role !== role) {
      const ok = await switchRole(role, { stay: true });
      if (!ok) return;
    }
    await navigate({ href: `${step.to}?tour=${encodeURIComponent(target)}` });
  };

  return (
    <ol className="flex flex-col gap-3">
      {steps.map((step, index) => (
        <li
          key={step.title}
          className="gas-guide-step card-v3 flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-5 print:shadow-none"
        >
          <span className="flex min-w-0 flex-1 gap-4">
            <span className="text-body-strong tnum grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 font-semibold text-text-2">
              {index + 1}
            </span>
            <span className="min-w-0">
              <span className="text-body-strong block font-semibold">{step.title}</span>
              <span className="text-body mt-1 block text-text-2">{step.text}</span>
            </span>
          </span>
          <button
            type="button"
            onClick={() => void show(step)}
            data-testid="guide-show"
            className="text-body-strong ms-[52px] inline-flex min-h-11 shrink-0 items-center justify-center gap-2 self-start rounded-control border border-line-2 bg-surface px-4 font-medium text-text focus-ring press sm:ms-auto sm:self-auto print:hidden"
          >
            Показать на экране
            <ArrowUpRight className="size-4" aria-hidden />
          </button>
        </li>
      ))}
    </ol>
  );
}

function CalcPanel() {
  const { report } = useGasContour();
  const calc = useMemo(() => calcExample(calcSampleOf(report.entries)), [report]);
  const EXAMPLE_MINUTES = calc.minutes;
  const EXAMPLE_AMOUNT = calc.amountRub;

  const formulas = [
    {
      name: "Минуты смены",
      formula: "окончание − начало − перерыв",
      example: `08:30–11:40 без перерыва = ${calc.shiftMinutes ?? "–"} мин`,
    },
    {
      name: "Часы",
      formula: "минуты / 60, два знака только для показа",
      example: `${EXAMPLE_MINUTES} мин = ${fmtHours(calc.hours)}`,
    },
    {
      name: "Доходность часа",
      formula: "сумма / (минуты / 60)",
      example: `${fmtRub(EXAMPLE_AMOUNT)} / (${EXAMPLE_MINUTES} / 60) = ${fmtRate(calc.rate)}`,
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <ol className="grid gap-3 lg:grid-cols-3">
        {formulas.map((item, index) => (
          <li
            key={item.name}
            className="gas-guide-step card-v3 flex flex-col gap-2 p-5 print:shadow-none"
          >
            <span className="text-meta-strong tnum font-semibold text-orange">0{index + 1}</span>
            <span className="text-heading">{item.name}</span>
            <span className="text-body text-text-2">{item.formula}</span>
            <span className="text-body-strong tnum mt-2 rounded-[var(--r-md)] bg-surface-2 px-3 py-2.5 font-medium">
              {item.example}
            </span>
          </li>
        ))}
      </ol>

      <article className="gas-guide-step surface-1 p-card">
        <h3 className="text-heading">
          Почему не {fmtRub(EXAMPLE_AMOUNT)} / {fmtHours(calc.shownHours).replace(" ч", "")}
        </h3>
        <p className="text-body mt-2 max-w-[720px] text-text-2">
          {fmtHours(calc.shownHours)} это округление: за ним{" "}
          {calc.minutesBehindShown.toLocaleString("ru-RU")} мин, а не {EXAMPLE_MINUTES}. Деление на
          округлённые часы даёт {fmtRate(calc.naiveRate)} вместо {fmtRate(calc.rate)}, разница{" "}
          {fmtRate(calc.naiveRate - calc.rate)}. В вашем файле доходность сходится с расчётом от
          минут в 82 строках из 84 и ни в одной с расчётом от округлённых часов.
        </p>
        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[var(--r-lg)] bg-surface p-4">
            <dt className="text-meta text-text-3">От минут, так считает система</dt>
            <dd className="mt-1 text-hero">{fmtRate(calc.rate)}</dd>
          </div>
          <div className="rounded-[var(--r-lg)] bg-surface/60 p-4">
            <dt className="text-meta text-text-3">От округлённых часов</dt>
            <dd className="text-title tnum mt-1 text-text-3 line-through decoration-2">
              {fmtRate(calc.naiveRate)}
            </dd>
          </div>
        </dl>
      </article>

      <article className="gas-guide-step card-v3 p-5 sm:p-7 print:shadow-none">
        <h3 className="text-heading">Итоги снизу вверх</h3>
        <ul className="text-body mt-3 flex flex-col gap-2 text-text-2">
          <li>Адрес → бригада → группа → день → неделя. Каждый уровень это сумма уровня ниже.</li>
          <li>
            Группа это сумма своих бригад. Если в бригаде несколько сотрудников, сумма бригады не
            удваивается.
          </li>
          <li>
            Доходность итоговой строки это её сумма, делённая на её часы от минут, а не среднее по
            строкам.
          </li>
          <li>Числа «Итого» из файла в расчёт не берутся: система пересчитывает их сама.</li>
        </ul>
      </article>
    </div>
  );
}
