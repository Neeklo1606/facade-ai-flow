import { completePageHead } from "@/lib/page-head";
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FileSpreadsheet, HardHat, PackageCheck, Undo2 } from "lucide-react";
import {
  CountPill,
  EmptyState,
  PageHeader,
  StatusBadge,
  WidgetCard,
  WidgetCardHeader,
} from "@/components/common";
import { MobileActionBar } from "@/components/common/MobileActionBar";
import { ScreenGate, ScreenSkeleton } from "@/components/common/ScreenStates";
import { PageCaption } from "@/components/layout/PageActions";
import { Button } from "@/components/ui/button";
import { useToday } from "@/api/today";
import { useCanWrite } from "@/api/access";
import { useDirectory } from "@/api/directory";
import { queries } from "@/api/queries";
import { prefetch } from "@/api/prefetch";
import { deliveryStatusLabel, reportStatusLabel } from "@/contracts";
import { fmtDate, metaLine, shortName, fmtNum, plural } from "@/lib/format";
import { useScreenState } from "@/lib/screen-state";
import { AmbientField } from "@/components/gaika";
import { legacyModulesEnabled } from "@/lib/legacy-modules";
import { recordAction } from "@/lib/guide/telemetry";
import { saveShiftFile, useShift } from "@/api/capture";
import { toast } from "@/lib/toast";
import { useProjectId } from "@/lib/project-scope";
import type { TodayDelivery, TodayReturn, TodayWork } from "@/api/types";

/**
 * «Сегодня» — рабочий экран прораба (ADR-028, п. 2): что зафиксировано сменой, что едет
 * на площадку и что вернули на уточнение. Главное действие — завести отчёт.
 *
 * Блока «план на сегодня» здесь нет и не будет, пока плана нет в данных: пустое обещание
 * хуже отсутствующего блока.
 */
export const Route = createFileRoute("/today")({
  loader: async ({ context }) => {
    await prefetch(context.queryClient, queries.projects());
  },
  head: () =>
    completePageHead(
      {
        meta: [
          { title: "Сегодня — гайка" },
          {
            name: "description",
            content: "Смена на площадке: что зафиксировано, какие поставки ждут и что вернули.",
          },
        ],
      },
      "Сегодня — гайка",
      "Смена на площадке, записи и статусы проверки.",
    ),
  component: TodayPage,
});

function TodayPage() {
  const projectId = useProjectId();
  const today = useToday(projectId);
  const screen = useScreenState({
    pending: today.pending,
    error: today.error,
    empty:
      !today.pending &&
      today.works.length === 0 &&
      today.deliveries.length === 0 &&
      today.returned.length === 0,
  });
  const blocked = screen === "loading" || screen === "error" || screen === "forbidden";
  // Куда ведёт «Зафиксировать работу»: объект из чипа, иначе первый доступный
  const target = projectId ?? today.projects[0]?.project.id ?? null;
  /*
   * Отчёт за смену заводят прораб, ПТО и руководитель; директору матрица даёт отчёты только
   * на чтение (ADR-012). Экран ему открыт — смену видно, — а кнопка записи вела бы в форму,
   * которую он не отправит: кнопка без действия хуже отсутствующей (ADR-015).
   * Это удобство, а не защита: право всё равно проверяется на сервере.
   */
  const canRecord = useCanWrite("field-reports") && target !== null;

  return (
    <>
      {/*
        Цветовое поле ГАЙКИ (дизайн-система, раздел 8): единственный большой градиент кадра.
        Оно же показывает состояние разбора, когда разбор появится в G3.
      */}
      <AmbientField className="-mx-[var(--content-pad)] -mt-4" />
      <PageHeader
        title="Сегодня"
        actions={
          // На десктопе полосы над панелью нет: главное действие живёт в шапке экрана
          canRecord ? (
            <Button variant="accent" asChild>
              <Link
                to="/projects/$id/field-reports"
                params={{ id: target }}
                search={{ new: "report" }}
              >
                <HardHat className="size-4" /> Зафиксировать работу
              </Link>
            </Button>
          ) : null
        }
      />
      <PageCaption>
        <span className="truncate">
          {fmtDate(today.now)}
          {today.works.length > 0 &&
            ` · ${fmtNum(today.works.length)} ${plural(today.works.length, "запись", "записи", "записей")} за смену`}
        </span>
      </PageCaption>

      <ScreenGate
        state={screen}
        onRetry={today.refetch}
        skeleton={<ScreenSkeleton kind="feed" />}
        copy={{
          section: "Сегодня",
          roles: "прорабу и тем, кто ведёт площадку",
          errorTitle: "Не удалось загрузить смену",
          empty: {
            icon: HardHat,
            title: "За сегодня записей нет",
            description:
              "Как только работа зафиксирована, она появится здесь вместе с ожидаемыми поставками.",
          },
        }}
      >
        <div className="space-y-4">
          <WidgetCard>
            <WidgetCardHeader
              level={2}
              icon={HardHat}
              title="Зафиксировано сегодня"
              hint="объём по захваткам"
              aside={<CountPill>{fmtNum(today.works.length)}</CountPill>}
            />
            {today.works.length ? (
              <ul className="mt-2 divide-y divide-line">
                {today.works.map((work) => (
                  <WorkRow key={work.id} work={work} />
                ))}
              </ul>
            ) : (
              <EmptyState
                title="Сегодня ничего не зафиксировано"
                description="Это не значит, что работ не было: отчёт заводится здесь же, кнопкой ниже."
              />
            )}
          </WidgetCard>

          {/* Сводка смены и файл результата (ADR-037, сценарий 1) */}
          {target ? <ShiftCard projectId={target} date={today.now.slice(0, 10)} /> : null}

          {/* Поставки — модуль за флагом legacy_modules (ADR-034, п. 4) */}
          {legacyModulesEnabled() && (
            <WidgetCard>
              <WidgetCardHeader
                level={2}
                icon={PackageCheck}
                title="Ожидаются поставки"
                hint="по дате прибытия"
                aside={<CountPill>{fmtNum(today.deliveries.length)}</CountPill>}
              />
              {today.deliveries.length ? (
                <ul className="mt-2 divide-y divide-line">
                  {today.deliveries.map((delivery) => (
                    <DeliveryRow key={delivery.id} delivery={delivery} />
                  ))}
                </ul>
              ) : (
                <EmptyState
                  title="Поставок в пути нет"
                  description="Здесь появятся поставки, по которым выбран поставщик и назначена дата."
                />
              )}
            </WidgetCard>
          )}

          {today.returned.length > 0 && (
            <WidgetCard>
              <WidgetCardHeader
                level={2}
                icon={Undo2}
                title="Вернулось на доработку"
                hint="ждут вашего уточнения"
                aside={<CountPill>{fmtNum(today.returned.length)}</CountPill>}
              />
              <ul className="mt-2 divide-y divide-line">
                {today.returned.map((row) => (
                  <ReturnRow key={row.id} row={row} />
                ))}
              </ul>
            </WidgetCard>
          )}
        </div>
      </ScreenGate>

      {/*
        Закреплённой «Зафиксировать работу» больше нет: главное действие экрана — голосовая
        капсула панели, две главные кнопки на одном экране спорили (правило 1 этапа D).
      */}
    </>
  );
}

/** Строка смены: захватка, вид работ, объём и решение по нему */
function WorkRow({ work }: { work: TodayWork }) {
  return (
    <li className="py-3">
      <Link
        to="/projects/$id/field-reports"
        params={{ id: work.projectId }}
        className="focus-ring -mx-2 block rounded-[var(--r-sm)] px-2 py-1 transition-fast is-hover:bg-surface-2"
      >
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-card-title">{work.workType}</div>
            {/* Метаданные одной строкой (правило 8 этапа D; заменяет чипы ADR-028, п. 5) */}
            <p className="mt-1 text-caption text-text-2">
              {metaLine(work.zoneName, shortName(work.projectName))}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <div className="tnum text-[20px] leading-none font-semibold">{fmtNum(work.qty)}</div>
            <div className="mt-1 text-[13px] text-text-3">{work.unit}</div>
          </div>
        </div>
        <div className="mt-2">
          <StatusBadge
            tone={
              work.status === "accepted" ? "ok" : work.status === "returned" ? "danger" : "warn"
            }
          >
            {reportStatusLabel[work.status]}
          </StatusBadge>
        </div>
      </Link>
    </li>
  );
}

/** Строка поставки: от кого, когда ждём и не опоздала ли */
function DeliveryRow({ delivery }: { delivery: TodayDelivery }) {
  const { counterpartyName: supplierName } = useDirectory();
  return (
    <li className="py-3">
      <Link
        to="/projects/$id/deliveries"
        params={{ id: delivery.projectId }}
        className="focus-ring -mx-2 block rounded-[var(--r-sm)] px-2 py-1 transition-fast is-hover:bg-surface-2"
      >
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-card-title">{supplierName(delivery.supplierId)}</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Chip>{delivery.projectName}</Chip>
              <Chip>
                {fmtNum(delivery.items)} {plural(delivery.items, "позиция", "позиции", "позиций")}
              </Chip>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="tnum text-[13px] font-medium">{fmtDate(delivery.expectedAt)}</div>
            <div className="mt-1.5">
              <StatusBadge tone={delivery.overdue ? "danger" : "neutral"}>
                {delivery.overdue ? "Срок прошёл" : deliveryStatusLabel[delivery.status]}
              </StatusBadge>
            </div>
          </div>
        </div>
      </Link>
    </li>
  );
}

/** Строка возврата: что вернули и с чем разбираться */
function ReturnRow({ row }: { row: TodayReturn }) {
  return (
    <li className="py-3">
      <Link
        to="/projects/$id/field-reports"
        params={{ id: row.projectId }}
        search={{ status: "returned" }}
        className="focus-ring -mx-2 block rounded-[var(--r-sm)] px-2 py-1 transition-fast is-hover:bg-surface-2"
      >
        <div className="text-card-title">{row.workType}</div>
        <p className="mt-1 line-clamp-2 text-[13px] leading-[1.45] text-text-2">{row.summary}</p>
        <p className="mt-1 text-caption text-text-2">{metaLine(row.zoneName, fmtDate(row.date))}</p>
      </Link>
    </li>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-6 max-w-full items-center truncate rounded-[var(--r-xs)] bg-surface-2 px-2 text-[13px] leading-none text-text-2">
      {children}
    </span>
  );
}

/**
 * Сводка смены: что принято за день и файл результата (ADR-037, сценарий 1).
 *
 * В сводку идут только принятые отчёты — неподтверждённое в ней не появляется. Разные единицы
 * не складываются: итог считается по каждой отдельно. Люди стоят отдельным показателем,
 * а не прибавляются к объёму.
 */
function ShiftCard({ projectId, date }: { projectId: string; date: string }) {
  const shift = useShift(projectId, date, true);
  const [saving, setSaving] = useState(false);
  const summary = shift.data;

  const download = () => {
    setSaving(true);
    void saveShiftFile({ projectId, date: summary?.date ?? date }, "shift")
      .then(() => recordAction("downloadShift"))
      .catch((error: Error) => toast.error("Файл не собрался", { description: error.message }))
      .finally(() => setSaving(false));
  };

  return (
    <WidgetCard>
      <WidgetCardHeader
        level={2}
        icon={FileSpreadsheet}
        title="Сводка смены"
        hint={
          summary && summary.date !== date
            ? `последняя смена с принятыми записями: ${fmtDate(summary.date)}`
            : "только принятые записи"
        }
        aside={
          summary && summary.rows.length > 0 ? (
            <CountPill>{fmtNum(summary.rows.length)}</CountPill>
          ) : null
        }
      />
      {summary && summary.rows.length > 0 ? (
        <>
          <dl className="divide-line mt-2 divide-y">
            {summary.totals.map((total) => (
              <div key={total.unit} className="flex items-baseline justify-between gap-3 py-2.5">
                <dt className="text-text-2 text-[13px]">Принято, {total.unit}</dt>
                <dd className="tnum text-card-title">{fmtNum(total.qty)}</dd>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-3 py-2.5">
              <dt className="text-text-2 text-[13px]">Людей на сменах</dt>
              <dd className="tnum text-card-title">{fmtNum(summary.people)}</dd>
            </div>
          </dl>
          {summary.pending > 0 ? (
            <p className="text-caption text-text-3 mt-2">
              Ещё {fmtNum(summary.pending)} на проверке: в сводку они попадут после приёмки.
            </p>
          ) : null}
          <Button variant="secondary" className="mt-3" onClick={download} disabled={saving}>
            <FileSpreadsheet className="size-4" /> Скачать Excel
          </Button>
        </>
      ) : (
        <EmptyState
          title="За смену ещё нечего сводить"
          description="В сводку попадают принятые записи: примите факт в «Проверке», и он появится здесь."
        />
      )}
    </WidgetCard>
  );
}
