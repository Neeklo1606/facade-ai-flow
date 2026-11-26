/**
 * Мастер «Загрузить смету» (ADR-080, ADR-082, ADR-089): один вход, пять шагов, назад и вперёд.
 *
 * 1. Файл — только выбор файла. Ничего лишнего на экране.
 * 2. Проверка — что это за смета (тип), шапка, разделы отчёта с итогом, материалами, СМР
 *    и чел.-ч, номера строк файла. «Да, всё верно» или «Нет, исправить» с основанием.
 * 3. Объект — прикрепить к найденному, выбрать из списка или создать из шапки.
 * 4. Бригады — разделам бригады; кто в отпуске, видно в списке.
 * 5. Стоимость — подтвердить прямо здесь; дальше объект, табель, смета.
 *
 * Шаг и загрузка запоминаются во вкладке: закрыли мастер — откроется на том же шаге.
 * Разбор и запись те же, что в «Папке смет» (ADR-077), назначения — ADR-078.
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, ChevronDown, Upload } from "lucide-react";
import { fmtRub, useGasActor, useGasObjects } from "@/api/gas-ops";
import {
  changedPhrase,
  classifySections,
  recommendedBrigade,
  workTextOf,
  estimateChecks,
  ESTIMATE_KIND_LABEL,
  SECTION_ROLE_LABEL,
  useEstimateIntake,
  type EstimateCard,
  type SectionRole,
  type PressureMode,
  type UploadRow,
} from "@/api/gas-estimate-intake";
import { useGasEstimateActions } from "@/api/gas-estimates";
import { useGasCleanup } from "@/api/gas-cleanup";
import {
  sectionLabel,
  useAssignOptions,
  useBrigadeName,
  useObjectSections,
  useSectionActions,
  useSectionAssignments,
} from "@/api/gas-section-accrual";
import { AdaptiveSheet } from "@/components/gas-ops/AdaptiveSheet";
import { Button } from "@/components/ui/button";
import { notify } from "@/components/ui/kit/toast";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { CardBody } from "./EstimateIntake";
import { EditableAmount } from "./EditableAmount";

export function EstimateFlowButton({ className }: { className?: string }) {
  const actor = useGasActor();
  const [open, setOpen] = useState(false);
  if (!actor.canManageEstimates) return null;
  return (
    <>
      <Button
        variant="primary"
        className={className}
        onClick={() => setOpen(true)}
        iconEnd={<Upload />}
        data-testid="estimate-flow-open"
      >
        Загрузить смету
      </Button>
      {open ? <EstimateFlow open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}

type Step = "file" | "check" | "object" | "brigades" | "cost";
const STEPS: [Step, string][] = [
  ["file", "Файл"],
  ["check", "Проверка"],
  ["object", "Объект"],
  ["brigades", "Бригады"],
  ["cost", "Стоимость"],
];

const rub = (kopecks: number | null) =>
  kopecks === null
    ? "–"
    : `${Math.round(kopecks / 100).toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ₽`;
const hours = (value: number | null) =>
  value === null ? "–" : value.toLocaleString("ru-RU", { maximumFractionDigits: 1 });

/* ---------------------------------------------------------------- Память шага */

const KEY = "gaika-estimate-flow";
interface Saved {
  versionId: string;
  objectId: string | null;
  step: Step;
}

function readSaved(): Saved | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

function writeSaved(saved: Saved | null): void {
  try {
    if (saved) window.sessionStorage.setItem(KEY, JSON.stringify(saved));
    else window.sessionStorage.removeItem(KEY);
  } catch {
    // без хранилища шаг живёт до закрытия мастера
  }
}

function EstimateFlow({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const intake = useEstimateIntake();
  const [rows, setRows] = useState<UploadRow[] | null>(null);
  const [mode, setMode] = useState<PressureMode>("payroll");
  // Незаконченная загрузка этой вкладки: продолжаем с того же шага
  const [saved] = useState(() => {
    const s = readSaved();
    const card = s ? intake.cardOf(s.versionId, "payroll") : null;
    return s && card && !card.object && card.version.confirmedAt === null ? s : null;
  });
  const [step, setStep] = useState<Step>(saved?.step ?? "file");
  const [objectId, setObjectId] = useState<string | null>(saved?.objectId ?? null);
  const [uploadedId, setUploadedId] = useState<string | null>(saved?.versionId ?? null);

  const versionId =
    rows?.map((r) => r.outcome?.versionId ?? null).find((id): id is string => !!id) ?? uploadedId;
  const card = versionId ? intake.cardOf(versionId, mode) : null;
  const linked = objectId ?? card?.object?.id ?? null;

  // Запоминаем только незаконченную проверку: объект выбран — дальше ведёт путь объекта
  useEffect(() => {
    if (versionId && card && !linked) writeSaved({ versionId, objectId: null, step });
    else if (linked) writeSaved(null);
  }, [versionId, card, linked, step]);

  const send = async (list: File[]) => {
    if (!list.length || intake.busy) return;
    const result = await intake.upload(list.slice(0, 1));
    setRows(result);
    const id = result.map((r) => r.outcome?.versionId).find((x): x is string => !!x) ?? null;
    if (id) {
      setUploadedId(id);
      setObjectId(null);
      setStep("check");
    }
  };

  const restart = () => {
    writeSaved(null);
    setRows(null);
    setUploadedId(null);
    setObjectId(null);
    setStep("file");
  };

  const actor = useGasActor();
  // Новая версия сметы известного объекта: разделы меняются только после подтверждения
  const outcome = rows?.[0]?.outcome ?? null;
  const versionNumber = card?.version.version ?? null;
  const newVersion =
    card?.object && versionNumber !== null && versionNumber > 1
      ? {
          version: versionNumber,
          changed: outcome?.kind === "added" ? outcome.changed : card.changed,
        }
      : null;

  return (
    <AdaptiveSheet
      open={open}
      onOpenChange={onOpenChange}
      id="estimate-flow"
      title="Загрузить смету"
      description={
        step === "file"
          ? "Шаг 1 из 5: файл сметы Excel"
          : (card?.object?.label ?? card?.draft.label ?? "Смета")
      }
    >
      <div className="flex flex-col gap-4" data-testid="estimate-flow" data-step={step}>
        <StepBar step={step} reachable={card ? (linked ? 5 : 3) : 1} onGo={setStep} />

        {step === "file" ? (
          <FileStep
            busy={intake.busy}
            rows={rows}
            uploaded={card}
            onSend={send}
            onContinue={() => setStep("check")}
            onRestart={restart}
          />
        ) : null}

        {step === "check" && card ? (
          <CheckStep
            card={card}
            duplicate={rows?.[0]?.outcome?.kind === "duplicate"}
            mode={mode}
            onMode={setMode}
            onBack={() => setStep("file")}
            onNext={() => setStep("object")}
          />
        ) : null}

        {step === "object" && card ? (
          <>
            <Hint>
              Смета относится к объекту. Найденный по номеру или адресу объект предложен первым; нет
              в списке? Создайте из шапки сметы.
            </Hint>
            <CardBody
              card={card}
              canEdit
              mode={mode}
              onMode={setMode}
              parts={["object"]}
              onLinked={(id) => {
                setObjectId(id);
                setStep("brigades");
              }}
            />
            {card.object && newVersion ? (
              <div
                className="flex flex-col gap-1 rounded-card bg-surface-2 p-3 text-meta"
                data-testid="estimate-flow-new-version"
              >
                <p className="text-meta-strong text-text">
                  Это версия {newVersion.version} сметы объекта
                  {newVersion.changed ? `: ${changedPhrase(newVersion.changed)}` : ""}
                </p>
                <p className="text-text-2">
                  Разделы и начисления пока идут по прежней версии. Новые разделы появятся у
                  объекта, когда стоимость подтвердят; начисленное по старым разделам остаётся.
                </p>
                {actor.canManageEstimates && versionId ? (
                  <Link
                    to="/gas/estimates"
                    search={{ open: versionId }}
                    className="text-meta-strong text-accent-text focus-ring"
                    onClick={() => onOpenChange(false)}
                  >
                    Подтвердить стоимость версии {newVersion.version}
                  </Link>
                ) : null}
              </div>
            ) : null}
            <Nav
              onBack={() => setStep("check")}
              next={
                card.object ? (
                  <Button
                    variant="primary"
                    size="field"
                    className="@lg:flex-1"
                    iconEnd={<ArrowRight />}
                    data-testid="estimate-flow-object-next"
                    onClick={() => {
                      setObjectId(card.object!.id);
                      setStep("brigades");
                    }}
                  >
                    Дальше: бригады
                  </Button>
                ) : null
              }
            />
          </>
        ) : null}

        {step === "brigades" && linked ? (
          <BrigadesStep
            objectId={linked}
            onBack={() => setStep("object")}
            onNext={() => setStep("cost")}
            onDone={() => onOpenChange(false)}
          />
        ) : null}

        {step === "cost" && card && linked ? (
          <CostStep
            card={card}
            objectId={linked}
            onBack={() => setStep("brigades")}
            onDone={() => {
              writeSaved(null);
              onOpenChange(false);
            }}
          />
        ) : null}
      </div>
    </AdaptiveSheet>
  );
}

/* ---------------------------------------------------------------- Общее */

function StepBar({
  step,
  reachable,
  onGo,
}: {
  step: Step;
  /** Сколько первых шагов уже доступно: на них можно вернуться касанием */
  reachable: number;
  onGo: (step: Step) => void;
}) {
  const at = STEPS.findIndex(([key]) => key === step);
  return (
    <ol className="grid grid-cols-5 gap-1.5" aria-label="Шаги загрузки сметы">
      {STEPS.map(([key, label], i) => {
        const can = i < reachable && i !== at;
        return (
          <li
            key={key}
            className="flex min-w-0 flex-col gap-1"
            aria-current={i === at ? "step" : undefined}
          >
            <button
              type="button"
              disabled={!can}
              onClick={() => onGo(key)}
              className="flex min-h-9 min-w-0 flex-col gap-1 text-left focus-ring disabled:cursor-default"
            >
              <span
                aria-hidden
                className={cn(
                  "h-1 w-full rounded-full",
                  i < at ? "bg-ok" : i === at ? "bg-orange" : "bg-surface-3",
                )}
              />
              <span
                className={cn(
                  "truncate text-meta",
                  i === at ? "text-meta-strong text-text" : can ? "text-text-2" : "text-text-3",
                )}
              >
                <span className="sr-only">Шаг {i + 1}: </span>
                {label}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="text-meta text-text-2">{children}</p>;
}

/** Низ шага: «Назад» и главное действие */
function Nav({ onBack, next }: { onBack?: (() => void) | undefined; next?: ReactNode }) {
  return (
    // Ширину решает панель, а не экран: в шторке 420 на компьютере три кнопки в ряд не
    // помещались и «Да, всё верно» обрезалась (финальный обход 26.11)
    <div className="@container">
      <div className="flex flex-col-reverse gap-2 @lg:flex-row">
        {onBack ? (
          <Button
            variant="secondary"
            size="field"
            onClick={onBack}
            data-testid="estimate-flow-back"
          >
            <ArrowLeft aria-hidden />
            Назад
          </Button>
        ) : null}
        {next}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- 1. Файл */

function FileStep({
  busy,
  rows,
  uploaded,
  onSend,
  onContinue,
  onRestart,
}: {
  busy: boolean;
  rows: UploadRow[] | null;
  uploaded: EstimateCard | null;
  onSend: (files: File[]) => void;
  onContinue: () => void;
  onRestart: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const cleanup = useGasCleanup();

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    void onSend([...event.dataTransfer.files]);
  };

  // Файл уже загружен и не доведён до объекта: продолжить, загрузить другую или удалить
  if (uploaded) {
    const remove = async () => {
      const result = await cleanup.deleteEstimate(uploaded.version.id);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Загрузка удалена");
      onRestart();
    };
    return (
      <div className="flex flex-col gap-3" data-testid="estimate-flow-uploaded">
        <p className="text-body">
          Вы не закончили проверку: файл{uploaded.file ? ` «${uploaded.file.name}»` : ""}, версия{" "}
          {uploaded.version.version}.
        </p>
        <Nav
          next={
            <Button
              variant="primary"
              size="field"
              className="@lg:flex-1"
              iconEnd={<ArrowRight />}
              onClick={onContinue}
              data-testid="estimate-flow-continue"
            >
              Продолжить проверку
            </Button>
          }
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onRestart} data-testid="estimate-flow-another">
            Загрузить другую смету
          </Button>
          {!uploaded.object && uploaded.version.confirmedAt === null ? (
            <Button variant="destructive" onClick={() => void remove()}>
              Удалить эту загрузку
            </Button>
          ) : null}
        </div>
        <p className="text-meta text-text-3">
          Другая смета: эта останется в «Ждут подтверждения» на странице смет.
        </p>
      </div>
    );
  }

  return (
    <>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn(
          "flex flex-col items-center gap-3 rounded-card border border-dashed p-card py-8 text-center",
          over ? "border-accent bg-panel-2" : "border-line-2",
        )}
      >
        <p className="text-body text-text-2" role="status">
          {busy ? (
            "Читаю шапку, разделы и итоги, ищу объект…"
          ) : (
            <>
              <span className="max-lg:hidden">Перетащите файл сметы сюда или выберите</span>
              <span className="lg:hidden">Выберите файл сметы</span>
            </>
          )}
        </p>
        <Button
          variant="primary"
          size="field"
          loading={busy}
          onClick={() => input.current?.click()}
          iconEnd={<Upload />}
          className="max-lg:w-full"
        >
          Выбрать файл
        </Button>
        <input
          ref={input}
          type="file"
          accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          aria-label="Файл сметы"
          data-testid="estimate-flow-input"
          onChange={(e) => {
            const list = [...(e.target.files ?? [])];
            e.target.value = "";
            void onSend(list);
          }}
        />
        {rows ? (
          <ul className="flex flex-col gap-1" data-testid="estimate-flow-error">
            {rows.map((r, i) => (
              <li key={`${r.name}-${i}`} className="text-meta text-warn">
                {r.name}: {r.text}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <Hint>
        Подходят сметы ГРАНД-Смета и ресурсные сметы, .xls или .xlsx до 20 МБ. Система найдёт
        объект, адрес, номер сметы и разделы; вы проверите значения на следующем шаге.
      </Hint>
    </>
  );
}

/* ---------------------------------------------------------------- 2. Проверка */

function CheckStep({
  card,
  duplicate,
  mode,
  onMode,
  onBack,
  onNext,
}: {
  card: EstimateCard;
  duplicate: boolean;
  mode: PressureMode;
  onMode: (mode: PressureMode) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const checks = estimateChecks(card);
  const actions = useGasEstimateActions();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [fixing, setFixing] = useState(false);
  const [busy, setBusy] = useState(false);
  const classified = classifySections(card.sections, workTextOf(card.version.header));
  const { kind, sections: roles } = classified;
  const roleOf = (key: string) => roles.find((r) => r.key === key)!;
  const report = card.sections.filter((s) => roleOf(s.key).report);
  const others = card.sections.filter((s) => !roleOf(s.key).report);
  const totalWork = report.reduce((a, s) => a + (s.workKopecks ?? 0), 0);
  const totalLabor = report.reduce((a, s) => a + (s.laborHours ?? 0), 0);
  const version = card.version;
  const issues = version.issues ?? [];
  const confirmed = version.confirmedAt !== null;
  const h = version.header;
  const address = h?.address.value
    ? [h.address.value.settlement, h.address.value.street, h.address.value.house]
        .filter(Boolean)
        .join(", ")
    : null;

  // «Да, всё верно»: замечания разбора отмечаются проверенными, дальше — объект
  const agree = async () => {
    if (version.parseStatus === "needs-review" && !version.issuesReviewedBy && !confirmed) {
      setBusy(true);
      const result = await actions.reviewIssues(version.id);
      setBusy(false);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
    }
    onNext();
  };

  const row = (s: (typeof card.sections)[number]) => {
    const role = roleOf(s.key);
    const expanded = openKey === s.key;
    return (
      <li
        key={s.key}
        className={cn("border-t border-line", role.report && "bg-accent-bg/40")}
        data-report={role.report}
      >
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setOpenKey(expanded ? null : s.key)}
          className={cn(
            "grid min-h-11 w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 py-1.5 pr-3 text-left focus-ring",
            role.report ? "border-s-4 border-orange ps-2" : "ps-3 text-text-2",
          )}
          data-testid="estimate-section"
        >
          <span className="flex min-w-0 flex-col">
            <span className="flex min-w-0 items-center gap-1">
              <ChevronDown
                aria-hidden
                className={cn(
                  "size-3.5 shrink-0 text-text-3 transition-transform motion-reduce:transition-none",
                  expanded && "rotate-180",
                )}
              />
              <span className="line-clamp-2" title={sectionLabel(s)}>
                {sectionLabel(s)}
              </span>
            </span>
            <span className="ps-4 text-meta text-text-3" data-testid="estimate-section-role">
              {SECTION_ROLE_LABEL[role.role]}
            </span>
          </span>
          <span className="w-24 text-right text-meta-strong">
            <span className="sr-only">СМР </span>
            {rub(s.workKopecks)}
          </span>
          <span className="w-14 text-right">
            <span className="sr-only">чел.-ч </span>
            {hours(s.laborHours)}
          </span>
        </button>
        {expanded ? (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 bg-surface-2 px-3 py-2 text-meta">
            <dt className="text-text-3">Итого по разделу</dt>
            <dd className="text-right">
              {rub(s.totalKopecks)} · стр. {s.totalRow}
            </dd>
            <dt className="text-text-3">Материалы</dt>
            <dd className="text-right">
              {s.materialsKopecks === null ? "нет в файле" : rub(s.materialsKopecks)}
              {s.materialsRow !== null ? ` · стр. ${s.materialsRow}` : ""}
            </dd>
            <dt className="text-text-3">СМР = итого − материалы</dt>
            <dd className="text-right text-meta-strong">{rub(s.workKopecks)}</dd>
            {s.pressure?.kind === "lines" ? (
              <dd className="col-span-2 text-text-3">
                В разделе есть строки испытаний на {rub(s.pressure.workKopecks)}. Выделять ли их
                отдельной строкой отчёта, уточняется у заказчика; сейчас они входят в СМР раздела.
              </dd>
            ) : null}
            {s.materialsNote ? <dd className="col-span-2 text-text-3">{s.materialsNote}</dd> : null}
            {s.workNote ? <dd className="col-span-2 text-warn">{s.workNote}</dd> : null}
            {role.note ? <dd className="col-span-2 text-text-3">{role.note}</dd> : null}
          </dl>
        ) : null}
      </li>
    );
  };

  return (
    <>
      <section
        className="flex flex-col gap-1 rounded-card border border-line p-3"
        data-testid="estimate-flow-kind"
        data-kind={kind}
      >
        <p className="text-body-strong">{ESTIMATE_KIND_LABEL[kind]}</p>
        <p className="text-meta text-text-2">{classified.hint}</p>
      </section>

      <dl className="grid grid-cols-1 gap-x-3 gap-y-1 text-meta sm:grid-cols-[auto_minmax(0,1fr)]">
        <HeaderRow term="Объект" field={h?.object ?? null} />
        <dt className="text-text-3">Адрес</dt>
        <dd className="min-w-0 break-words" data-testid="estimate-flow-address">
          {address ?? (
            <span className="text-warn">не найден в шапке: впишите на шаге «Объект»</span>
          )}
          {h?.address.row ? <span className="text-text-3"> · стр. {h.address.row}</span> : null}
        </dd>
        <HeaderRow term="Номер сметы" field={h?.number ?? null} />
      </dl>

      <ol
        className="flex flex-col gap-1.5"
        aria-label="Что нашли в файле"
        data-testid="estimate-flow-checks"
      >
        {checks.map((c) => (
          <li key={c.key} className="flex items-start gap-2" data-tone={c.tone}>
            <span
              className={cn(
                "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full",
                c.tone === "ok" ? "bg-ok-bg text-ok" : "bg-warn-bg text-warn",
              )}
              aria-hidden
            >
              {c.tone === "ok" ? (
                <Check className="size-3.5" />
              ) : (
                <AlertTriangle className="size-3.5" />
              )}
            </span>
            <span className="min-w-0 text-meta">
              <span className="text-meta-strong">{c.label}</span>
              <span className="text-text-2">: {c.text}</span>
            </span>
          </li>
        ))}
        {issues.map((issue, i) => (
          <li
            key={`issue-${i}`}
            className="flex items-start gap-2"
            data-tone="warn"
            data-testid="estimate-flow-issue"
          >
            <span
              className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-warn-bg text-warn"
              aria-hidden
            >
              <AlertTriangle className="size-3.5" />
            </span>
            <span className="min-w-0 text-meta text-text-2">
              {issue.message}
              {issue.row !== null ? ` · стр. ${issue.row}` : ""}
            </span>
          </li>
        ))}
      </ol>
      {duplicate ? (
        <p className="text-meta text-text-2">Этот файл уже загружали: показываем его разбор.</p>
      ) : null}

      {/* Разделы: отчётные подсвечены и идут первыми, остальные ниже и приглушены */}
      <section aria-labelledby="flow-sections" className="flex flex-col gap-1.5">
        <h3 id="flow-sections" className="text-meta-strong text-text-2">
          Разделы сметы · в отчёт выработки: {report.length} из {card.sections.length}
        </h3>
        <div
          className="overflow-hidden rounded-card border border-line text-meta tnum"
          data-testid="flow-sections-table"
        >
          <div
            aria-hidden
            className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 bg-surface-2 px-3 py-1.5 text-text-3"
          >
            <span>Раздел</span>
            <span className="w-24 text-right">СМР</span>
            <span className="w-14 text-right">Чел.-ч</span>
          </div>
          <ul aria-labelledby="flow-sections">
            {report.map(row)}
            {others.map(row)}
          </ul>
          <p className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 border-t border-line bg-surface-2 px-3 py-1.5 text-meta-strong">
            <span>В отчёт</span>
            <span className="w-24 text-right" data-testid="estimate-flow-report-total">
              <span className="sr-only">СМР </span>
              {rub(totalWork)}
            </span>
            <span className="w-14 text-right">
              <span className="sr-only">чел.-ч </span>
              {hours(totalLabor)}
            </span>
          </p>
        </div>
        <p className="text-meta text-text-3">
          Касание раздела раскрывает итог, материалы и строки файла: сверьте с Excel.
        </p>
      </section>

      {fixing ? (
        <section
          className="flex flex-col gap-2 rounded-card border border-line p-3"
          data-testid="estimate-flow-fix"
        >
          <p className="text-meta-strong">Исправьте неверные значения</p>
          <p className="text-meta text-text-2">
            Укажите правильную сумму и основание: с кем и о чём договорились. Было и стало останутся
            в смете.
          </p>
          {report.map((s) => (
            <EditableAmount
              key={s.key}
              versionId={version.id}
              target={{ kind: "section", row: s.totalRow }}
              label={`Итого по разделу: ${sectionLabel(s)}`}
              row={s.totalRow}
              kopecks={s.totalKopecks}
              correction={
                (version.corrections ?? [])
                  .filter((c) => c.target.kind === "section" && c.target.row === s.totalRow)
                  .at(-1) ?? null
              }
              canEdit={!confirmed}
            />
          ))}
          <details className="group">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-meta-strong text-text-2 focus-ring">
              Шапка сметы: объект, адрес, номер
              <ChevronDown
                aria-hidden
                className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none"
              />
            </summary>
            <div className="pt-2">
              <CardBody card={card} canEdit mode={mode} onMode={onMode} parts={["header"]} />
            </div>
          </details>
        </section>
      ) : null}

      <p className="text-body-strong">Значения извлечены верно?</p>
      <Nav
        onBack={onBack}
        next={
          <>
            {!fixing && !confirmed ? (
              <Button
                variant="secondary"
                size="field"
                onClick={() => setFixing(true)}
                data-testid="estimate-flow-fix-open"
              >
                Нет, исправить
              </Button>
            ) : null}
            <Button
              variant="primary"
              size="field"
              className="@lg:flex-1"
              loading={busy}
              iconEnd={<ArrowRight />}
              onClick={() => void agree()}
              data-testid="estimate-flow-next"
            >
              {fixing ? "Готово, дальше: объект" : "Да, всё верно"}
            </Button>
          </>
        }
      />
    </>
  );
}

function HeaderRow({
  term,
  field,
}: {
  term: string;
  field: { value: string | null; row: number | null; reason?: string } | null;
}) {
  return (
    <>
      <dt className="text-text-3">{term}</dt>
      <dd className="min-w-0 break-words">
        {field?.value ?? <span className="text-warn">не найдено</span>}
        {field?.row ? <span className="text-text-3"> · стр. {field.row}</span> : null}
      </dd>
    </>
  );
}

/* ---------------------------------------------------------------- 4. Бригады */

function BrigadesStep({
  objectId,
  onBack,
  onNext,
  onDone,
}: {
  objectId: string;
  onBack: () => void;
  onNext: () => void;
  onDone: () => void;
}) {
  const navigate = useNavigate();
  const sections = useObjectSections(objectId);
  const assignments = useSectionAssignments(objectId);
  const options = useAssignOptions();
  const name = useBrigadeName();
  const actions = useSectionActions();
  const [busy, setBusy] = useState(false);
  // Отчётные разделы первыми: их бригады и считают выработку
  const ordered = [...sections.filter((s) => s.report), ...sections.filter((s) => !s.report)];

  const assign = async (keys: string[], brigadeId: string) => {
    if (!brigadeId || busy) return;
    setBusy(true);
    let done = 0;
    for (const sectionKey of keys) {
      if (assignments.some((a) => a.sectionKey === sectionKey && a.brigadeId === brigadeId))
        continue;
      const result = await actions.assign({
        objectId,
        sectionKey,
        brigadeId,
        from: options.weekFrom,
        to: null,
      });
      if (result.ok) done += 1;
      else toast.error(result.message);
    }
    setBusy(false);
    if (done) toast.success(`Назначено разделов: ${done} · ${name(brigadeId)}`);
  };

  const unassign = async (id: string) => {
    const result = await actions.unassign(id);
    if (!result.ok) toast.error(result.message);
  };

  const assigned = sections.filter((s) => assignments.some((a) => a.sectionKey === s.key)).length;
  /** Бригады списком; для земли и П/Э первыми те, кто их выполняет (№ 2 и № 5) */
  const brigadeOptions = (role?: SectionRole) =>
    [...options.brigades]
      .map((b) => ({ ...b, fits: role ? recommendedBrigade(role, b) : false }))
      .sort((a, b) => Number(b.fits) - Number(a.fits))
      .map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
          {b.fits ? " · выполняет землю и П/Э" : ""}
          {b.away ? " · в отпуске на этой неделе" : ""}
        </option>
      ));

  return (
    <>
      <Hint>
        Каждый раздел отчёта назначьте бригаде, которая его делает: бригадир увидит раздел в форме
        времени. Испытания назначьте той же бригаде, что и сталь: в отчёте это отдельная строка.
      </Hint>
      <p className="text-meta text-text-2" data-testid="flow-brigades-summary">
        Назначено {assigned} из {sections.length}. Бригада увидит раздел в форме времени с{" "}
        {options.weekFrom.slice(8, 10)}.{options.weekFrom.slice(5, 7)}.
      </p>
      <label className="flex flex-col gap-1 text-meta text-text-2">
        Всем разделам одну бригаду
        <select
          aria-label="Всем разделам одну бригаду"
          className="h-11 rounded-control border border-line bg-surface px-3 text-body text-text"
          disabled={busy}
          value=""
          onChange={(e) =>
            void assign(
              sections.map((s) => s.key),
              e.target.value,
            )
          }
        >
          <option value="">Выберите бригаду</option>
          {brigadeOptions()}
        </select>
      </label>
      <ul
        className="overflow-hidden rounded-card border border-line [&>li+li]:border-t [&>li+li]:border-line"
        aria-label="Разделы и бригады"
      >
        {ordered.map((s) => {
          const own = assignments.filter((a) => a.sectionKey === s.key);
          return (
            <li
              key={s.key}
              className={cn(
                "flex flex-col gap-1.5 px-3 py-2",
                s.report && "border-s-4 border-orange bg-accent-bg/40",
              )}
              data-testid="flow-section"
              data-report={s.report}
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-meta-strong">{sectionLabel(s)}</span>
                <span className="text-meta text-text-3">{SECTION_ROLE_LABEL[s.role]}</span>
              </span>
              {own.length ? (
                <ul className="flex flex-wrap gap-1.5">
                  {own.map((a) => {
                    const away = options.brigades.find((b) => b.id === a.brigadeId)?.away;
                    return (
                      <li
                        key={a.id}
                        className="inline-flex min-h-9 items-center gap-1 rounded-pill bg-ok-bg ps-3 text-meta text-ok"
                      >
                        <Check className="size-3.5" aria-hidden />
                        {name(a.brigadeId)}
                        {away ? <span className="text-warn"> · в отпуске</span> : null}
                        <button
                          type="button"
                          onClick={() => void unassign(a.id)}
                          className="inline-flex size-9 items-center justify-center rounded-full text-text-2 focus-ring"
                          aria-label={`Снять ${name(a.brigadeId)} с раздела`}
                        >
                          ×
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <span className="text-meta text-text-3">не назначен</span>
              )}
              <select
                aria-label={`Бригада: ${sectionLabel(s)}`}
                className="h-11 rounded-control border border-line bg-surface px-3 text-meta text-text"
                disabled={busy}
                value=""
                onChange={(e) => void assign([s.key], e.target.value)}
              >
                <option value="">{own.length ? "Добавить бригаду" : "Выберите бригаду"}</option>
                {brigadeOptions(s.role)}
              </select>
            </li>
          );
        })}
      </ul>
      <Nav
        onBack={onBack}
        next={
          <>
            <Button
              variant="secondary"
              size="field"
              data-testid="flow-open-object"
              onClick={() => {
                onDone();
                void navigate({ to: "/gas/objects/$id", params: { id: objectId } });
              }}
            >
              Открыть объект
            </Button>
            <Button
              variant="primary"
              size="field"
              className="@lg:flex-1"
              iconEnd={<ArrowRight />}
              onClick={onNext}
              data-testid="flow-brigades-next"
            >
              Дальше: стоимость
            </Button>
          </>
        }
      />
    </>
  );
}

/* ---------------------------------------------------------------- 5. Стоимость */

function CostStep({
  card,
  objectId,
  onBack,
  onDone,
}: {
  card: EstimateCard;
  objectId: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const navigate = useNavigate();
  const actions = useGasEstimateActions();
  const actor = useGasActor();
  const object = useGasObjects().find((c) => c.object.id === objectId)?.object ?? null;
  const [busy, setBusy] = useState(false);
  const version = card.version;
  const confirmed = version.confirmedAt !== null;
  const { sections: roles } = classifySections(card.sections, workTextOf(card.version.header));
  const report = card.sections.filter((s) => roles.find((r) => r.key === s.key)?.report);

  const confirm = async () => {
    setBusy(true);
    const result = await actions.confirm(version.id);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    notify(`Смета подтверждена: ${fmtRub(result.value.estimate.amountRub)}`);
  };

  return (
    <>
      <Hint>
        Без подтверждения сумма в отчёт не попадёт: деньги решает человек. В отчёт выработки пойдут
        разделы:
      </Hint>
      <ul
        className="overflow-hidden rounded-card border border-line text-meta tnum [&>li+li]:border-t [&>li+li]:border-line"
        data-testid="estimate-flow-cost"
      >
        {report.length === 0 ? (
          <li className="px-3 py-2 text-warn">Разделов для отчёта нет: проверьте смету</li>
        ) : (
          report.map((s) => (
            <li
              key={s.key}
              className="flex items-center justify-between gap-3 border-s-4 border-orange px-3 py-2"
            >
              <span className="min-w-0 truncate">{sectionLabel(s)}</span>
              <span className="shrink-0 text-meta-strong">СМР {rub(s.workKopecks)}</span>
            </li>
          ))
        )}
      </ul>
      {confirmed ? (
        <p
          className="flex items-center gap-2 text-body text-ok"
          data-testid="estimate-flow-confirmed"
        >
          <Check className="size-4" aria-hidden />
          Стоимость подтверждена
        </p>
      ) : actor.canManageEstimates ? (
        <Button
          variant="primary"
          size="field"
          loading={busy}
          loadingText="Подтверждаю..."
          onClick={() => void confirm()}
          data-testid="estimate-flow-confirm"
        >
          Подтвердить смету
        </Button>
      ) : null}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Button
          variant={confirmed ? "primary" : "secondary"}
          size="field"
          onClick={() => {
            onDone();
            void navigate({ to: "/gas/objects/$id", params: { id: objectId } });
          }}
          data-testid="estimate-flow-to-object"
        >
          Открыть объект
        </Button>
        {object ? (
          <Link
            to="/gas/tabel"
            search={{ q: object.label }}
            onClick={onDone}
            className="inline-flex min-h-12 items-center justify-center rounded-control bg-surface-2 px-4 text-body-strong focus-ring"
          >
            Табель объекта
          </Link>
        ) : null}
        <Link
          to="/gas/estimates"
          search={{ open: version.id }}
          onClick={onDone}
          className="inline-flex min-h-12 items-center justify-center rounded-control bg-surface-2 px-4 text-body-strong focus-ring"
        >
          Смета целиком
        </Link>
      </div>
      <Nav onBack={onBack} />
    </>
  );
}
