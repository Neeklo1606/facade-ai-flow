/**
 * «Люди и вход» (ADR-086): администратор рабочего контура добавляет человека с ролью, выдаёт
 * ссылку входа на 72 часа и отзывает доступ. Ссылку передают лично или в мессенджере: канала
 * SMS или Telegram нет, экран так и пишет. Права проверяет сервер (`/api/gas/access`).
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/kit/field";
import { Chip } from "@/components/ui/kit/status";
import { ROLE_LABEL, type Role } from "@/api/gas-ops";
import { useGasAccess, type AccessPerson, type AccessState } from "@/api/gas-access-client";

const STATE_LABEL: Record<AccessState, string> = {
  active: "Входил",
  invited: "Ссылка выдана",
  never: "Не входил",
  revoked: "Доступ отозван",
};

const STATE_TONE = {
  active: "ok",
  invited: "sky",
  never: "neutral",
  revoked: "decide",
} as const;

const when = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso))
    : "";

function stateLine(p: AccessPerson): string {
  if (p.state === "invited") return `ссылка действует до ${when(p.inviteUntil)}`;
  if (p.state === "active") return `последний вход ${when(p.lastSeen)}`;
  if (p.state === "revoked") return "сессии закрыты, вход по ссылке и коду закрыт";
  return "ссылку ещё не выдавали или она истекла";
}

const SELECT = "h-12 max-w-full rounded-control border border-line bg-surface px-3 text-body";

export function PeopleAccess() {
  const { load, act } = useGasAccess(true);
  const [link, setLink] = useState<{ name: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("manager");
  const [brigade, setBrigade] = useState("");

  if (load.kind === "loading") return <p className="text-meta text-text-3">Загружаю людей…</p>;
  if (load.kind === "failed") return <p className="text-meta text-danger">{load.reason}</p>;
  const { people, roles, brigades } = load.data;

  async function run(body: Record<string, string>, who: string) {
    setBusy(true);
    setError(null);
    const result = await act(body);
    setBusy(false);
    if (!result.ok) return setError(result.reason);
    setLink(result.link ? { name: who, url: result.link } : null);
    return result;
  }

  return (
    <div className="flex flex-col gap-4">
      <ul
        aria-label="Люди учёта времени"
        className="surface-1 overflow-hidden [&>li+li]:border-t [&>li+li]:border-line"
      >
        {people.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-row py-3">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 type-text font-medium">
                {p.name}
                <Chip tone={STATE_TONE[p.state]}>{STATE_LABEL[p.state]}</Chip>
              </p>
              <p className="text-meta text-text-3">
                {ROLE_LABEL[p.role as Role] ?? p.role}
                {p.brigade ? ` · ${p.brigade}` : ""}
                {p.phone ? ` · ${p.phone}` : ""} · {stateLine(p)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => void run({ action: "invite", id: p.id }, p.name)}
              >
                {p.state === "never" || p.state === "revoked" ? "Выдать ссылку" : "Новая ссылка"}
              </Button>
              {p.self || p.state === "revoked" ? null : confirm === p.id ? (
                <>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setConfirm(null);
                      void run({ action: "revoke", id: p.id }, p.name);
                    }}
                  >
                    Да, отозвать
                  </Button>
                  <Button variant="quiet" size="sm" onClick={() => setConfirm(null)}>
                    Отмена
                  </Button>
                </>
              ) : (
                <Button variant="destructive" size="sm" onClick={() => setConfirm(p.id)}>
                  Отозвать доступ
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {link ? (
        <div className="surface-1 flex flex-col gap-2 p-4" data-testid="access-link-box">
          <p className="type-text font-medium">Ссылка входа для «{link.name}»</p>
          <p className="text-meta text-text-3">
            Действует 72 часа и срабатывает один раз. Передайте её лично или в мессенджере: SMS и
            Telegram не подключены. Новая ссылка гасит прежнюю.
          </p>
          <input
            readOnly
            aria-label="Ссылка входа"
            data-testid="access-link"
            value={link.url}
            onFocus={(e) => e.currentTarget.select()}
            className="h-12 rounded-control border border-line bg-surface px-3 text-body"
          />
          <div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void navigator.clipboard?.writeText(link.url).catch(() => undefined)}
            >
              Скопировать ссылку
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-meta text-danger">
          {error}
        </p>
      ) : null}

      <form
        aria-label="Добавить человека"
        className="surface-1 flex flex-col gap-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run({ action: "add", name, phone, role, brigade }, name).then((r) => {
            if (r) {
              setName("");
              setPhone("");
              setBrigade("");
            }
          });
        }}
      >
        <p className="type-text font-medium">Добавить человека</p>
        <Field label="Имя и фамилия" value={name} onChange={setName} autoComplete="off" />
        <Field
          label="Телефон"
          value={phone}
          onChange={setPhone}
          inputMode="tel"
          placeholder="+7 900 000-00-00"
          hint="По телефону человек потом входит кодом"
        />
        <label className="flex flex-col gap-1 text-meta text-text-2">
          Роль
          <select className={SELECT} value={role} onChange={(e) => setRole(e.target.value)}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r as Role] ?? r}
              </option>
            ))}
          </select>
        </label>
        {role === "foreman" ? (
          <label className="flex flex-col gap-1 text-meta text-text-2">
            Бригада
            <select className={SELECT} value={brigade} onChange={(e) => setBrigade(e.target.value)}>
              <option value="">Выберите бригаду</option>
              {brigades.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div>
          <Button type="submit" variant="primary" disabled={busy || name.trim().length < 3}>
            Добавить и выдать ссылку
          </Button>
        </div>
      </form>
    </div>
  );
}
