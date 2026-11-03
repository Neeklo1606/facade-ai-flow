import { completePageHead } from "@/lib/page-head";
import { DirectoryImport } from "@/components/gas-ops/directory/DirectoryImport";
import { DirectoryTabs } from "@/components/gas-ops/directory/DirectoryTabs";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { MoreHorizontal, Send, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/ui/kit/controls";
import { DataTable, type TableColumn } from "@/components/ui/kit/data";
import { ListRow } from "@/components/ui/kit/list";
import { EmptyBlock } from "@/components/ui/kit/states";
import { ConfirmDialog } from "@/components/ui/mono";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScreenActions } from "@/components/gas-ops/shell/screen-header";
import { useIsDesktop } from "@/components/gas-ops/review/use-layout";
import { SourceMark } from "@/components/gas-ops/marks";
import {
  ROLE_LABEL,
  inviteOf,
  useGasActions,
  useGasActor,
  useGasStaff,
  useGasWeek,
  type Role,
  type StaffRow,
} from "@/api/gas-ops";
import { plural } from "@/lib/format";
import { toast } from "@/lib/toast";

/**
 * «Сотрудники» (ADR-061, 12; раздел 4.7, образец ПТО Онлайн): ФИО, должность, телефон,
 * бригада, роль в системе, MAX, последняя активность. «Пригласить сотрудника» и «Отправить
 * приглашение» в демо показывают ссылку и код: канал MAX не подключён, ничего не уходит.
 * «Изменить роль» — администратор, «Деактивировать» закрывает период в составе бригады.
 */
export const Route = createFileRoute("/gas/employees")({
  head: () =>
    completePageHead(
      { meta: [{ title: "Сотрудники · Учёт выработки бригад" }] },
      "Сотрудники · Учёт выработки бригад",
      "Сотрудники бригад и офиса: роли, MAX, активность.",
    ),
  component: EmployeesPage,
});

const ROLES: Role[] = ["admin", "manager", "director", "foreman", "prorab", "supply", "pto"];

/** «03.10 в 13:05» */
function stamp(at: string | null): string {
  return at ? `${at.slice(8, 10)}.${at.slice(5, 7)} в ${at.slice(11, 16)}` : "–";
}

function EmployeesPage() {
  const rows = useGasStaff();
  const actor = useGasActor();
  const actions = useGasActions();
  const week = useGasWeek();
  const desktop = useIsDesktop();
  const [search, setSearch] = useState("");
  const [invite, setInvite] = useState<StaffRow | "pick" | null>(null);
  const [roleOf, setRoleOf] = useState<StaffRow | null>(null);
  const [deactivate, setDeactivate] = useState<StaffRow | null>(null);
  const canManage = actor.role === "manager" || actor.isAdmin;

  const shown = useMemo(() => {
    const text = search.trim().toLowerCase();
    return rows.filter((r) =>
      text
        ? [r.name, r.position, r.brigadeName ?? ""].some((v) => v.toLowerCase().includes(text))
        : true,
    );
  }, [rows, search]);
  const noMax = rows.filter((r) => r.active && !r.maxId);

  const menu = (row: StaffRow) => (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Действия: ${row.name}`}
        className="touch-target grid h-control-sm w-[32px] place-items-center rounded-control text-text-2 focus-ring is-hover:bg-surface-2"
      >
        <MoreHorizontal className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[220px]">
        {!row.maxId ? (
          <DropdownMenuItem onSelect={() => setInvite(row)}>Отправить приглашение</DropdownMenuItem>
        ) : null}
        <DropdownMenuItem disabled={!actor.isAdmin || !row.userId} onSelect={() => setRoleOf(row)}>
          Изменить роль
          {!row.userId ? <span className="ms-auto text-meta text-text-3">нет входа</span> : null}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!canManage || !row.crewId || row.until !== null}
          onSelect={() => setDeactivate(row)}
          className="text-danger"
        >
          Деактивировать
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const maxCell = (row: StaffRow) =>
    row.maxId ? (
      <span>
        подключён <span className="text-meta text-text-3">(демо)</span>
      </span>
    ) : (
      <span className="inline-flex flex-wrap items-center gap-x-1">
        <span className="text-text-2">не подключён</span>
        <button
          type="button"
          onClick={() => setInvite(row)}
          className="inline-flex min-h-control-sm items-center text-meta-strong text-orange focus-ring"
        >
          Отправить приглашение
        </button>
      </span>
    );

  const columns: TableColumn<StaffRow>[] = [
    {
      key: "name",
      title: "Фамилия, имя",
      cell: (r) => (
        <span className={r.until ? "text-text-3" : undefined}>
          {r.name}
          {r.until ? (
            <span className="ms-1 text-meta">
              {r.active
                ? `(деактивирован, последний день ${r.until.slice(8, 10)}.${r.until.slice(5, 7)})`
                : "(деактивирован)"}
            </span>
          ) : null}
        </span>
      ),
    },
    { key: "position", title: "Должность", cell: (r) => r.position },
    {
      key: "phone",
      title: "Телефон",
      cell: () => (
        <span className="text-text-3" title="Телефона в данных нет: поле появится с базой">
          –
        </span>
      ),
    },
    { key: "brigade", title: "Бригада", cell: (r) => r.brigadeName ?? "офис" },
    {
      key: "role",
      title: "Роль в системе",
      cell: (r) => (r.role ? ROLE_LABEL[r.role] : <span className="text-text-3">нет входа</span>),
    },
    { key: "max", title: "MAX", cell: maxCell },
    { key: "activity", title: "Последняя активность", cell: (r) => stamp(r.lastActivity) },
    { key: "menu", title: "", cell: (r) => menu(r) },
  ];

  return (
    <div className="flex flex-col gap-block">
      <DirectoryTabs />
      <ScreenActions>
        {actor.role === "manager" || actor.isAdmin ? <DirectoryImport kind="employees" /> : null}
        <Button variant="primary" onClick={() => setInvite("pick")}>
          <UserPlus aria-hidden />
          Пригласить сотрудника
        </Button>
      </ScreenActions>
      <div className="flex flex-wrap items-center gap-2">
        <SearchBar
          className="min-w-0 flex-1 lg:max-w-[360px]"
          label="Поиск сотрудника"
          placeholder="ФИО, должность, бригада"
          value={search}
          onChange={setSearch}
        />
        <p className="text-meta text-text-2 tnum">
          {shown.length} {plural(shown.length, "сотрудник", "сотрудника", "сотрудников")} · без MAX{" "}
          {noMax.length}
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyBlock
          icon={Users}
          title="Сотрудников пока нет"
          text="Добавьте людей в состав бригады или пригласите в MAX"
          action={
            <Button variant="outline" onClick={() => setInvite("pick")}>
              Пригласить сотрудника
            </Button>
          }
        />
      ) : desktop ? (
        <DataTable label="Сотрудники" rows={shown} columns={columns} rowKey={(r) => r.id} />
      ) : (
        <ul className="surface-1 overflow-hidden [&>li+li]:border-t [&>li+li]:border-line">
          {shown.map((row) => (
            <li key={row.id} className="flex items-center gap-2 pe-2">
              <div className="min-w-0 flex-1">
                <ListRow
                  title={row.name}
                  meta={
                    <>
                      {row.position} · {row.brigadeName ?? "офис"} ·{" "}
                      {row.role ? ROLE_LABEL[row.role] : "нет входа"} · MAX{" "}
                      {row.maxId ? "подключён (демо)" : "не подключён"}
                    </>
                  }
                  valueMeta={<SourceMark source={row.source} />}
                />
              </div>
              {menu(row)}
            </li>
          ))}
        </ul>
      )}
      <p className="text-meta text-text-3">
        ФИО обезличены: в отчёте заказчика они настоящие, в прототип перенесены роли. Канал MAX не
        подключён: приглашения показывают ссылку и код, но ничего не отправляют.
      </p>

      <InviteDialog
        target={invite}
        candidates={noMax}
        onClose={() => setInvite(null)}
        onPick={(row) => setInvite(row)}
      />

      {roleOf ? (
        <RoleDialog
          row={roleOf}
          onClose={() => setRoleOf(null)}
          onSave={async (role) => {
            const result = await actions.setUserRole({ userId: roleOf.userId!, role });
            if (!result.ok) {
              toast.error(result.message);
              return;
            }
            toast.success(`Роль изменена: ${roleOf.name}, теперь ${ROLE_LABEL[role]}`);
            setRoleOf(null);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={!!deactivate}
        onOpenChange={(open) => (open ? null : setDeactivate(null))}
        title={`Деактивировать: ${deactivate?.name ?? ""}?`}
        text={`Человек выйдет из состава бригады с ${week.today}. Его прошлые записи и часы остаются в табеле. Вернуть можно, добавив его в состав снова.`}
        confirm="Деактивировать"
        onConfirm={async () => {
          const row = deactivate!;
          setDeactivate(null);
          const result = await actions.endCrewMember({ id: row.crewId!, to: week.today });
          if (!result.ok) toast.error(result.message);
          else toast.success(`${row.name}: деактивирован, период в составе закрыт`);
        }}
      />
    </div>
  );
}

function InviteDialog({
  target,
  candidates,
  onClose,
  onPick,
}: {
  target: StaffRow | "pick" | null;
  candidates: StaffRow[];
  onClose: () => void;
  onPick: (row: StaffRow) => void;
}) {
  const row = target && target !== "pick" ? target : null;
  const invite = row ? inviteOf(row.id) : null;
  return (
    <Dialog open={target !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {row ? `Приглашение в MAX: ${row.name}` : "Пригласить сотрудника"}
          </DialogTitle>
          <DialogDescription>
            Демо: канал MAX не подключён. Ссылка и код показаны, но никуда не отправлены.
          </DialogDescription>
        </DialogHeader>
        {row && invite ? (
          <div className="flex flex-col gap-3" data-testid="invite">
            <p className="text-body">
              Код приглашения:{" "}
              <span className="text-title tnum" data-testid="invite-code">
                {invite.code}
              </span>
            </p>
            <p className="break-all rounded-control bg-surface-2 px-3 py-2 text-meta tnum">
              {invite.link}
            </p>
            <p className="text-meta text-text-3">
              После подключения MAX (T7) бот примет этот код и свяжет человека с бригадой.
            </p>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(`${invite.link}\nКод: ${invite.code}`);
                  toast.success("Ссылка и код скопированы");
                } catch {
                  toast.error("Не удалось скопировать: выделите текст вручную");
                }
              }}
            >
              <Send aria-hidden />
              Скопировать ссылку и код
            </Button>
          </div>
        ) : (
          <ul className="flex max-h-80 flex-col overflow-y-auto" aria-label="Кого пригласить">
            {candidates.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onPick(c)}
                  className="flex min-h-11 w-full items-center justify-between gap-2 rounded-control px-2 text-left text-body focus-ring is-hover:bg-surface-2"
                >
                  <span>{c.name}</span>
                  <span className="text-meta text-text-3">
                    {c.position} · {c.brigadeName ?? "офис"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RoleDialog({
  row,
  onClose,
  onSave,
}: {
  row: StaffRow;
  onClose: () => void;
  onSave: (role: Role) => Promise<void>;
}) {
  const [role, setRole] = useState<Role>(row.role ?? "foreman");
  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Роль: {row.name}</DialogTitle>
          <DialogDescription>Изменение запишется в журнал действий.</DialogDescription>
        </DialogHeader>
        <div role="radiogroup" aria-label="Роль в системе" className="flex flex-wrap gap-2">
          {ROLES.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={role === value}
              onClick={() => setRole(value)}
              className={`inline-flex min-h-11 items-center rounded-full px-3 text-body focus-ring ${
                role === value ? "bg-pill text-pill-text" : "bg-surface-2 text-text"
              }`}
            >
              {ROLE_LABEL[value]}
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button disabled={role === row.role} onClick={() => void onSave(role)}>
            Сохранить роль
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
