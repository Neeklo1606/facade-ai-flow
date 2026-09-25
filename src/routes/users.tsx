import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Link2, Send, ShieldOff, UserPlus } from "lucide-react";
import { employeeRoleLabel, type Employee, type EmployeeRole } from "@/contracts";
import { accessStateFn, inviteEmployeeFn, revokeEmployeeFn } from "@/api/auth-functions";
import { useAccess } from "@/api/access";
import { queries } from "@/api/queries";
import { useSaveEmployee } from "@/api/mutations";
import { dataSource } from "@/api/config";
import { fmtDateTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel } from "@/components/common/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/**
 * Сотрудники и доступ (ADR-021, п. 8). Завести человека в систему можно было только вставкой
 * в базу: порт справочника умел читать, и «пригласить сотрудника» из плана внедрения
 * не существовало (находка аудита соответствия).
 */
export const Route = createFileRoute("/users")({
  head: () => ({
    meta: [
      { title: "Сотрудники и доступ — neeklo FieldOps" },
      { name: "description", content: "Кто заведён, с какой ролью и на каких объектах." },
    ],
  }),
  component: UsersPage,
});

const ROLES: EmployeeRole[] = ["manager", "supply", "pto", "foreman", "director"];

function UsersPage() {
  const { can } = useAccess();
  const canManage = can("access", "write");
  const employees = useQuery(queries.employees()).data ?? [];
  const projects = useQuery(queries.projects()).data ?? [];
  const state = useQuery({
    queryKey: ["access-state"],
    queryFn: () => accessStateFn(),
    enabled: dataSource === "server",
  }).data;
  const [editing, setEditing] = useState<Employee | "new" | null>(null);

  const invite = async (employee: Employee) => {
    const result = await inviteEmployeeFn({ data: { employeeId: employee.id } });
    if (!result.ok) {
      toast.error(
        result.reason === "no-database"
          ? "Приглашения работают в рабочем контуре: в демонстрации входа нет"
          : "Не удалось пригласить",
      );
      return;
    }
    toast.success(`Приглашение для «${employee.name}» готово`, {
      description: result.url
        ? `Отправка не подключена — передайте ссылку сами: ${result.url}`
        : "Ссылка отправлена на почту. Действует трое суток.",
    });
  };

  const revoke = async (employee: Employee) => {
    const result = await revokeEmployeeFn({ data: { employeeId: employee.id } });
    if (!result.ok) {
      toast.error("Не удалось выключить доступ");
      return;
    }
    toast.success(`Доступ «${employee.name}» выключен`, {
      description: "Его сессии завершены: войти снова можно только по новому приглашению.",
    });
  };

  const inviteOf = (id: string) => state?.invites.find((item) => item.employeeId === id);
  const seenOf = (id: string) => state?.lastSeen.find((item) => item.employeeId === id);
  const projectNames = (employee: Employee) =>
    employee.projectIds.length
      ? employee.projectIds
          .map((id) => projects.find((item) => item.project.id === id)?.project.name ?? id)
          .join(", ")
      : "все";
  /** Состояние доступа словами: «входил тогда-то», «приглашение отправлено», «выключен» */
  const accessState = (employee: Employee) => {
    if (employee.status !== "active") return "выключен";
    const seen = seenOf(employee.id);
    if (seen) return `входил ${fmtDateTime(seen.at)}`;
    const pending = inviteOf(employee.id);
    return pending && !pending.acceptedAt ? "приглашение отправлено" : "не входил";
  };

  /** Действия строки: одна разметка для таблицы и для карточки телефона */
  function RowActions({
    employee,
    pending,
  }: {
    employee: Employee;
    pending: { acceptedAt: string | null } | undefined;
  }) {
    return (
      <span className="inline-flex flex-wrap gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setEditing(employee)}
          aria-label={`Изменить ${employee.name}`}
        >
          Изменить
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void invite(employee)}
          aria-label={`Пригласить ${employee.name}`}
        >
          {pending && !pending.acceptedAt ? (
            <Link2 className="size-3.5" />
          ) : (
            <Send className="size-3.5" />
          )}
          Пригласить
        </Button>
        {/* Выключение спрашивает: промах по значку рядом с «Пригласить» выбрасывал человека
            из системы посреди смены */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="ghost" aria-label={`Выключить доступ ${employee.name}`}>
              <ShieldOff className="size-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Выключить доступ «{employee.name}»?</AlertDialogTitle>
              <AlertDialogDescription>
                Его сессии завершатся сразу, на всех устройствах. Войти снова он сможет только по
                новому приглашению. Записи, которые он сделал, остаются на месте.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Отмена</AlertDialogCancel>
              <AlertDialogAction onClick={() => void revoke(employee)}>Выключить</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </span>
    );
  }

  return (
    <>
      <PageHeader
        title="Сотрудники и доступ"
        meta={<span className="text-caption text-text-secondary">Всего: {employees.length}</span>}
        actions={
          canManage && (
            <Button variant="accent" onClick={() => setEditing("new")}>
              <UserPlus className="size-4" /> Завести сотрудника
            </Button>
          )
        }
      />

      <div data-main-zone className="space-y-4">
        <Panel>
          {/* Таблица — от планшета: на телефоне её колонки уводили действия за край экрана */}
          <table className="hidden w-full text-[13px] lg:table">
            <thead className="text-caption text-text-muted">
              <tr className="border-b border-line">
                <th className="py-2 text-left font-normal">Сотрудник</th>
                <th className="py-2 text-left font-normal">Роль</th>
                <th className="py-2 text-left font-normal">Объекты</th>
                <th className="py-2 text-left font-normal">Телефон</th>
                <th className="py-2 text-left font-normal">Telegram</th>
                <th className="py-2 text-left font-normal">Доступ</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee.id} className="border-b border-line last:border-0">
                  <td className="py-2.5">
                    <span className="block font-medium text-text">{employee.name}</span>
                    <span className="block text-caption text-text-muted">{employee.position}</span>
                  </td>
                  <td className="py-2.5">{employeeRoleLabel[employee.role]}</td>
                  <td className="py-2.5 text-text-2">{projectNames(employee)}</td>
                  <td className="tnum py-2.5 text-text-2">{employee.phone}</td>
                  <td className="py-2.5 text-text-2">{employee.telegram ?? "—"}</td>
                  <td className="py-2.5 text-text-2">{accessState(employee)}</td>
                  <td className="py-2.5 text-right whitespace-nowrap">
                    {canManage && (
                      <RowActions employee={employee} pending={inviteOf(employee.id)} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Телефон: карточка на человека, действия — в строку под ним, целиком на экране */}
          <ul className="grid gap-3 lg:hidden">
            {employees.map((employee) => (
              <li key={employee.id} className="border-b border-line pb-3 last:border-0 last:pb-0">
                <span className="block text-[15px] font-medium text-text">{employee.name}</span>
                <span className="block text-caption text-text-muted">
                  {employee.position} · {employeeRoleLabel[employee.role]}
                </span>
                <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13px]">
                  <dt className="text-text-3">Объекты</dt>
                  <dd className="text-text-2">{projectNames(employee)}</dd>
                  <dt className="text-text-3">Телефон</dt>
                  <dd className="tnum text-text-2">{employee.phone}</dd>
                  <dt className="text-text-3">Доступ</dt>
                  <dd className="text-text-2">{accessState(employee)}</dd>
                </dl>
                {canManage && (
                  <div className="mt-2">
                    <RowActions employee={employee} pending={inviteOf(employee.id)} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Panel>

        <p className="text-[13px] leading-[1.5] text-text-3">
          Роль решает, что человек видит; объекты — по каким из них. Матрица прав целиком — в
          разделе «Права доступа». Приглашение действует трое суток, живое приглашение на сотрудника
          всегда одно: новое гасит прежнее.
        </p>
      </div>

      {editing && (
        <EmployeeDialog
          employee={editing === "new" ? null : editing}
          projects={projects.map((item) => ({ id: item.project.id, name: item.project.name }))}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function EmployeeDialog({
  employee,
  projects,
  onClose,
}: {
  employee: Employee | null;
  projects: { id: string; name: string }[];
  onClose: () => void;
}) {
  const save = useSaveEmployee({ onFailed: (error) => toast.error(error.message) });
  const [name, setName] = useState(employee?.name ?? "");
  const [position, setPosition] = useState(employee?.position ?? "");
  const [role, setRole] = useState<EmployeeRole>(employee?.role ?? "foreman");
  const [phone, setPhone] = useState(employee?.phone ?? "");
  const [email, setEmail] = useState(employee?.email ?? "");
  const [telegram, setTelegram] = useState(employee?.telegram ?? "");
  const [projectIds, setProjectIds] = useState<string[]>(employee?.projectIds ?? []);

  const ready =
    name.trim().length > 2 && position.trim().length > 1 && phone.replace(/\D/g, "").length >= 10;

  const submit = () => {
    save.mutate(
      {
        ...(employee ? { id: employee.id } : {}),
        name: name.trim(),
        position: position.trim(),
        role,
        phone: phone.trim(),
        email: email.trim() || null,
        telegram: telegram.trim() || null,
        projectIds,
      },
      {
        onSuccess: () => {
          toast.success(employee ? "Сотрудник изменён" : "Сотрудник заведён", {
            description: employee
              ? undefined
              : "Дальше — «Пригласить»: он получит ссылку для входа.",
          });
          onClose();
        },
      },
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{employee ? "Изменить сотрудника" : "Завести сотрудника"}</DialogTitle>
          <DialogDescription>
            Телефон — ключ входа: по нему человек получает код. Почта нужна только для ссылки, у
            прорабов её обычно нет.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <label className="grid gap-1.5">
            <span className="text-[13px] text-text-2">ФИО</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="ФИО" />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[13px] text-text-2">Должность</span>
            <Input
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              aria-label="Должность"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[13px] text-text-2">Роль</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as EmployeeRole)}
              aria-label="Роль"
              className="focus-ring h-10 rounded-[var(--r-sm)] border border-line bg-surface-2 px-3 text-[14px] text-text"
            >
              {ROLES.map((item) => (
                <option key={item} value={item}>
                  {employeeRoleLabel[item]}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1.5">
              <span className="text-[13px] text-text-2">Телефон</span>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                aria-label="Телефон"
                className="tnum"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[13px] text-text-2">Telegram</span>
              <Input
                value={telegram}
                onChange={(e) => setTelegram(e.target.value)}
                placeholder="@nick"
                aria-label="Telegram"
              />
            </label>
          </div>
          <label className="grid gap-1.5">
            <span className="text-[13px] text-text-2">Почта — если есть</span>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              inputMode="email"
              aria-label="Почта"
            />
          </label>

          <fieldset className="grid gap-1.5">
            <legend className="text-[13px] text-text-2">Объекты</legend>
            <span className="text-caption text-text-muted">
              Пусто — все объекты компании. Для прораба и его ролей это граница доступа.
            </span>
            <span className="flex flex-wrap gap-2 pt-1">
              {projects.map((project) => {
                const on = projectIds.includes(project.id);
                return (
                  <label
                    key={project.id}
                    className="focus-ring inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--r-sm)] border border-line px-2.5 py-1.5 text-[13px]"
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        setProjectIds((prev) =>
                          on ? prev.filter((id) => id !== project.id) : [...prev, project.id],
                        )
                      }
                    />
                    {project.name}
                  </label>
                );
              })}
            </span>
          </fieldset>

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Отмена
            </Button>
            <Button onClick={submit} loading={save.isPending} disabled={!ready}>
              {employee ? "Сохранить" : "Завести"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
