import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, HardHat, LogOut } from "lucide-react";
import { DEMO_PERSONAS, dataSource } from "@/api/config";
import { signOutFn } from "@/api/auth-functions";
import { queries } from "@/api/queries";
import { employeeRoleLabel, type EmployeeRole } from "@/contracts";
import { ALL_PROJECTS, useApp } from "@/lib/app-context";
import { useEnterAs } from "@/lib/persona";
import { useCurrentUser, useProjectId } from "@/lib/project-scope";
import { bottomNavFor, navItemsFor, plusActionsFor, sectionHref } from "@/lib/navigation";
import { themeChoices, themeLabels, type ThemeChoice } from "@/lib/theme";
import { BottomSheet, SheetRow } from "@/components/common/BottomSheet";
import { Button } from "@/components/ui/button";
import {
  emptyReport,
  ReportFields,
  reportReady,
  useReportSubmit,
  type ReportFormValue,
} from "@/components/field/ReportForm";
import { useNow } from "@/api/clock";
import { useAccess } from "@/api/access";
import { cn } from "@/lib/utils";

/**
 * Шторки оболочки одним модулем (ADR-026): «+», «Ещё» и выбор объекта. Один отложенный чанк
 * вместо трёх — у них общие зависимости, и раздельные чанки платили за них трижды.
 */

/**
 * Шторка ввода «+» (ADR-029). Открывается на канале роли: прораб пишет факт, ПТО грузит файл,
 * снабжение заводит запрос, руководитель — чем пользовался в прошлый раз.
 *
 * Факт вводится здесь же: от нажатия «+» до записи человек не уходит с экрана, на котором
 * работал. Остальные каналы открывают свой экран — их формам нужен его контекст.
 */
export function PlusSheet({
  open,
  onOpenChange,
  role,
  projectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: EmployeeRole;
  projectId: string | null;
}) {
  const navigate = useNavigate();
  const { lastInput, rememberInput } = useApp();
  const { can } = useAccess();
  const [channel, setChannel] = useState<string | null>(null);
  const [created, setCreated] = useState<ReportFormValue | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  /*
   * Объект для записи: выбранный в шапке, а если чип молчит — единственный объект человека
   * (у прораба чипа нет вовсе) или выбранный здесь кнопками (ADR-029, п. 4).
   */
  const projects = useQuery(queries.projects()).data ?? [];
  const target = projectId ?? picked ?? (projects.length === 1 ? projects[0]!.project.id : null);
  // Откуда взялся объект — не догадка: карточка подтверждения называет это прямо
  const projectSource = projectId
    ? "из шапки"
    : picked
      ? "выбран здесь"
      : "единственный ваш объект";
  const actions = plusActionsFor(role, target);

  // Канал по умолчанию: роль, а у руководителя и директора — последний использованный
  const fallback = DEFAULT_CHANNEL[role] ?? lastInput.channel ?? "report";
  const current = channel ?? (actions.some((a) => a.key === fallback) ? fallback : null);
  const wantsReport = current === "report" && can("field-reports", "write");
  const reportHere = wantsReport && !!target;
  /*
   * Объектов несколько, а выбора нет — спрашиваем кнопками, но только когда человек сам выбрал
   * «факт»: спрашивать объект раньше, чем он сказал, что записывает, значит задавать вопрос
   * не по делу. Пока канал подставлен ролью, шторка показывает список каналов.
   */
  const askProject = wantsReport && !target && channel === "report";

  const close = () => {
    onOpenChange(false);
    setChannel(null);
    setCreated(null);
    setPicked(null);
  };

  if (created && target) {
    return (
      <BottomSheet
        open={open}
        onOpenChange={close}
        title="Записано"
        description="Проверьте, всё ли верно: исправить можно на экране отчёта"
      >
        <ConfirmationCard
          value={created}
          projectId={target}
          projectSource={projectSource}
          zoneSource={created.zoneId === lastInput.zoneId ? "последний выбор" : "выбрана в форме"}
          onFix={() => {
            const id = target;
            close();
            void navigate({ to: "/projects/$id/field-reports", params: { id } });
          }}
          onOk={close}
        />
      </BottomSheet>
    );
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={close}
      title={reportHere ? "Зафиксировать работу" : askProject ? "На каком объекте" : "Создать"}
      description={
        reportHere
          ? "Объект и захватка подставлены — поменяйте, если смена была на другой"
          : askProject
            ? "Выберите объект — дальше откроется форма"
            : target
              ? "Форма откроется на своём экране — там, где у неё контекст"
              : "Объект не выбран: часть форм попросит выбрать его первым шагом"
      }
    >
      {askProject && (
        <div className="grid gap-1 pb-2">
          {projects.map((row) => (
            <SheetRow
              key={row.project.id}
              label={row.project.name}
              hint={row.overview.stage}
              onSelect={() => setPicked(row.project.id)}
            />
          ))}
        </div>
      )}

      {reportHere ? (
        <ReportChannel
          projectId={target}
          lastZoneId={lastInput.zoneId}
          onCreated={(value) => {
            rememberInput({ channel: "report", zoneId: value.zoneId });
            setCreated(value);
          }}
        />
      ) : null}

      {/* Остальные каналы: тот же список действий, что и был, — он строится из прав и форм */}
      <div className={cn("grid gap-1 pb-2", askProject && "hidden")}>
        {actions
          .filter((action) => !(reportHere && action.key === "report"))
          .map((action) => (
            <SheetRow
              key={action.key}
              icon={<action.icon className="size-5" strokeWidth={1.75} aria-hidden />}
              label={action.label}
              hint={action.hint}
              onSelect={() => {
                rememberInput({ channel: action.key });
                // Факт вводится здесь же; если объект не выбран, шторка спросит его кнопками
                if (action.key === "report") {
                  setChannel("report");
                  return;
                }
                close();
                void navigate({ to: action.to, search: (action.search ?? {}) as never });
              }}
            />
          ))}
      </div>
    </BottomSheet>
  );
}

/** Канал роли по умолчанию (ADR-029, п. 1); у руководителя и директора — последний выбранный */
const DEFAULT_CHANNEL: Partial<Record<EmployeeRole, string>> = {
  foreman: "report",
  pto: "document",
  supply: "request",
};

/** Факт работы прямо в шторке: форма та же, что на экране отчётов */
function ReportChannel({
  projectId,
  lastZoneId,
  onCreated,
}: {
  projectId: string;
  lastZoneId: string | null;
  onCreated: (value: ReportFormValue) => void;
}) {
  const card = useQuery(queries.project(projectId)).data;
  const now = useNow();
  const today = now.slice(0, 10);
  const zones = card?.zones ?? [];
  const suggested = zones.find((zone) => zone.id === lastZoneId)?.id ?? zones[0]?.id ?? "";
  const [value, setValue] = useState<ReportFormValue | null>(null);
  const { submit, pending } = useReportSubmit(projectId);
  const draft = value ?? emptyReport(suggested, today);

  if (!zones.length) {
    return (
      <p className="px-1 pb-3 text-[13px] leading-[1.45] text-text-2">
        У объекта нет захваток — отчёт не к чему привязать. Заведите захватку на экране объекта, и
        форма появится здесь.
      </p>
    );
  }

  return (
    <div className="pb-2">
      <ReportFields
        compact
        value={draft}
        onChange={setValue}
        zones={zones}
        today={today}
        sources={{
          ...(draft.zoneId === suggested && lastZoneId === suggested
            ? { zoneId: "последний выбор" }
            : {}),
          ...(draft.date === today ? { date: "сегодня" } : {}),
        }}
      />
      <Button
        variant="accent"
        className="mt-4 w-full"
        loading={pending}
        disabled={!reportReady(draft)}
        onClick={() => submit(draft, () => onCreated(draft))}
      >
        <HardHat className="size-4" /> Записать работу
      </Button>
    </div>
  );
}

/** Карточка подтверждения: что записано и откуда взялось каждое значение (ADR-029, п. 5) */
function ConfirmationCard({
  value,
  projectId,
  projectSource,
  zoneSource,
  onOk,
  onFix,
}: {
  value: ReportFormValue;
  projectId: string;
  projectSource: string;
  zoneSource: string;
  onOk: () => void;
  onFix: () => void;
}) {
  const card = useQuery(queries.project(projectId)).data;
  const zone = card?.zones.find((item) => item.id === value.zoneId);
  const rows: [string, string, string][] = [
    ["Вид работ", value.workType, "введено вами"],
    ["Объём", `${value.qty} ${value.unit}`, "введено вами"],
    ["Захватка", zone?.name ?? "—", zoneSource],
    ["Дата смены", value.date, "часы объекта"],
    ["Объект", card?.project.name ?? "—", projectSource],
  ];
  return (
    <div className="pb-2">
      <dl className="divide-y divide-line">
        {rows.map(([label, text, source]) => (
          <div key={label} className="flex items-start justify-between gap-3 py-2.5">
            <dt className="shrink-0 text-[13px] text-text-3">{label}</dt>
            <dd className="min-w-0 text-right">
              <span className="block text-[14px] text-text">{text}</span>
              <span className="block text-[11px] text-text-3">{source}</span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[12px] leading-[1.45] text-text-3">
        Отчёт в ленте со статусом «На проверке»: объём принимает руководитель или ПТО.
      </p>
      <div className="mt-4 flex gap-2">
        <Button variant="accent" className="flex-1" onClick={onOk}>
          <Check className="size-4" /> Верно
        </Button>
        <Button variant="secondary" className="flex-1" onClick={onFix}>
          Исправить
        </Button>
      </div>
    </div>
  );
}

export function MoreSheet({
  open,
  onOpenChange,
  role,
  projectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: EmployeeRole;
  projectId: string | null;
}) {
  const navigate = useNavigate();
  const user = useCurrentUser();
  const enterAs = useEnterAs();
  const { personaId, themeChoice, setThemeChoice } = useApp();
  const employees = useQuery(queries.employees()).data ?? [];
  const inPanel = new Set(bottomNavFor(role, projectId).map((item) => item.key));
  const rest = navItemsFor(role).filter((item) => !inPanel.has(item.key));
  const personas = DEMO_PERSONAS.map((id) => employees.find((item) => item.id === id)).filter(
    (item): item is (typeof employees)[number] => !!item,
  );

  const go = (to: string, search: Record<string, string>) => {
    onOpenChange(false);
    void navigate({ to, search: search as never });
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={user ? `${user.name}, ${user.roleLabel}` : "Ещё"}
      description="Разделы, которых нет в панели, тема и выход"
    >
      <div className="grid gap-1 pb-2">
        {rest.map((item) => {
          const href = sectionHref(projectId, item.section, item.to);
          return (
            <SheetRow
              key={item.key}
              icon={<item.icon className="size-5" strokeWidth={1.75} aria-hidden />}
              label={item.label}
              onSelect={() => go(href.to, href.search as Record<string, string>)}
            />
          );
        })}

        <div className="mt-2 border-t border-line pt-2">
          <p className="px-3 pb-1 text-[12px] leading-[1.4] text-text-3">Тема оформления</p>
          <div className="grid grid-cols-3 gap-1 px-1">
            {themeChoices.map((choice) => (
              <button
                key={choice}
                type="button"
                onClick={() => setThemeChoice(choice as ThemeChoice)}
                aria-pressed={themeChoice === choice}
                className={cn(
                  "focus-ring min-h-12 rounded-[var(--r-md)] border px-2 text-[13px] transition-fast",
                  themeChoice === choice
                    ? "border-line-2 bg-surface-2 text-text"
                    : "border-line text-text-2",
                )}
              >
                {themeLabels[choice as ThemeChoice]}
              </button>
            ))}
          </div>
        </div>

        {/* Роль в демонстрации меняют здесь же: в рабочем контуре её даёт учётная запись */}
        {dataSource === "demo" && personas.length > 0 && (
          <div className="mt-2 border-t border-line pt-2">
            <p className="px-3 pb-1 text-[12px] leading-[1.4] text-text-3">Роль в демонстрации</p>
            {personas.map((person) => (
              <SheetRow
                key={person.id}
                label={person.name}
                hint={
                  person.id === personaId
                    ? `${employeeRoleLabel[person.role]} — выбрана`
                    : employeeRoleLabel[person.role]
                }
                onSelect={() => {
                  onOpenChange(false);
                  void enterAs(person.id, person.role).then((to: string) => navigate({ to }));
                }}
              />
            ))}
          </div>
        )}

        {dataSource === "server" && (
          <div className="mt-2 border-t border-line pt-2">
            <SheetRow
              icon={<LogOut className="size-5" strokeWidth={1.75} aria-hidden />}
              label="Выйти"
              hint="Сессия завершится на сервере"
              tone="danger"
              onSelect={() => {
                onOpenChange(false);
                void signOutFn().then(() => window.location.assign("/login"));
              }}
            />
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

/** Выбор объекта шторкой (ADR-026, п. 8): на телефоне селектора сайдбара нет */
export function ProjectSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { setProjectId } = useApp();
  const projectId = useProjectId();
  const projects = useQuery(queries.projects()).data ?? [];
  const setOpen = onOpenChange;
  return (
    <BottomSheet
      open={open}
      onOpenChange={setOpen}
      title="Объект"
      description="Разделы и счётчики считаются по выбранному объекту"
    >
      <div className="grid gap-1 pb-2">
        <SheetRow
          label="Все объекты"
          {...(projectId ? {} : { hint: "выбрано" })}
          onSelect={() => {
            setProjectId(ALL_PROJECTS);
            setOpen(false);
          }}
        />
        {projects.map((item) => (
          <SheetRow
            key={item.project.id}
            label={item.project.name}
            hint={
              item.project.id === projectId
                ? `${item.project.code} — выбрано`
                : `${item.project.code} · ${item.project.region}`
            }
            onSelect={() => {
              setProjectId(item.project.id);
              setOpen(false);
            }}
          />
        ))}
      </div>
    </BottomSheet>
  );
}
