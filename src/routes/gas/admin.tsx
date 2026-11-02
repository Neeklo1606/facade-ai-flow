import { completePageHead } from "@/lib/page-head";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { ListRow } from "@/components/ui/kit/list";
import { Segmented } from "@/components/ui/kit/controls";
import { GrowthLine } from "@/components/gas-ops/page";
import {
  ROLE_LABEL,
  fmtRub,
  useGasAudit,
  useGasExportProfile,
  useGasUsers,
  type Role,
  type SheetProvider,
} from "@/api/gas-ops";
import { setMetricOrder, useMetricOrder } from "@/lib/gas-ops/report-view";
import {
  REVIEW_MODE_HINT,
  REVIEW_MODE_LABEL,
  useGasEstimateActions,
  useGasReviewPolicy,
  type ReviewMode,
} from "@/api/gas-estimates";
import { useGasActor } from "@/api/gas-ops";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/**
 * Настройка направления. По ТЗ v1.0 отдельная веб-админка в договор не входит:
 * экран помечен как развитие и показывает только то, что действительно есть —
 * роли, согласованные правила расчёта, открытые вопросы, состояние подключений и журнал.
 * Вид ADR-045, 5.11: группы строк. Режим проверки настоящий (ADR-053, 5): он меняет маршрут
 * отправленной записи, режим без проверки открывается только при набранной точности.
 */
export const Route = createFileRoute("/gas/admin")({
  head: () =>
    completePageHead(
      { meta: [{ title: "Настройка учёта времени · Учёт выработки бригад" }] },
      "Настройка учёта времени · Учёт выработки бригад",
      "Роли, правила расчёта, подключения и журнал действий.",
    ),
  component: AdminPage,
});

/**
 * «Доступы» (4.7): матрица прав по ролям. Те же правила держит порт (`adapters/gas-ops/demo.ts`
 * и сервер в рабочем контуре): здесь только их запись для человека
 */
const ACCESS_ROLES: Role[] = ["foreman", "manager", "director", "admin"];
const ACCESS: { right: string; roles: Role[] }[] = [
  { right: "Вносить время по разрешённым объектам", roles: ["foreman", "manager", "admin"] },
  { right: "Проверять, принимать и возвращать записи", roles: ["manager", "director", "admin"] },
  { right: "Исправлять записи с причиной", roles: ["manager", "admin"] },
  { right: "Видеть суммы и доходность", roles: ["manager", "director", "admin"] },
  { right: "Загружать сметы и подтверждать стоимость", roles: ["manager", "admin"] },
  { right: "Закрывать и переоткрывать неделю", roles: ["director", "admin"] },
  { right: "Менять роли пользователей", roles: ["admin"] },
];

/** Облачная таблица — настройка вида: подключения нет, выбор запоминается в этом браузере */
const SHEET_KEY = "gaika-cloud-sheet";

/** Правила, которые согласованы и работают в расчёте */
const RULES = [
  "Эффективные минуты = окончание минус начало минус перерывы.",
  "Часы = минуты / 60, показываются с двумя знаками.",
  "Доходность часа = сумма / (минуты / 60), округление до рубля.",
  "При нулевых минутах деление запрещено: прочерк, а не ноль.",
  "Смена через полночь не ведётся: ошибка с понятным текстом.",
  "В утверждённый отчёт идут только подтверждённые записи.",
  "Агрегаты не складываются с дочерними строками.",
  "Сумма бригады не удваивается, когда в бригаде несколько сотрудников.",
];

/** Открытые вопросы: в коде они помечены комментарием OPEN-QUESTION */
const OPEN_QUESTIONS = [
  "1. Как распределять стоимость объекта по нескольким дням и бригадам.",
  "2. Что считается суммой начисления для незавершённого объекта.",
  "3. Какие статьи сметы входят в стоимость работ.",
  "4. Кто утверждает сумму по котлам без сметы.",
  "5. Можно ли вносить и исправлять время за вчера.",
  "6. Правила обеда и нескольких адресов за день.",
  "7. Правила округления: две строки отчёта расходятся на половину рубля.",
  "8. Почему строка «Итого» больше суммы видимых строк отчёта.",
  "9. 08:30-11:40: 185 или 190 минут. В расчёте 190.",
  "10. Бригады 3 и 5: четыре одинаковые строки и одинаковая рамка смены.",
];

const CONNECTIONS = [
  {
    name: "Бот MAX",
    detail:
      "Приём времени от бригадиров. Токен хранит администратор сервера; проверка вебхука и тестовое сообщение появятся с подключением",
    state: "не подключён",
  },
  { name: "PostgreSQL", detail: "Источник истины по ТЗ", state: "не подключён" },
  { name: "Google или Яндекс Таблицы", detail: "Представление отчёта", state: "не выбрано" },
  { name: "VPS Ubuntu 24.04 и Docker", detail: "Размещение", state: "не развёрнут" },
];

function Group({
  id,
  title,
  note,
  children,
}: {
  id?: string;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-label={title} className="scroll-mt-28">
      <h2 className="flex min-h-7 items-center text-meta text-text-3">{title}</h2>
      {note ? <p className="mb-2 text-meta text-text-3">{note}</p> : null}
      {children}
    </section>
  );
}

const LIST = "surface-1 overflow-hidden [&>li+li]:border-t [&>li+li]:border-line";

function AdminPage() {
  const users = useGasUsers();
  const audit = useGasAudit();
  const order = useMetricOrder();
  // Время напоминаний — настройка вида, пока MAX не подключён: живёт в этом браузере
  const [reminder, setReminder] = useState(() => {
    try {
      return localStorage.getItem("gaika-reminder-time") ?? "18:00";
    } catch {
      return "18:00";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("gaika-reminder-time", reminder);
    } catch {
      // без хранилища выбор живёт до перезагрузки
    }
  }, [reminder]);

  return (
    <div className="flex flex-col gap-section">
      <div>
        <GrowthLine />
      </div>

      <Group
        id="access"
        title="Доступы"
        note="Права проверяет сервер: скрытый пункт меню защитой не является. Роли людей меняются в «Сотрудниках»."
      >
        <div className="surface-1 overflow-x-auto">
          <table className="w-full text-body" aria-label="Доступы по ролям">
            <thead>
              <tr className="border-b border-line text-left text-meta text-text-3">
                <th scope="col" className="px-row py-2 font-normal">
                  Право
                </th>
                {ACCESS_ROLES.map((role) => (
                  <th key={role} scope="col" className="px-2 py-2 text-center font-normal">
                    {ROLE_LABEL[role]}
                    <span className="block text-text-3">
                      {users.filter((u) => u.role === role).length} чел.
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ACCESS.map((item) => (
                <tr key={item.right} className="border-t border-line">
                  <th scope="row" className="px-row py-2 text-left font-normal">
                    {item.right}
                  </th>
                  {ACCESS_ROLES.map((role) => (
                    <td key={role} className="px-2 py-2 text-center">
                      {item.roles.includes(role) ? (
                        <span aria-label="есть">✓</span>
                      ) : (
                        <span className="text-text-3" aria-label="нет">
                          –
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Group>

      <ExportGroup />

      <ReviewModeGroup />

      <Group title="Порядок показателей" note="Что отчёт показывает первым из трёх чисел строки.">
        {/* Короткие подписи: при тексте 130 % на 390 «Сначала деньги» уезжало за край */}
        <Segmented
          label="Порядок показателей"
          value={order}
          onChange={setMetricOrder}
          options={[
            { value: "money", label: "Деньги" },
            { value: "time", label: "Время" },
          ]}
        />
      </Group>

      <Group title="Правила расчёта" note="Только просмотр: правила меняются решением заказчика.">
        <ul className={LIST}>
          {RULES.map((rule) => (
            <li key={rule} className="px-row py-row text-body">
              {rule}
            </li>
          ))}
        </ul>
      </Group>

      <Group title="Открытые вопросы">
        <ul className={LIST}>
          {OPEN_QUESTIONS.map((question) => (
            <li key={question} className="px-row py-row text-body">
              {question}
            </li>
          ))}
        </ul>
      </Group>

      <Group
        id="connections"
        title="Подключения"
        note="Ни одно не подключено: прототип работает на моках. Сообщения не отправляются."
      >
        <ul className={LIST}>
          {CONNECTIONS.map((item) => (
            <li key={item.name}>
              <ListRow title={item.name} meta={item.detail} valueMeta={item.state} compact />
            </li>
          ))}
          <li className="flex flex-wrap items-center justify-between gap-3 px-row py-row">
            <span className="min-w-0">
              <span className="block text-body">Время напоминаний бригадирам</span>
              <span className="block text-meta text-text-3">
                Напоминание уйдёт в MAX, когда канал подключат. Сейчас не отправляется
              </span>
            </span>
            <label className="text-meta text-text-2">
              <span className="sr-only">Время напоминаний</span>
              <input
                type="time"
                value={reminder}
                onChange={(event) => setReminder(event.target.value)}
                className="h-btn rounded-control border border-field-line bg-panel-2 px-3 text-body tnum focus-ring"
              />
            </label>
          </li>
        </ul>
      </Group>

      <Group title={`Журнал действий · ${audit.length} в этой вкладке`}>
        {audit.length ? (
          <ul className={LIST}>
            {audit.map((row) => (
              <li key={row.id} className="flex items-start justify-between gap-3 px-row py-row">
                <span className="min-w-0">
                  <span className="block text-body">
                    {users.find((u) => u.id === row.actor)?.name ?? row.actor}
                    <span className="text-text-3"> · {row.action}</span>
                  </span>
                  <span className="block text-meta text-text-2">
                    {/* «было → стало», если действие его пишет */}
                    {row.detail}
                  </span>
                </span>
                <span className="shrink-0 text-meta text-text-3 tnum">
                  {row.at.replace("T", " ").slice(5, 16)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body text-text-3">Действий в этой вкладке ещё не было</p>
        )}
      </Group>
    </div>
  );
}

const THRESHOLDS = [90, 95, 98] as const;

/**
 * Режимы проверки (ADR-053, 5): три режима настройкой, а не одна кнопка. Режим без проверки
 * недоступен, пока точность ниже порога: причина и числа видны рядом.
 */
function ReviewModeGroup() {
  const policy = useGasReviewPolicy();
  const actions = useGasEstimateActions();
  const actor = useGasActor();
  const canChange = actor.role === "manager" || actor.role === "admin";
  const { settings, accuracy } = policy;

  const choose = async (mode: ReviewMode, thresholdPercent = settings.thresholdPercent) => {
    const result = await actions.setReviewSettings({ mode, thresholdPercent });
    if (!result.ok) toast.error(result.message);
  };

  return (
    <Group
      id="review-mode"
      title="Режим проверки"
      note={
        accuracy.percent === null
          ? `Точность считается по последним решениям менеджера: пока ${accuracy.decided}, нужно не меньше 20.`
          : `Точность ${accuracy.percent}%: ${accuracy.clean} из ${accuracy.decided} записей приняты без правки. Перед сдачей отчёта итоговая проверка человеком обязательна в любом режиме.`
      }
    >
      <ul className={LIST} role="radiogroup" aria-label="Режим проверки">
        {(Object.keys(REVIEW_MODE_LABEL) as ReviewMode[]).map((key) => {
          const on = settings.mode === key;
          const available = policy.availability[key];
          const disabled = !canChange || !available.ok;
          return (
            <li key={key}>
              <button
                type="button"
                role="radio"
                aria-checked={on}
                aria-disabled={disabled || undefined}
                onClick={() => (disabled ? undefined : void choose(key))}
                className={cn(
                  "flex min-h-row w-full items-start gap-3 px-row py-row text-left focus-ring",
                  on && "bg-surface-2",
                  disabled && !on && "cursor-not-allowed",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-body", disabled && !on && "text-text-3")}>
                    {REVIEW_MODE_LABEL[key]}
                  </span>
                  <span className="block text-meta text-text-3">
                    {available.ok ? REVIEW_MODE_HINT[key] : available.reason}
                  </span>
                </span>
                {on ? <Check className="mt-0.5 size-5 shrink-0 text-orange" aria-hidden /> : null}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-2">
        <Segmented
          label="Порог точности для режима без проверки"
          value={String(settings.thresholdPercent)}
          onChange={(value) => (canChange ? void choose(settings.mode, Number(value)) : undefined)}
          options={THRESHOLDS.map((t) => ({ value: String(t), label: `${t}%` }))}
        />
      </div>
    </Group>
  );
}

/**
 * «Выгрузка» (4.7): профиль Excel заказчика с шапкой, проверка обязательных столбцов и итога
 * с экраном, выбор облачной таблицы как настройка (подключения нет, D12)
 */
function ExportGroup() {
  const { profile, headers, check } = useGasExportProfile();
  const [provider, setProvider] = useState<SheetProvider | null>(() => {
    try {
      const saved = localStorage.getItem(SHEET_KEY);
      return saved === "google" || saved === "yandex" ? saved : null;
    } catch {
      return null;
    }
  });
  const choose = (next: SheetProvider) => {
    setProvider(next);
    try {
      localStorage.setItem(SHEET_KEY, next);
    } catch {
      // выбор живёт до перезагрузки
    }
  };
  return (
    <Group id="export" title="Выгрузка" note="Профиль файла, по которому собирается Excel недели.">
      <div className="surface-1 flex flex-col gap-3 p-card">
        <p className="text-body-strong">
          {profile.name} · лист «{profile.sheet}»
        </p>
        <div className="overflow-x-auto">
          <table className="text-meta" aria-label="Шапка дня в файле">
            <tbody>
              <tr>
                {headers.map((h) => (
                  <td key={h} className="border border-line px-2 py-1">
                    {h}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p
          data-testid="export-profile-check"
          className={`rounded-control px-3 py-2 text-meta ${check.matches ? "bg-mint-soft text-mint" : "bg-warn-bg text-warn"}`}
        >
          {check.missing.length
            ? `Нет обязательных столбцов: ${check.missing.join(", ")}`
            : "Обязательные столбцы на месте."}{" "}
          {check.fileTotalRub === check.screenTotalRub
            ? `Итог файла сходится с экраном: ${fmtRub(check.fileTotalRub)}.`
            : `Итог файла ${fmtRub(check.fileTotalRub)}, на экране ${fmtRub(check.screenTotalRub)}.`}
        </p>
        <div>
          <p className="text-meta text-text-2">Облачная таблица (не подключено)</p>
          <div
            role="radiogroup"
            aria-label="Облачная таблица"
            className="mt-1 flex flex-wrap gap-2"
          >
            {(
              [
                ["google", "Google Таблицы"],
                ["yandex", "Яндекс Таблицы"],
              ] as const
            ).map(([value, text]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={provider === value}
                onClick={() => choose(value)}
                className={`inline-flex min-h-11 items-center rounded-full px-4 text-body focus-ring ${
                  provider === value ? "bg-pill text-pill-text" : "bg-surface-2 text-text"
                }`}
              >
                {text}
              </button>
            ))}
          </div>
          <p className="mt-1 text-meta text-text-3">
            Ссылка на таблицу появится после подключения (T7). Сейчас неделя выгружается файлом
            Excel из «Табеля».
          </p>
        </div>
      </div>
    </Group>
  );
}
