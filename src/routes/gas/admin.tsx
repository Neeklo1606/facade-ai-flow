import { completePageHead } from "@/lib/page-head";
import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { ListRow } from "@/components/ui/kit/list";
import { Segmented } from "@/components/ui/kit/controls";
import { GrowthLine, ScreenHint } from "@/components/gas-ops/page";
import { ROLE_LABEL, useGasAudit, useGasUsers, type Role } from "@/api/gas-ops";
import { roleInitial } from "@/lib/gas-ops/screens";
import { setMetricOrder, useMetricOrder } from "@/lib/gas-ops/report-view";
import {
  REVIEW_MODE_LABEL,
  setReviewMode,
  useReviewMode,
  type ReviewMode,
} from "@/lib/gas-ops/review-mode";
import { cn } from "@/lib/utils";

/**
 * Настройка направления. По ТЗ v1.0 отдельная веб-админка в договор не входит:
 * экран помечен как развитие и показывает только то, что действительно есть —
 * роли, согласованные правила расчёта, открытые вопросы, состояние подключений и журнал.
 * Вид ADR-045, 5.11: группы строк. Режим проверки и порядок показателей — демо «Развитие»,
 * логика проверки и расчёт не меняются.
 */
export const Route = createFileRoute("/gas/admin")({
  head: () =>
    completePageHead(
      { meta: [{ title: "Настройка учёта времени — Учёт выработки бригад" }] },
      "Настройка учёта времени — Учёт выработки бригад",
      "Роли, правила расчёта, подключения и журнал действий.",
    ),
  component: AdminPage,
});

/** Что роль может делать: таблица прав, которую проверяет сервер в рабочем контуре */
const RIGHTS: { role: Role; rights: string }[] = [
  { role: "foreman", rights: "Вводит время по разрешённым объектам, правит до проверки" },
  { role: "manager", rights: "Проверяет, исправляет, подтверждает, ведёт стоимость и отчёт" },
  { role: "admin", rights: "Доступы, справочники, настройки, журналы" },
  { role: "director", rights: "Читает утверждённые отчёты" },
];

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
  "9. 08:30-11:40 — 185 или 190 минут. В расчёте 190.",
  "10. Бригады 3 и 5: четыре одинаковые строки и одинаковая рамка смены.",
];

const CONNECTIONS = [
  { name: "Бот MAX", detail: "Приём времени от бригадиров", state: "не подключён" },
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
  const reviewMode = useReviewMode();
  const order = useMetricOrder();

  return (
    <div className="flex flex-col gap-section">
      <div>
        <ScreenHint screen="admin" className="mb-0" />
        <GrowthLine />
      </div>

      <Group
        title="Пользователи и роли"
        note="Права проверяет сервер: скрытый пункт меню защитой не является."
      >
        <ul className={LIST}>
          {RIGHTS.map((item) => {
            const user = users.find((u) => u.role === item.role);
            return (
              <li key={item.role}>
                <ListRow
                  leading={
                    <span className="avatar" aria-hidden>
                      {roleInitial(item.role)}
                    </span>
                  }
                  title={ROLE_LABEL[item.role]}
                  meta={item.rights}
                  valueMeta={user?.name}
                />
              </li>
            );
          })}
        </ul>
      </Group>

      <Group
        id="review-mode"
        title="Режим проверки · Развитие"
        note="Сейчас проверку ведёт менеджер. Выбор показывает, как система может работать дальше: логика проверки не меняется."
      >
        <ul className={LIST} role="radiogroup" aria-label="Режим проверки">
          {(Object.keys(REVIEW_MODE_LABEL) as ReviewMode[]).map((key) => {
            const on = reviewMode === key;
            return (
              <li key={key}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setReviewMode(key)}
                  className={cn(
                    "flex min-h-row-compact w-full items-center gap-3 px-row text-left text-body focus-ring",
                    on && "bg-surface-2",
                  )}
                >
                  <span className="flex-1">{REVIEW_MODE_LABEL[key]}</span>
                  {on ? <Check className="size-5 text-orange" aria-hidden /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </Group>

      <Group title="Порядок показателей" note="Как отчёт показывает три числа строки.">
        <Segmented
          label="Порядок показателей"
          value={order}
          onChange={setMetricOrder}
          options={[
            { value: "money", label: "Сначала деньги" },
            { value: "time", label: "Сначала время" },
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

      <Group title="Подключения" note="Ни одно не подключено: прототип работает на моках.">
        <ul className={LIST}>
          {CONNECTIONS.map((item) => (
            <li key={item.name}>
              <ListRow title={item.name} meta={item.detail} valueMeta={item.state} compact />
            </li>
          ))}
        </ul>
      </Group>

      <Group title={`Журнал действий · ${audit.length} в этой вкладке`}>
        {audit.length ? (
          <ul className={LIST}>
            {audit.map((row) => (
              <li key={row.id} className="flex items-start justify-between gap-3 px-row py-row">
                <span className="min-w-0">
                  <span className="block text-body">{row.action}</span>
                  <span className="block text-meta text-text-3">
                    {row.actor} · {row.detail}
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
