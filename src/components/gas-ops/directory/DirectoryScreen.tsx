/**
 * «Справочники» (ADR-056, 6): состав бригад с периодами, ставки с периодами и профиль
 * выгрузки Excel. Сметы, объекты с графиком и режим проверки живут на своих экранах,
 * сюда ведут ссылки: один справочник — одно место правки.
 */
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, UserMinus, UserPlus } from "lucide-react";
import { useState } from "react";
import {
  CREW_ROLE_LABEL,
  fmtRub,
  useGasActions,
  useGasActor,
  useGasCrew,
  useGasDirectory,
  useGasExportProfile,
  useGasReport,
  useGasWeek,
  useGasWeekView,
} from "@/api/gas-ops";
import {
  Button,
  Card,
  EmptyState,
  FormField,
  SegmentedPills,
  SelectSheet,
  StatusChip,
} from "@/components/ui/mono";
import { toast } from "@/lib/toast";

type Section = "crew" | "rates" | "export";

const SECTIONS = [
  { value: "crew", label: "Состав" },
  { value: "rates", label: "Ставки" },
  { value: "export", label: "Выгрузка Excel" },
] as const;

function ru(iso: string | null): string {
  return iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "";
}

export function DirectoryScreen() {
  const [section, setSection] = useState<Section>("crew");
  const actor = useGasActor();
  // Ставки — финансы: бригадиру экран не открывается и по прямой ссылке (1.2)
  if (actor.role === "foreman") {
    return (
      <EmptyState
        title="Справочники ведёт менеджер"
        text="Состав бригады меняет менеджер. Если в составе ошибка, напишите ему в «Моих записях»."
      />
    );
  }
  return (
    <div className="flex flex-col gap-section">
      <SegmentedPills label="Справочник" options={SECTIONS} value={section} onChange={setSection} />
      {section === "crew" ? (
        <CrewSection />
      ) : section === "rates" ? (
        <RatesSection />
      ) : (
        <ExportSection />
      )}
      <Card title="Другие справочники">
        <ul className="flex flex-col divide-y divide-line">
          {[
            { to: "/gas/estimates", label: "Сметы и правило стоимости работ" },
            { to: "/gas/objects", label: "Объекты и импорт графика" },
            { to: "/gas/admin", label: "Режим проверки, роли и журнал действий" },
          ].map((link) => (
            <li key={link.to}>
              <Link to={link.to} className="mono-row focus-ring justify-between">
                <span className="type-text">{link.label}</span>
                <ArrowUpRight className="size-5 text-ink-3" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function CrewSection() {
  const directory = useGasDirectory();
  const { crew } = useGasCrew();
  const week = useGasWeek();
  const actor = useGasActor();
  const actions = useGasActions();
  const canEdit = actor.role === "manager" || actor.isAdmin;
  const [brigadeId, setBrigadeId] = useState<string | null>(directory.brigades[0]?.id ?? null);
  const [name, setName] = useState("");
  const [from, setFrom] = useState(week.today);
  const [error, setError] = useState<string | null>(null);
  const members = crew.filter((m) => m.brigadeId === brigadeId);

  return (
    <Card title="Состав бригады">
      <div className="flex flex-col gap-4">
        <SelectSheet
          label="Бригада"
          value={brigadeId}
          onChange={setBrigadeId}
          options={directory.brigades.map((b) => ({
            value: b.id,
            label: b.name,
            meta: b.leadName ? `бригадир ${b.leadName}` : "бригадир не указан",
          }))}
        />
        {members.length === 0 ? (
          <EmptyState
            title="Состав не задан"
            text="Без состава число людей в записи не подставляется."
          />
        ) : (
          <ul aria-label="Люди в составе" className="flex flex-col divide-y divide-line">
            {members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 type-text font-medium">
                    {m.name}
                    {m.source === "mock" ? <StatusChip tone="neutral">Демо</StatusChip> : null}
                    {m.active ? null : <StatusChip tone="caution">Не в составе</StatusChip>}
                  </p>
                  <p className="type-small text-ink-3">
                    {CREW_ROLE_LABEL[m.role]} · {m.from ? `с ${ru(m.from)}` : "с начала учёта"}
                    {m.to ? ` по ${ru(m.to)}` : ""}
                  </p>
                </div>
                {canEdit && m.active && m.role !== "lead" ? (
                  <Button
                    variant="secondary"
                    aria-label={`Вывести из состава: ${m.name}`}
                    onClick={async () => {
                      const result = await actions.endCrewMember({ id: m.id, to: week.today });
                      if (!result.ok) return setError(result.message);
                      toast.success(`${m.name} в составе по ${ru(week.today)}`);
                    }}
                  >
                    <UserMinus aria-hidden />
                    Вывести
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canEdit && brigadeId ? (
          <div className="flex flex-col gap-3 mono-inset">
            <p className="type-label">Добавить в состав</p>
            <FormField label="Имя или роль">
              {(props) => (
                <input
                  {...props}
                  className="mono-input focus-ring"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Например, Монтажник 4"
                />
              )}
            </FormField>
            <FormField label="В составе с" hint="Дата, с которой человек считается в бригаде">
              {(props) => (
                <input
                  {...props}
                  type="date"
                  className="mono-input focus-ring"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                />
              )}
            </FormField>
            <Button
              onClick={async () => {
                const result = await actions.addCrewMember({ brigadeId, name, from });
                if (!result.ok) return setError(result.message);
                setError(null);
                setName("");
                toast.success(`${result.value.name} добавлен в состав с ${ru(from)}`);
              }}
            >
              <UserPlus aria-hidden />
              Добавить
            </Button>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="type-label text-down">
            {error}
          </p>
        ) : null}
      </div>
    </Card>
  );
}

function RatesSection() {
  const directory = useGasDirectory();
  const { rates } = useGasCrew();
  const week = useGasWeek();
  const actor = useGasActor();
  const actions = useGasActions();
  const canEdit = actor.role === "director" || actor.isAdmin;
  const [brigadeId, setBrigadeId] = useState<string | null>(directory.brigades[0]?.id ?? null);
  const [value, setValue] = useState("");
  const [from, setFrom] = useState(week.from);
  const [error, setError] = useState<string | null>(null);
  const nameOf = (id: string | null) =>
    directory.brigades.find((b) => b.id === id)?.name ?? "Человек";

  return (
    <Card title="Ставки за час">
      <div className="flex flex-col gap-4">
        {rates.length === 0 ? (
          <EmptyState
            title="Ставки не заданы"
            text="Стоимость труда скрыта на всех экранах, пока нет ставок. В данных заказчика ставок нет."
          />
        ) : (
          <ul aria-label="Ставки" className="flex flex-col divide-y divide-line">
            {rates.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                <span className="type-text">{nameOf(r.brigadeId)}</span>
                <span className="text-end type-small text-ink-3">
                  {fmtRub(r.rubPerHour)}/ч · с {ru(r.from)}
                  {r.to ? ` по ${ru(r.to)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        {canEdit ? (
          <div className="flex flex-col gap-3 mono-inset">
            <p className="type-label">Новая ставка бригады</p>
            <SelectSheet
              label="Бригада"
              value={brigadeId}
              onChange={setBrigadeId}
              options={directory.brigades.map((b) => ({ value: b.id, label: b.name }))}
            />
            <FormField label="Рублей за час одного человека">
              {(props) => (
                <input
                  {...props}
                  inputMode="numeric"
                  className="mono-input focus-ring tnum"
                  value={value}
                  onChange={(event) => setValue(event.target.value.replace(/[^\d]/g, ""))}
                  placeholder="Например, 450"
                />
              )}
            </FormField>
            <FormField label="Действует с" hint="Прежняя ставка закроется накануне этой даты">
              {(props) => (
                <input
                  {...props}
                  type="date"
                  className="mono-input focus-ring"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                />
              )}
            </FormField>
            <Button
              disabled={!brigadeId || !value}
              onClick={async () => {
                if (!brigadeId) return;
                const result = await actions.setRate({
                  employeeId: null,
                  brigadeId,
                  rubPerHour: Number(value),
                  from,
                });
                if (!result.ok) return setError(result.message);
                setError(null);
                setValue("");
                toast.success("Ставка сохранена");
              }}
            >
              Сохранить ставку
            </Button>
          </div>
        ) : (
          <p className="type-small text-ink-3">Ставки задаёт руководитель или администратор.</p>
        )}
        {error ? (
          <p role="alert" className="type-label text-down">
            {error}
          </p>
        ) : null}
      </div>
    </Card>
  );
}

function ExportSection() {
  const report = useGasReport("confirmed");
  const view = useGasWeekView();
  const { profile, headers, check } = useGasExportProfile();
  const closed = view.period.closed;
  return (
    <Card title="Профиль выгрузки Excel">
      <dl className="flex flex-col divide-y divide-line">
        {[
          ["Шаблон", profile.name],
          ["Лист", profile.sheet],
          ["Период", `${ru(report.week.from)} – ${ru(report.week.to)}`],
          [
            "Номер версии",
            closed
              ? `v${closed.version}, неделя закрыта`
              : `v${view.period.nextVersion} при закрытии недели`,
          ],
          ["Столбцы каждого дня", headers.join(", ")],
        ].map(([term, value]) => (
          <div
            key={term}
            className="flex flex-col gap-1 py-3 first:pt-0 lg:flex-row lg:justify-between"
          >
            <dt className="type-label text-ink-3">{term}</dt>
            <dd className="type-text lg:text-end">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex flex-col gap-2" aria-label="Сверка профиля">
        <p className="flex flex-wrap items-center gap-2">
          {check.missing.length === 0 ? (
            <StatusChip tone="up">Обязательные столбцы на месте</StatusChip>
          ) : (
            <StatusChip tone="down">Нет столбцов: {check.missing.join(", ")}</StatusChip>
          )}
        </p>
        <p className="flex flex-wrap items-center gap-2">
          {check.fileTotalRub === check.screenTotalRub ? (
            <StatusChip tone="up">Итог файла сходится с экраном</StatusChip>
          ) : (
            <StatusChip tone="down">Итог файла не сходится с экраном</StatusChip>
          )}
          <span className="type-small text-ink-3">
            файл {fmtRub(check.fileTotalRub)}, экран «Неделя» {fmtRub(check.screenTotalRub)}
          </span>
        </p>
      </div>
      <p className="mt-4 type-small text-ink-3">
        Предпросмотр строк открывается на экране «Отчёт». Шаблон заказчика подтверждает его
        специалист: структура повторяет присланный файл, формулы итогов считают суммы по строкам.
      </p>
      <Link to="/gas/reports" className="mt-3 mono-btn mono-btn-secondary focus-ring">
        Открыть предпросмотр
      </Link>
    </Card>
  );
}
