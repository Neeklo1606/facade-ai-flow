/**
 * «Неделя» руководителя (ADR-056, 5–6): что мешает закрыть неделю, итог, график по дням,
 * объекты и версии. Закрыть можно, когда причин нет или каждая принята как есть с причиной.
 * Закрытие фиксирует версию; переоткрытие с причиной оставляет её файл доступным.
 *
 * Цифры только из данных: прошлой недели нет — сравнения нет; ожидания нет — «Получено
 * отчётов» не считается; ставок нет — стоимость труда не показывается.
 */
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Download, FileSpreadsheet, Lock, Unlock } from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";
import {
  blockingReasons,
  fmtManHours,
  fmtRub,
  useGasActions,
  useGasActor,
  useGasReport,
  useGasWeek,
  useGasWeekView,
  type CloseReason,
  type PeriodVersion,
} from "@/api/gas-ops";
import {
  Button,
  Card,
  ConfirmDialog,
  DataView,
  EmptyState,
  FormField,
  MetricCard,
  MetricRow,
  ShareBar,
  StatusChip,
} from "@/components/ui/mono";
import { downloadCustomerXlsx } from "@/lib/gas-ops/export";
import { chartPoints } from "@/lib/ui/mono-logic";
import { toast } from "@/lib/toast";
import { gasScreen } from "@/lib/gas-ops/screens";
import { SupplyMetrics } from "../supply/SupplyOverviewScreen";
import { DocsReadiness } from "../docs/ReadinessScreen";

const TimeChart = lazy(() =>
  import("@/components/ui/mono/time-chart").then((m) => ({ default: m.TimeChart })),
);

const MONTHS = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];
const WEEKDAY = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

function dayMonth(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1] ?? ""}`;
}

/** «28 сентября – 3 октября»: слово «Неделя» уже в заголовке экрана */
function weekTitle(from: string, to: string): string {
  return from.slice(5, 7) === to.slice(5, 7)
    ? `${Number(from.slice(8, 10))}–${dayMonth(to)}`
    : `${dayMonth(from)} – ${dayMonth(to)}`;
}

const KIND_TITLE: Record<CloseReason["kind"], string> = {
  pending: "Не проверено",
  clarify: "На уточнении",
  "final-check": "Без итоговой проверки",
  missing: "Нет записи по графику",
  overlap: "Пересечения времени",
  "no-estimate": "Объекты без сметы",
  "over-crew": "Состав больше бригады",
};

/** Сколько строк группы видно сразу: длинный список «нет записи» сворачивается */
const GROUP_PREVIEW = 4;
/** Объектов в таблице сразу: остальные по кнопке, на телефоне иначе экран в восемь высот */
const OBJECTS_PREVIEW = 10;

function stamp(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)} ${iso.slice(11, 16)}`;
}

export function WeekScreen() {
  const view = useGasWeekView();
  const week = useGasWeek();
  const actor = useGasActor();
  const actions = useGasActions();
  const canClose = actor.role === "director" || actor.isAdmin;
  const [accepted, setAccepted] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState(false);
  const [reopen, setReopen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [allObjects, setAllObjects] = useState(false);

  const { metrics, coverage, period } = view;
  const closed = period.closed;
  const acceptance = Object.entries(accepted).map(([key, reason]) => ({ key, reason }));
  const left = blockingReasons(view.reasons, acceptance);
  const draft = useGasReport("preliminary");

  const points = chartPoints(
    week.days.map((d) => WEEKDAY[new Date(`${d}T00:00:00`).getDay()] ?? d),
    view.byDay.map((d) => d.value),
  );
  const shareItems = useMemo(() => {
    const top = view.objects.filter((o) => o.accruedRub > 0).slice(0, 4);
    const rest = view.objects.filter((o) => o.accruedRub > 0).slice(4);
    const restSum = rest.reduce((a, o) => a + o.accruedRub, 0);
    return [
      ...top.map((o) => ({
        key: o.id,
        label: o.label,
        note: o.code,
        value: o.accruedRub,
        amount: fmtRub(o.accruedRub),
      })),
      ...(restSum > 0
        ? [
            {
              key: "rest",
              label: `Остальные объекты: ${rest.length}`,
              value: restSum,
              amount: fmtRub(restSum),
            },
          ]
        : []),
    ];
  }, [view.objects]);

  const source =
    view.expectationSource === "schedule"
      ? "по графику заказчика"
      : view.expectationSource === "assignment"
        ? "по демо-назначениям, графика нет"
        : null;

  // Неделя — финансы: бригадиру не открывается и по прямой ссылке (1.2)
  if (actor.role === "foreman") {
    return (
      <EmptyState
        title="Неделю закрывает руководитель"
        text="Ваши записи и их статусы на экране «Сегодня»."
      />
    );
  }
  return (
    <div className="flex flex-col gap-section">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="quiet" aria-label="Прошлая неделя: в данных её нет" disabled>
            <ChevronLeft aria-hidden />
          </Button>
          <h2 className="type-screen">{weekTitle(week.from, week.to)}</h2>
          <Button variant="quiet" aria-label="Следующая неделя: в данных её нет" disabled>
            <ChevronRight aria-hidden />
          </Button>
        </div>
        {closed ? (
          <StatusChip tone="up">Закрыта, версия v{closed.version}</StatusChip>
        ) : (
          <StatusChip tone="neutral">Открыта</StatusChip>
        )}
      </header>

      <MetricRow label="Показатели недели" columns={5}>
        <MetricCard
          inverse
          label="Начислено по смете"
          value={metrics.accruedRub}
          format={(v) => Math.round(v).toLocaleString("ru-RU")}
          unit="₽"
          note="только подтверждённое"
          revealKey="week:accrued"
        />
        <MetricCard
          label="Получено отчётов"
          value={source ? coverage.received : null}
          text={source ? `${coverage.received} из ${coverage.expected}` : "нет графика"}
          note={source ?? "Графика нет: полнота не считается"}
          revealKey="week:coverage"
        />
        <MetricCard
          label="Не проверено"
          value={metrics.pending}
          note="ждут менеджера"
          revealKey="week:pending"
        />
        <MetricCard
          label="На уточнении"
          value={metrics.clarify}
          note="ждут ответа бригадира"
          revealKey="week:clarify"
        />
        <MetricCard
          label="Человеко-часы"
          value={null}
          text={fmtManHours(metrics.manMinutes, "чел.-ч")}
          note={
            metrics.withoutCrew
              ? `по ${metrics.withoutCrew} записям состав не указан`
              : `часы записей ${fmtManHours(metrics.minutes, "ч")}`
          }
          revealKey="week:man"
        />
      </MetricRow>

      <Card
        title={closed ? "Неделя закрыта" : "До закрытия осталось"}
        action={
          closed ? null : (
            <span className="type-label text-ink-3">
              {left.length ? `причин: ${left.length}` : "причин нет"}
            </span>
          )
        }
      >
        {closed ? (
          <p className="type-text text-ink-2">
            Версия v{closed.version} от {stamp(closed.closedAt)}: {fmtRub(closed.totals.accruedRub)}
            , записей {closed.totals.count}. Изменения возможны после переоткрытия с причиной.
          </p>
        ) : view.reasons.length === 0 ? (
          <p className="type-text text-ink-2">Всё проверено, неделю можно закрывать.</p>
        ) : (
          <div className="flex flex-col gap-5" aria-label="Причины до закрытия" role="list">
            {groupsOf(view.reasons).map(([kind, list]) => (
              <ReasonGroup
                key={kind}
                kind={kind}
                reasons={list}
                accepted={accepted}
                editable={canClose}
                onChange={(keys, text) =>
                  setAccepted((prev) => {
                    const next = { ...prev };
                    for (const key of keys) {
                      if (text === null) delete next[key];
                      else next[key] = text;
                    }
                    return next;
                  })
                }
              />
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card title="Начислено по дням" action={<span className="type-small text-ink-3">₽</span>}>
          <Suspense fallback={<div className="h-64" />}>
            <TimeChart
              label="Подтверждённое начисление по дням недели"
              points={points}
              format={(v) => (v >= 1000 ? `${Math.round(v / 1000)} т` : String(v))}
              compare={false}
              revealKey="week:chart"
            />
          </Suspense>
          <p className="mt-2 type-small text-ink-3">
            Прошлой недели в данных нет: сравнения нет. День без записей показан разрывом, а не
            нулём.
          </p>
        </Card>
        <Card title="Доли объектов">
          {shareItems.length ? (
            <ShareBar label="Доли начисления по объектам" items={shareItems} />
          ) : (
            <p className="type-text text-ink-2">Подтверждённого начисления пока нет.</p>
          )}
        </Card>
      </div>

      <Card title="По объектам">
        <DataView
          label="Объекты недели"
          rows={allObjects ? view.objects : view.objects.slice(0, OBJECTS_PREVIEW)}
          rowId={(o) => o.id}
          keyboard={false}
          columns={[
            { key: "object", header: "Объект", cell: (o) => o.label, width: "40%" },
            {
              key: "man",
              header: "Чел.-ч",
              cell: (o) =>
                o.manMinutes === null ? "состав не указан" : fmtManHours(o.manMinutes, "чел.-ч"),
              align: "end",
            },
            { key: "sum", header: "Начислено", cell: (o) => fmtRub(o.accruedRub), align: "end" },
            {
              key: "rate",
              header: "Выработка на час",
              cell: (o) =>
                o.outputPerHour === null ? "нет часов" : `${fmtRub(o.outputPerHour)}/ч`,
              align: "end",
            },
            {
              key: "ready",
              header: "Статус",
              cell: (o) =>
                o.ready ? (
                  <StatusChip tone="up">Готов</StatusChip>
                ) : (
                  <StatusChip tone="caution">Уточнение</StatusChip>
                ),
            },
          ]}
          title={(o) => o.label}
          meta={(o) =>
            `${o.manMinutes === null ? "состав не указан" : fmtManHours(o.manMinutes, "чел.-ч")} · ${o.ready ? "готов" : "уточнение"}`
          }
          aside={(o) => fmtRub(o.accruedRub)}
          empty={<EmptyState title="Записей за неделю нет" />}
        />
        {view.objects.length > OBJECTS_PREVIEW ? (
          <button
            type="button"
            className="mt-2 min-h-11 type-label text-ink-2 underline underline-offset-4 focus-ring"
            onClick={() => setAllObjects(!allObjects)}
          >
            {allObjects ? "Свернуть" : `Показать все объекты: ${view.objects.length}`}
          </button>
        ) : null}
        <p className="mt-3 type-small text-ink-3">
          Выработка на час = начислено ÷ часы записей за неделю, как в Excel заказчика.
          Человеко-часы: часы каждого человека суммой.
        </p>
      </Card>

      <section aria-label="Действия недели" className="flex flex-wrap items-center gap-3">
        <Link to="/gas/reports" className="mono-btn mono-btn-secondary focus-ring">
          <FileSpreadsheet aria-hidden />
          Посмотреть строки отчёта
        </Link>
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              const name = await downloadCustomerXlsx({
                rows: draft.rows,
                analytic: draft.analytic,
                days: draft.days,
                week: draft.week,
                mode: "preliminary",
                label: { draft: true },
              });
              toast.success(`Черновик выгружен: ${name}`);
            } catch {
              toast.error("Не удалось выгрузить черновик. Повторите.");
            }
          }}
        >
          <Download aria-hidden />
          Выгрузить черновик Excel
        </Button>
        {canClose && !closed ? (
          <Button disabled={left.length > 0} onClick={() => setConfirm(true)}>
            <Lock aria-hidden />
            Закрыть неделю
          </Button>
        ) : null}
        {canClose && closed ? (
          <Button variant="secondary" onClick={() => setReopen(true)}>
            <Unlock aria-hidden />
            Переоткрыть с причиной
          </Button>
        ) : null}
        {!canClose ? (
          <span className="type-label text-ink-3">Закрывает неделю руководитель.</span>
        ) : null}
      </section>
      {error ? (
        <p role="alert" className="type-label text-down">
          {error}
        </p>
      ) : null}

      {reopen ? (
        <Card title="Переоткрыть неделю">
          <div className="flex flex-col gap-3">
            <FormField label="Причина переоткрытия" hint="Версия остаётся, её файл можно скачать">
              {(props) => (
                <input
                  {...props}
                  className="mono-input focus-ring"
                  value={reopenReason}
                  onChange={(event) => setReopenReason(event.target.value)}
                  placeholder="Например, заказчик прислал исправленный график"
                />
              )}
            </FormField>
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={async () => {
                  const result = await actions.reopenWeek({ reason: reopenReason });
                  if (!result.ok) return setError(result.message);
                  setError(null);
                  setReopen(false);
                  setReopenReason("");
                  setAccepted({});
                  toast.success(`Неделя переоткрыта. Версия v${result.value.version} сохранена.`);
                }}
              >
                Переоткрыть
              </Button>
              <Button variant="quiet" onClick={() => setReopen(false)}>
                Отменить
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {/* Модуль 2 (ADR-057): та же сводка, что на экране «Снабжение» руководителя */}
      {gasScreen("supplyOverview").roles.includes(actor.role) ? (
        <section aria-labelledby="week-supply" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 id="week-supply" className="type-card">
              Снабжение
            </h2>
            <Link to="/gas/supply-overview" className="mono-btn mono-btn-quiet focus-ring">
              Подробнее
            </Link>
          </div>
          <SupplyMetrics />
        </section>
      ) : null}

      {/* Модуль 3 (ADR-058): готовность исполнительной документации по объектам */}
      {gasScreen("docsOverview").roles.includes(actor.role) ? (
        <section aria-labelledby="week-docs" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 id="week-docs" className="type-card">
              Исполнительная документация
            </h2>
            <Link to="/gas/docs-overview" className="mono-btn mono-btn-quiet focus-ring">
              Подробнее
            </Link>
          </div>
          <DocsReadiness />
        </section>
      ) : null}

      {period.versions.length ? (
        <Card title="Версии недели">
          <ul className="flex flex-col divide-y divide-line">
            {[...period.versions].reverse().map((version) => (
              <VersionRow key={version.id} version={version} />
            ))}
          </ul>
        </Card>
      ) : null}

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Закрыть неделю версией v${period.nextVersion}?`}
        text={`В версию войдут подтверждённые записи: ${fmtRub(metrics.accruedRub)}. После закрытия записи недели не меняются, пока неделю не переоткроют с причиной.`}
        confirm="Закрыть неделю"
        onConfirm={async () => {
          setConfirm(false);
          const result = await actions.closeWeek({ accepted: acceptance });
          if (!result.ok) return setError(result.message);
          setError(null);
          toast.success(`Неделя закрыта, версия v${result.value.version}`);
        }}
      />
    </div>
  );
}

function groupsOf(reasons: readonly CloseReason[]): [CloseReason["kind"], CloseReason[]][] {
  const map = new Map<CloseReason["kind"], CloseReason[]>();
  for (const r of reasons) map.set(r.kind, [...(map.get(r.kind) ?? []), r]);
  return [...map.entries()];
}

function ReasonGroup({
  kind,
  reasons,
  accepted,
  editable,
  onChange,
}: {
  kind: CloseReason["kind"];
  reasons: CloseReason[];
  accepted: Record<string, string>;
  editable: boolean;
  onChange: (keys: string[], value: string | null) => void;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? reasons : reasons.slice(0, GROUP_PREVIEW);
  const acceptable = reasons[0]?.acceptable ?? false;
  const keys = reasons.map((r) => r.key);
  const shared = keys.every((k) => accepted[k] !== undefined) ? accepted[keys[0]!] : undefined;
  return (
    <section role="listitem" aria-label={`${KIND_TITLE[kind]}: ${reasons.length}`}>
      {reasons.length > 1 ? (
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h4 className="type-label text-ink-2">
            {KIND_TITLE[kind]}: {reasons.length}
          </h4>
          {acceptable && editable && shared === undefined ? (
            <button
              type="button"
              className="min-h-11 type-label underline underline-offset-4 focus-ring"
              onClick={() => onChange(keys, "")}
            >
              Принять все {reasons.length} как есть
            </button>
          ) : null}
        </div>
      ) : null}
      {reasons.length > 1 && shared !== undefined ? (
        <div className="mb-2 flex flex-col gap-2 mono-inset lg:flex-row lg:items-end">
          <FormField
            label={`Причина для всех ${reasons.length}`}
            error={shared.trim() ? null : "Без причины не принимается"}
          >
            {(props) => (
              <input
                {...props}
                className="mono-input focus-ring lg:min-w-96"
                value={shared}
                onChange={(event) => onChange(keys, event.target.value)}
                placeholder="Например, бригады работали по другому графику"
              />
            )}
          </FormField>
          <Button variant="quiet" onClick={() => onChange(keys, null)}>
            Не принимать
          </Button>
        </div>
      ) : null}
      <ul className="flex flex-col divide-y divide-line">
        {shown.map((reason) => (
          <ReasonRow
            key={reason.key}
            reason={reason}
            value={accepted[reason.key]}
            editable={editable && (reasons.length === 1 || shared === undefined)}
            onChange={(text) => onChange([reason.key], text)}
          />
        ))}
      </ul>
      {reasons.length > GROUP_PREVIEW ? (
        <button
          type="button"
          className="min-h-11 type-label text-ink-2 underline underline-offset-4 focus-ring"
          onClick={() => setAll(!all)}
        >
          {all ? "Свернуть" : `Показать все ${reasons.length}`}
        </button>
      ) : null}
    </section>
  );
}

function ReasonRow({
  reason,
  value,
  editable,
  onChange,
}: {
  reason: CloseReason;
  value: string | undefined;
  editable: boolean;
  onChange: (value: string | null) => void;
}) {
  const first = reason.entryIds[0];
  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="type-text">{reason.text}</span>
        {first ? (
          <Link
            to="/gas/moderation"
            search={{ open: first }}
            className="type-label underline underline-offset-4 focus-ring"
          >
            Открыть
          </Link>
        ) : null}
      </div>
      {!reason.acceptable ? (
        <span className="type-small text-ink-3">
          Решается в «Проверке»: принять как есть нельзя
        </span>
      ) : editable ? (
        value === undefined ? (
          <button
            type="button"
            className="self-start type-label underline underline-offset-4 focus-ring"
            onClick={() => onChange("")}
          >
            Принять как есть
          </button>
        ) : (
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
            <FormField label="Причина" error={value.trim() ? null : "Без причины не принимается"}>
              {(props) => (
                <input
                  {...props}
                  className="mono-input focus-ring lg:min-w-96"
                  value={value}
                  onChange={(event) => onChange(event.target.value)}
                  placeholder="Например, бригада была на другом объекте"
                />
              )}
            </FormField>
            <Button variant="quiet" onClick={() => onChange(null)}>
              Не принимать
            </Button>
          </div>
        )
      ) : null}
    </li>
  );
}

function VersionRow({ version }: { version: PeriodVersion }) {
  const report = useGasReport("confirmed", version.entries);
  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2 type-text font-medium">
          v{version.version}
          {version.reopenedAt ? (
            <StatusChip tone="neutral">Переоткрыта</StatusChip>
          ) : (
            <StatusChip tone="up">Действует</StatusChip>
          )}
        </span>
        <span className="type-small text-ink-3">
          Закрыта {stamp(version.closedAt)} · {fmtRub(version.totals.accruedRub)} · записей{" "}
          {version.totals.count}
          {version.accepted.length ? ` · принято как есть: ${version.accepted.length}` : ""}
        </span>
        {version.reopenReason ? (
          <span className="type-small text-ink-2">
            Переоткрыта {stamp(version.reopenedAt!)}: {version.reopenReason}
          </span>
        ) : null}
      </div>
      <Button
        variant="secondary"
        onClick={async () => {
          try {
            const name = await downloadCustomerXlsx({
              rows: report.rows,
              analytic: report.analytic,
              days: report.days,
              week: report.week,
              mode: "confirmed",
              label: { version: version.version },
            });
            toast.success(`Файл версии выгружен: ${name}`);
          } catch {
            toast.error("Не удалось выгрузить файл версии. Повторите.");
          }
        }}
      >
        <Download aria-hidden />
        Скачать файл v{version.version}
      </Button>
    </li>
  );
}
