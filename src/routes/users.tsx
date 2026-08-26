import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Minus, Search, Send } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { DataTable, type Column } from "@/components/common/DataTable";
import { EmptyState } from "@/components/common/EmptyState";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { users, type User } from "@/mock/users";
import { projects } from "@/mock/projects";
import { accessLabel, permissionMatrix, permissionRoles, type Access } from "@/mock/permissions";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/users")({
  head: () => ({
    meta: [
      { title: "Пользователи и роли — ФАСАД-РП" },
      { name: "description", content: "Сотрудники, привязка Telegram, объекты и матрица прав по ролям." },
      { property: "og:title", content: "Пользователи и роли — ФАСАД-РП" },
      { property: "og:description", content: "Сотрудники, привязка Telegram, объекты и матрица прав по ролям." },
    ],
  }),
  component: UsersPage,
});

const shortName = (id: string) => projects.find((p) => p.id === id)?.shortName ?? id;

function UsersPage() {
  const [q, setQ] = useState("");
  const rows = users.filter(
    (u) => u.name.toLowerCase().includes(q.toLowerCase()) || u.role.toLowerCase().includes(q.toLowerCase()),
  );

  const columns: Column<User>[] = [
    {
      key: "name",
      header: "ФИО",
      cell: (u) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-caption font-medium text-accent">
            {u.initials}
          </span>
          <div className="min-w-0">
            <div className="truncate font-medium">{u.name}</div>
            <div className="truncate text-caption text-text-muted">{u.email}</div>
          </div>
        </div>
      ),
    },
    { key: "role", header: "Роль", cell: (u) => <StatusBadge tone="neutral">{u.role}</StatusBadge> },
    {
      key: "projects",
      header: "Объекты",
      cell: (u) =>
        u.projects.length === 0 ? (
          <span className="text-text-muted">Все объекты</span>
        ) : (
          <span className="line-clamp-2 text-caption">{u.projects.map(shortName).join(", ")}</span>
        ),
    },
    {
      key: "tg",
      header: "Telegram",
      cell: (u) =>
        u.telegram ? (
          <StatusBadge tone="ok" dot>
            <Send className="size-3" /> Привязан
          </StatusBadge>
        ) : (
          <StatusBadge tone="neutral">Не привязан</StatusBadge>
        ),
    },
    { key: "last", header: "Последняя активность", align: "right", cell: (u) => <span className="tnum">{fmtDateTime(u.lastActive)}</span> },
    {
      key: "status",
      header: "Статус",
      align: "right",
      cell: (u) => <StatusBadge tone={u.active ? "ok" : "neutral"} dot>{u.active ? "Активен" : "Отключён"}</StatusBadge>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Пользователи и роли"
        description="Сотрудники компании, их объекты и матрица прав. Редактирование прав в прототипе не сохраняется."
        meta={
          <>
            <StatusBadge tone="neutral">Сотрудников: {users.length}</StatusBadge>
            <StatusBadge tone="ok" dot>Активны: {users.filter((u) => u.active).length}</StatusBadge>
            <StatusBadge tone="info">Данные синтетические</StatusBadge>
          </>
        }
      />

      <Tabs defaultValue="people">
        <TabsList>
          <TabsTrigger value="people">Пользователи</TabsTrigger>
          <TabsTrigger value="roles">Роли</TabsTrigger>
        </TabsList>

        <TabsContent value="people" className="pt-3">
          <div className="card-surface">
            <div className="border-b border-border p-3">
              <div className="relative max-w-sm">
                <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Поиск по ФИО или роли"
                  className="h-10 pl-9"
                />
              </div>
            </div>
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(u) => u.id}
              empty={
                <EmptyState
                  icon={Search}
                  title="Сотрудники не найдены"
                  description="Измените поисковый запрос."
                />
              }
            />
          </div>
        </TabsContent>

        <TabsContent value="roles" className="pt-3">
          <div className="card-surface">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <h2 className="text-card-title">Матрица прав: разделы × роли</h2>
              <div className="flex flex-wrap items-center gap-3 text-caption text-text-muted">
                <span className="flex items-center gap-1.5"><Cell access="write" /> Запись</span>
                <span className="flex items-center gap-1.5"><Cell access="read" /> Чтение</span>
                <span className="flex items-center gap-1.5"><Cell access="none" /> Нет доступа</span>
              </div>
            </div>
            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-table">
                <thead>
                  <tr className="border-b border-border-strong">
                    <th className="sticky left-0 z-10 bg-[color:var(--bg-elevated)] px-4 py-2.5 text-left text-caption font-medium text-text-secondary">
                      Раздел
                    </th>
                    {permissionRoles.map((r) => (
                      <th key={r} className="px-3 py-2.5 text-center text-caption font-medium whitespace-nowrap text-text-secondary">
                        {r}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {permissionMatrix.map((row, i) => (
                    <tr key={row.section} className={cn("border-b border-border", i % 2 === 1 && "bg-subtle/60")}>
                      <td className={cn("sticky left-0 z-10 px-4 py-2.5", i % 2 === 1 ? "bg-subtle" : "bg-[color:var(--bg-elevated)]")}>
                        <div className="font-medium whitespace-nowrap">{row.section}</div>
                        {row.note && <div className="text-caption text-text-muted">{row.note}</div>}
                      </td>
                      {permissionRoles.map((r) => (
                        <td key={r} className="px-3 py-2.5 text-center">
                          <Cell access={row.access[r]} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-border px-4 py-3 text-caption text-text-muted">
              Права ролей «Руководитель проекта» и «Прораб» точно соответствуют поведению прототипа:
              прорабу доступны Дашборд, Задачи, Отчёты, График и Документы, остальные разделы отдают экран
              «Доступ ограничен».
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}

function Cell({ access }: { access: Access }) {
  const cls: Record<Access, string> = {
    write: "bg-ok-bg text-ok",
    read: "bg-info-bg text-info",
    none: "bg-subtle text-text-muted",
  };
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn("inline-flex size-6 items-center justify-center rounded-xl", cls[access])}
          aria-label={accessLabel[access]}
        >
          {access === "write" ? (
            <Check className="size-3.5" strokeWidth={2.5} />
          ) : access === "read" ? (
            <span className="size-2 rounded-full bg-current" />
          ) : (
            <Minus className="size-3.5" />
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent>{accessLabel[access]}</TooltipContent>
    </Tooltip>
  );
}
