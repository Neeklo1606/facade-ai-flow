import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Check, ClipboardCheck, FileSearch, FileSpreadsheet, Image, Undo2 } from "lucide-react";
import {
  CountPill,
  EmptyState,
  PageHeader,
  PillTabs,
  WidgetCard,
  WidgetCardHeader,
} from "@/components/common";
import { BottomSheet } from "@/components/common/BottomSheet";
import { ScreenGate, ScreenSkeleton } from "@/components/common/ScreenStates";
import { PageCaption } from "@/components/layout/PageActions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCheckQueue } from "@/api/check";
import { useDirectory } from "@/api/directory";
import { useReviewReport } from "@/api/mutations";
import { queries } from "@/api/queries";
import { prefetch } from "@/api/prefetch";
import { useAccess } from "@/api/access";
import type { ReportCard } from "@/api/types";
import { sourceKindLabel } from "@/contracts";
import { fmtDate, fmtNum, metaLine, plural, shortName } from "@/lib/format";
import { useScreenState } from "@/lib/screen-state";
import { legacyModulesEnabled } from "@/lib/legacy-modules";
import { useGuide } from "@/lib/guide/store";
import { recordAction } from "@/lib/guide/telemetry";
import { saveShiftFile, useShift } from "@/api/capture";
import { useNow } from "@/api/clock";
import { useProjectId } from "@/lib/project-scope";
import { useSwipe } from "@/hooks/use-swipe";
import { toast, toastRetry, toastUndo } from "@/lib/toast";
import { cn } from "@/lib/utils";

type Tab = "facts" | "positions";

/**
 * «Проверка» — рабочий экран ПТО (ADR-028, п. 3): очередь фактов с площадки и объекты,
 * где ждут проверки позиции спецификации.
 *
 * Решение применяется сразу, отмена живёт 6 секунд: отчёт возвращается в очередь, а принятый
 * объём снимается из «Хода работ» той же операцией.
 */
export const Route = createFileRoute("/check")({
  validateSearch: (search: Record<string, unknown>): { tab?: Tab | undefined } => ({
    tab: search["tab"] === "positions" ? "positions" : undefined,
  }),
  loader: async ({ context }) => {
    await prefetch(context.queryClient, queries.projects());
  },
  head: () => ({
    meta: [
      { title: "Проверка — гайка" },
      {
        name: "description",
        content: "Очередь проверки: факты с площадки и позиции спецификации, ждущие решения.",
      },
    ],
  }),
  component: CheckPage,
});

function CheckPage() {
  const { tab = "facts" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const projectId = useProjectId();
  const data = useCheckQueue(projectId);
  const guide = useGuide();
  const { can } = useAccess();
  const queueProject = data.queue[0]?.card.report.projectId ?? null;
  const [lastProject, setLastProject] = useState<string | null>(null);
  useEffect(() => {
    if (queueProject) setLastProject(queueProject);
  }, [queueProject]);
  const statementProject = projectId ?? queueProject ?? lastProject;

  const screen = useScreenState({
    pending: data.pending,
    error: data.error,
    empty:
      !data.pending &&
      data.queue.length === 0 &&
      (!legacyModulesEnabled() || data.positions.length === 0),
  });

  return (
    <>
      <PageHeader title="Проверка" />
      {/*
        Черновик ведомости объёмов: файл результата ПТО (ADR-037, сценарий 2).
        Объект берётся из чипа, а когда чип молчит — из очереди: ПТО обычно смотрит все объекты,
        и прятать от него файл только из-за этого неправильно. Последний объект запоминается,
        иначе кнопка исчезала ровно после приёмки последнего факта.
      */}
      {statementProject ? <StatementButton projectId={statementProject} /> : null}

      <PageCaption>
        <span className="truncate">
          {data.queue.length > 0
            ? `Осталось ${fmtNum(data.queue.length)} ${plural(data.queue.length, "факт", "факта", "фактов")}`
            : "Очередь фактов пуста"}
        </span>
      </PageCaption>

      {/* Позиции спецификации живут в документации — модуле за флагом (ADR-034, п. 4) */}
      {can("documents") && legacyModulesEnabled() && (
        <div className="mb-4">
          <PillTabs
            label="Что проверяем"
            value={tab}
            onChange={(next) =>
              navigate({
                search: () => ({ tab: next === "positions" ? "positions" : undefined }),
                replace: true,
                resetScroll: false,
              })
            }
            tabs={[
              { value: "facts", label: `Факты · ${fmtNum(data.queue.length)}` },
              { value: "positions", label: `Позиции · ${fmtNum(data.positions.length)}` },
            ]}
          />
        </div>
      )}

      <ScreenGate
        state={screen}
        onRetry={data.refetch}
        skeleton={<ScreenSkeleton kind="feed" />}
        copy={{
          section: "Проверка",
          roles: "ПТО, руководителю проекта и директору",
          errorTitle: "Не удалось загрузить очередь",
          empty: {
            icon: ClipboardCheck,
            title: "Проверять нечего",
            description:
              "Факты с площадки и позиции спецификации, ждущие решения, появятся здесь сразу после поступления.",
          },
        }}
      >
        {tab === "positions" && legacyModulesEnabled() ? (
          <PositionsTab rows={data.positions} />
        ) : (
          <FactsTab rows={chainFirst(data.queue, guide.chain.reportId)} />
        )}
      </ScreenGate>
    </>
  );
}

/** Очередь фактов: карточка за карточкой, свайп и кнопки делают одно и то же */
function FactsTab({
  rows,
}: {
  rows: { card: ReportCard; projectName: string; zoneName: string }[];
}) {
  if (!rows.length) {
    return (
      <WidgetCard>
        <EmptyState
          icon={ClipboardCheck}
          title="Фактов на проверке нет"
          description="Как только прораб сдаст смену, отчёт появится здесь."
        />
      </WidgetCard>
    );
  }
  return (
    <ul className="space-y-3">
      {rows.map((row, index) => (
        // Главное действие на экране одно: его несёт карточка, до которой очередь дошла.
        // У остальных «Принять» вторичная — иначе на экране столько акцентов, сколько карточек
        <FactCard key={row.card.report.id} current={index === 0} {...row} />
      ))}
    </ul>
  );
}

function FactCard({
  card,
  projectName,
  zoneName,
  current,
}: {
  card: ReportCard;
  projectName: string;
  zoneName: string;
  /** Карточка, до которой дошла очередь: только у неё главное действие акцентное */
  current: boolean;
}) {
  const { report, source, evidence } = card;
  const { employeeName } = useDirectory();
  const { can } = useAccess();
  const [qtyOpen, setQtyOpen] = useState(false);
  const [qty, setQty] = useState(String(report.declaredQty ?? ""));
  const review = useReviewReport({
    onFailed: () => toastRetry("Решение не сохранилось", () => undefined),
  });
  // Директор видит очередь, но решений не принимает (ADR-012)
  const mayDecide = can("field-reports", "write");

  const undo = () => review.mutate({ id: report.id, status: "review", acceptedQty: null });

  const accept = (value: number) => {
    review.mutate(
      { id: report.id, status: "accepted", acceptedQty: value },
      {
        onSuccess: () =>
          toastUndo(
            `Принято ${fmtNum(value)} ${report.unit}`,
            undo,
            `${report.workType} · ${zoneName}`,
          ),
      },
    );
  };

  const back = () => {
    review.mutate(
      { id: report.id, status: "returned", acceptedQty: null },
      {
        onSuccess: () =>
          toastUndo("Возвращено на уточнение", undo, `${report.workType} · ${zoneName}`),
      },
    );
  };

  const swipe = useSwipe({
    ...(mayDecide ? { onRight: () => accept(report.declaredQty ?? 0), onLeft: back } : {}),
  });

  return (
    <li>
      <article
        {...(mayDecide ? swipe.handlers : {})}
        style={swipe.shift ? { transform: `translateX(${swipe.shift}px)` } : undefined}
        className={cn(
          "rounded-[var(--r-lg)] border border-transparent bg-surface p-5",
          !swipe.shift && "transition-fast",
          // Пока палец ведёт карточку, подсказываем, что произойдёт при отпускании
          swipe.shift > 0 && "border-ok",
          swipe.shift < 0 && "border-danger",
        )}
      >
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-card-title">{report.workType}</h3>
            {/* Метаданные одной строкой, а не чипами в столбик (правило 8 этапа D) */}
            <p className="mt-1 text-caption text-text-2">
              {metaLine(
                zoneName,
                shortName(projectName),
                employeeName(report.authorId),
                evidence.length > 0 &&
                  `${fmtNum(evidence.length)} ${plural(evidence.length, "фото", "фото", "фото")}`,
              )}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <div className="tnum text-[24px] leading-none font-semibold">
              {fmtNum(report.declaredQty ?? 0)}
            </div>
            <div className="mt-1 text-[13px] text-text-3">{report.unit}</div>
          </div>
        </div>

        {/* Источник значения рядом с ним: откуда пришло и что сказано (правило 2) */}
        <div className="mt-4">
          {source ? (
            <span data-marker="" className="text-marker block">
              {sourceMarker(source)}
            </span>
          ) : null}
          <p className="mt-1 text-[15px] leading-[1.45] text-text-2">«{report.summary}»</p>
        </div>

        {/* Решение по карточке в одно касание; «Вернуть» тише — это не главный путь */}
        {mayDecide ? (
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Button
              variant={current ? "accent" : "secondary"}
              onClick={() => accept(report.declaredQty ?? 0)}
            >
              <Check className="size-4" /> Принять
            </Button>
            <Button variant="secondary" onClick={() => setQtyOpen(true)}>
              Исправить объём
            </Button>
            <Button variant="ghost" className="col-span-2 justify-self-start" onClick={back}>
              <Undo2 className="size-4" /> Вернуть на уточнение
            </Button>
          </div>
        ) : (
          <p className="mt-4 text-[13px] text-text-3">
            Решение принимают ПТО и руководитель проекта.
          </p>
        )}
      </article>

      {qtyOpen && (
        <BottomSheet
          open
          onOpenChange={setQtyOpen}
          title="Принятый объём"
          description={`${report.workType} · ${zoneName}`}
        >
          <div className="space-y-4 p-4 pt-0">
            <label className="block">
              <span className="text-[13px] text-text-3">Объём, {report.unit}</span>
              <Input
                autoFocus
                inputMode="decimal"
                value={qty}
                onChange={(event) => setQty(event.target.value)}
                className="mt-1.5"
              />
            </label>
            <Button
              variant="accent"
              className="w-full"
              onClick={() => {
                const value = Number(qty.replace(",", "."));
                if (!Number.isFinite(value) || value < 0) {
                  toast.error("Объём — положительное число");
                  return;
                }
                setQtyOpen(false);
                accept(value);
              }}
            >
              Принять {qty || "—"} {report.unit}
            </Button>
          </div>
        </BottomSheet>
      )}
    </li>
  );
}

/** Вторая вкладка: где ждут проверки позиции спецификации */
function PositionsTab({
  rows,
}: {
  rows: { projectId: string; projectName: string; unverified: number; total: number }[];
}) {
  if (!rows.length) {
    return (
      <WidgetCard>
        <EmptyState
          icon={FileSearch}
          title="Позиций на проверке нет"
          description="Загруженная спецификация попадает сюда, пока её позиции не сверены с номенклатурой."
        />
      </WidgetCard>
    );
  }
  return (
    <WidgetCard>
      <WidgetCardHeader
        level={2}
        icon={FileSearch}
        title="Позиции спецификации"
        hint="сверка с номенклатурой"
        aside={<CountPill>{fmtNum(rows.length)}</CountPill>}
      />
      <ul className="mt-2 divide-y divide-line">
        {rows.map((row) => (
          <li key={row.projectId} className="py-3">
            <Link
              to="/projects/$id/documents"
              params={{ id: row.projectId }}
              className="focus-ring -mx-2 flex items-center justify-between gap-3 rounded-[var(--r-sm)] px-2 py-1 transition-fast is-hover:bg-surface-2"
            >
              <span className="min-w-0">
                <span className="block truncate text-card-title">{row.projectName}</span>
                <span className="mt-1 block text-[13px] text-text-3">
                  из {fmtNum(row.total)} {plural(row.total, "позиции", "позиций", "позиций")}
                </span>
              </span>
              <span className="tnum shrink-0 text-[20px] leading-none font-semibold">
                {fmtNum(row.unverified)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </WidgetCard>
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
 * Черновик ведомости объёмов (ADR-037, сценарий 2). Файл собирается из принятых записей
 * смены и прямо подписан черновиком: исполнительную документацию демонстрация не выпускает.
 */
function StatementButton({ projectId }: { projectId: string }) {
  const now = useNow();
  const date = now.slice(0, 10);
  /*
   * Ведомость собирается за последнюю смену с принятыми записями: факт, который ПТО принял
   * сегодня, может быть позавчерашним, и прятать от него документ из-за этого неправильно.
   * Дата документа названа рядом с кнопкой, поэтому подмены не происходит.
   */
  const shift = useShift(projectId, date, true);
  const [saving, setSaving] = useState(false);
  const rows = shift.data?.rows.length ?? 0;

  const save = (kind: "shift" | "statement") => {
    setSaving(true);
    void saveShiftFile({ projectId, date: shift.data?.date ?? date }, kind)
      .then(() => recordAction(kind === "statement" ? "downloadStatement" : "downloadShift"))
      .catch((error: Error) => toast.error("Документ не собрался", { description: error.message }))
      .finally(() => setSaving(false));
  };

  return (
    /* Файлы смены — тихой строкой: главное на экране — карточка проверки (правило 1) */
    <div className="mb-6 flex flex-col gap-2">
      <span data-marker="" className="text-marker">
        Файлы смены
      </span>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          size="sm"
          aria-label="Скачать сводку смены"
          disabled={saving || rows === 0}
          onClick={() => save("shift")}
        >
          <FileSpreadsheet className="size-4" /> Сводка
        </Button>
        <Button
          variant="secondary"
          size="sm"
          aria-label="Скачать черновик ведомости"
          disabled={saving || rows === 0}
          onClick={() => save("statement")}
        >
          <FileSpreadsheet className="size-4" /> Ведомость
        </Button>
      </div>
      <span className="text-caption text-text-3">
        {rows > 0
          ? `В документ ${plural(rows, "войдёт", "войдут", "войдут")} ${fmtNum(rows)} ${plural(rows, "принятая запись", "принятые записи", "принятых записей")} за ${fmtDate(shift.data?.date ?? date)}`
          : "Принятых записей пока нет: примите факт, и документ соберётся"}
      </span>
    </div>
  );
}

/**
 * Маркер источника до двух слов: запись с экрана «Запись» — «Голосовое» или «Текст»
 * (ADR-036 хранит её как ручной источник с ключом отправки), остальное — по виду источника.
 */
function sourceMarker(source: {
  kind: keyof typeof sourceKindLabel;
  captureKey: string | null;
  location: string;
}) {
  if (source.captureKey) return source.location === "текст" ? "Текст" : "Голосовое";
  return source.kind === "telegram" ? "С площадки" : sourceKindLabel[source.kind];
}

/**
 * Цепочка показа (ADR-038): отчёт, созданный записью в этой вкладке, стоит в очереди первым —
 * ПТО в сценарии 2 видит именно его. Остальной порядок не меняется.
 */
function chainFirst<T extends { card: { report: { id: string } } }>(
  rows: T[],
  id: string | undefined,
) {
  if (!id) return rows;
  const index = rows.findIndex((row) => row.card.report.id === id);
  return index <= 0 ? rows : [rows[index]!, ...rows.slice(0, index), ...rows.slice(index + 1)];
}
