import { completePageHead } from "@/lib/page-head";
import { createFileRoute } from "@tanstack/react-router";
import { History, PlugZap, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { WidgetCard, WidgetCardHeader } from "@/components/common/WidgetCard";
import { WidgetTable, type WidgetColumn } from "@/components/common/WidgetTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Num } from "@/components/gas-ops/marks";
import { GrowthLine } from "@/components/gas-ops/page";
import { ROLE_LABEL, useGasAudit, useGasUsers, type Role } from "@/api/gas-ops";

/**
 * Настройка направления. По ТЗ v1.0 отдельная веб-админка в договор не входит:
 * экран помечен как развитие и показывает только то, что действительно есть —
 * роли, согласованные правила расчёта, открытые вопросы, состояние подключений и журнал.
 */
export const Route = createFileRoute("/gas/admin")({
  head: () =>
    completePageHead(
      { meta: [{ title: "Настройка учёта времени — гайка" }] },
      "Настройка учёта времени — гайка",
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
  "8. Откуда в «Итого» 5 165 357 ₽ при 1 524 132 ₽ в видимых строках.",
  "9. 08:30-11:40 — 185 или 190 минут. В расчёте 190.",
  "10. Бригады 3 и 5: четыре одинаковые строки и одинаковая рамка смены.",
];

const CONNECTIONS = [
  { name: "Бот MAX", detail: "Приём времени от бригадиров", state: "не подключён" },
  { name: "PostgreSQL", detail: "Источник истины по ТЗ", state: "не подключён" },
  { name: "Google или Яндекс Таблицы", detail: "Представление отчёта", state: "не выбрано" },
  { name: "VPS Ubuntu 24.04 и Docker", detail: "Размещение", state: "не развёрнут" },
];

function AdminPage() {
  const users = useGasUsers();
  const audit = useGasAudit();

  const columns: WidgetColumn<{
    id: string;
    at: string;
    actor: string;
    action: string;
    detail: string;
  }>[] = [
    {
      key: "at",
      header: "Когда",
      cell: (row) => <Num>{row.at.replace("T", " ").slice(0, 16)}</Num>,
    },
    { key: "actor", header: "Кто", cell: (row) => row.actor },
    { key: "action", header: "Действие", cell: (row) => row.action },
    { key: "detail", header: "Подробности", cell: (row) => row.detail },
  ];

  return (
    <div className="flex flex-col gap-6">
      <GrowthLine />

      <div className="grid gap-6 lg:grid-cols-2">
        <WidgetCard>
          <WidgetCardHeader icon={ShieldCheck} title="Пользователи и роли" level={2} />
          <ul className="mt-4 flex flex-col gap-3">
            {RIGHTS.map((item) => {
              const user = users.find((u) => u.role === item.role);
              return (
                <li key={item.role} className="rounded-[var(--r-sm)] bg-surface-2 p-3">
                  <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
                    {ROLE_LABEL[item.role]}
                    {user && <span className="text-text-3">{user.name}</span>}
                  </p>
                  <p className="mt-1 text-[13px] text-text-2">{item.rights}</p>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[13px] text-text-3">
            Переключатель роли в шапке раздела — удобство показа. Права проверяет сервер: скрытый
            пункт меню защитой не является.
          </p>
        </WidgetCard>

        <WidgetCard>
          <WidgetCardHeader
            icon={SlidersHorizontal}
            title="Правила расчёта"
            hint="Только просмотр: правила меняются решением заказчика"
            level={2}
          />
          <ul className="mt-4 flex list-disc flex-col gap-1 ps-5 text-[13px] text-text-2">
            {RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
          <p className="mt-4 text-[13px] font-medium">Открытые вопросы</p>
          <ul className="mt-2 flex flex-col gap-1 text-[13px] text-text-2">
            {OPEN_QUESTIONS.map((question) => (
              <li key={question} className="flex gap-2">
                <StatusBadge tone="warn">?</StatusBadge>
                <span>{question}</span>
              </li>
            ))}
          </ul>
        </WidgetCard>
      </div>

      <WidgetCard>
        <WidgetCardHeader
          icon={PlugZap}
          title="Подключения"
          hint="Ни одно не подключено: прототип работает на моках"
          level={2}
        />
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {CONNECTIONS.map((item) => (
            <li
              key={item.name}
              className="flex items-center justify-between gap-3 rounded-[var(--r-sm)] border border-line p-3"
            >
              <span>
                <span className="block text-[13px] font-medium">{item.name}</span>
                <span className="block text-[13px] text-text-3">{item.detail}</span>
              </span>
              <StatusBadge tone="neutral">{item.state}</StatusBadge>
            </li>
          ))}
        </ul>
      </WidgetCard>

      <WidgetCard>
        <WidgetCardHeader
          icon={History}
          title="Журнал действий"
          hint={`${audit.length} записей в этой вкладке`}
          level={2}
        />
        <div className="mt-4">
          <WidgetTable columns={columns} rows={audit} />
        </div>
      </WidgetCard>
    </div>
  );
}
