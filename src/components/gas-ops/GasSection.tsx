/**
 * Оболочка раздела «Газ: учёт времени» (ADR-042). Своя навигация внутри раздела,
 * выбор роли и честные метки: что входит в договор, а что показано как развитие.
 *
 * Роль меняет и меню, и разрешённые действия. Это удобство показа, а не защита:
 * права будет проверять сервер, скрытый пункт меню защитой не является.
 */
import { Link, useRouterState } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  ROLE_LABEL,
  useGasActions,
  useGasActor,
  useGasUsers,
  useGasWeek,
  type Role,
} from "@/api/gas-ops";
import { toast } from "@/lib/toast";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

interface SectionLink {
  to: string;
  label: string;
  roles: Role[];
}

const LINKS: SectionLink[] = [
  { to: "/gas", label: "Сводка", roles: ["admin", "manager", "director"] },
  { to: "/gas/foreman", label: "Бригадир", roles: ["admin", "manager", "foreman"] },
  { to: "/gas/moderation", label: "Проверка", roles: ["admin", "manager"] },
  { to: "/gas/entries", label: "Журнал", roles: ["admin", "manager", "foreman", "director"] },
  { to: "/gas/reports", label: "Отчёт", roles: ["admin", "manager", "director"] },
  { to: "/gas/brigades", label: "Бригады", roles: ["admin", "manager", "director"] },
  { to: "/gas/objects", label: "Объекты", roles: ["admin", "manager", "director"] },
  { to: "/gas/estimates", label: "Стоимость", roles: ["admin", "manager"] },
  { to: "/gas/employees", label: "Сотрудники", roles: ["admin", "manager"] },
  { to: "/gas/admin", label: "Настройка", roles: ["admin"] },
];

export function GasSectionNav() {
  const actor = useGasActor();
  const week = useGasWeek();
  const users = useGasUsers();
  const actions = useGasActions();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const links = LINKS.filter((link) => link.roles.includes(actor.role));

  return (
    <div className="mb-6 flex flex-col gap-3 border-b border-line pb-4">
      {/*
       * Шапка раздела. На телефоне она идёт сразу после шапки приложения, поэтому держим её
       * в две строки: название с неделей и строка управления. Заголовок на телефоне меньше:
       * экран всё равно подписан в шапке приложения, и место нужнее содержимому.
       */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-section-title lg:text-page-title">Газ: учёт времени бригад</h1>
        <StatusBadge tone="info">
          {fmtDate(week.from)} — {fmtDate(week.to)}
        </StatusBadge>
        <span className="text-[13px] text-text-3">сегодня {fmtDate(week.today)}</span>
      </div>

      <div className="flex items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 text-[13px] text-text-3 sm:flex-none">
          <span className="shrink-0">Роль</span>
          <select
            aria-label="Роль в учёте времени"
            value={actor.id}
            onChange={(event) => {
              const userId = event.target.value;
              void actions.signIn(userId).then((result) => {
                if (!result.ok) {
                  toast.error(result.message);
                  return;
                }
                const user = users.find((u) => u.id === userId);
                toast.success(`Вход как ${user?.name ?? "сотрудник"}`, {
                  description: user ? ROLE_LABEL[user.role] : undefined,
                });
              });
            }}
            className="h-12 min-w-0 flex-1 rounded-[var(--r-sm)] border border-line bg-surface px-3 text-[13px] text-text focus-ring sm:h-9 sm:w-[230px] sm:flex-none"
          >
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name === ROLE_LABEL[user.role]
                  ? user.name
                  : `${user.name} — ${ROLE_LABEL[user.role]}`}
              </option>
            ))}
          </select>
        </label>
        {/*
         * Сброс: на телефоне только значок, чтобы строка управления оставалась в одну строку.
         * Подпись отличается от общей кнопки сброса в меню — сбрасывается только учёт времени.
         */}
        <Button
          variant="outline"
          size="sm"
          aria-label="Сбросить данные учёта"
          title="Сбросить данные учёта"
          onClick={() => {
            void actions.reset().then(() => toast.success("Демо-данные сброшены"));
          }}
          className="size-12 shrink-0 p-0 sm:ms-auto sm:h-9 sm:w-auto sm:px-4"
        >
          <RotateCcw className="size-4" aria-hidden />
          <span className="sr-only sm:not-sr-only">Сбросить данные учёта</span>
        </Button>
      </div>

      {/* Полоса разделов прокручивается пальцем: на телефоне в строку они не помещаются */}
      <nav aria-label="Разделы учёта времени" className="-mx-1 overflow-x-auto">
        <ul className="flex min-w-max items-center gap-1 px-1">
          {links.map((link) => {
            const active = link.to === "/gas" ? pathname === "/gas" : pathname.startsWith(link.to);
            return (
              <li key={link.to}>
                <Link
                  to={link.to}
                  className={cn(
                    "inline-flex h-12 min-w-[48px] items-center justify-center rounded-full px-4 text-[13px] font-medium transition-fast focus-ring lg:h-10",
                    active
                      ? "bg-orange-dim text-orange-hot"
                      : "text-text-2 hover:bg-surface-2 hover:text-text",
                  )}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

/**
 * Метка «вне договора». По ТЗ v1.0 в договор входят бот, модерация, отчёт и экспорт.
 * Веб-админка, дашборд и аналитика в договор не входят: они показаны как развитие,
 * и метка стоит на самом экране, а не в сноске.
 */
export function OutOfScopeNotice({ children }: { children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[var(--r-sm)] border border-warn/40 bg-warn-bg px-4 py-3">
      <StatusBadge tone="warn">Демо: вне текущего договора</StatusBadge>
      <p className="text-[13px] text-text-2">
        {children ??
          "Этот экран не входит в договор v1.0. Он показывает, как раздел может выглядеть при развитии системы."}
      </p>
    </div>
  );
}

/** Полоса «что это за данные»: факт из отчёта заказчика или демо-сценарий */
export function DataSourceLegend() {
  return (
    <p className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-text-3">
      <StatusBadge tone="neutral">Факт</StatusBadge>
      <span>— из отчёта заказчика за 28.09–03.10.2026: суммы, часы и интервалы настоящие,</span>
      <span>ФИО и адреса обезличены.</span>
      <StatusBadge tone="accent">Демо</StatusBadge>
      <span>— придумано для показа сценариев.</span>
    </p>
  );
}
