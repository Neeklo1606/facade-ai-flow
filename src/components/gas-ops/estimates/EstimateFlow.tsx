/**
 * Мастер «Загрузить смету» (ADR-080, ADR-082): один вход с «Обзора» и «Объектов», четыре шага.
 *
 * 1. Файл — выбрать или перетащить .xls/.xlsx.
 * 2. Проверка — что нашли в файле (итоги разбора) и разделы компактной таблицей: раздел,
 *    работы без материалов, нормативные чел.-ч. Касание раскрывает строку: итог, материалы,
 *    опрессовка, строки файла. Шапка сметы свёрнута.
 * 3. Объект — «Прикрепить» к найденному или «Создать» из шапки (деньги решает человек).
 * 4. Бригады — каждому разделу бригада прямо здесь, назначение сразу и обратимо. Дальше —
 *    страница объекта или табель объекта.
 * Разбор и запись те же, что в «Папке смет» (ADR-077), назначения — ADR-078.
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState, type DragEvent } from "react";
import { AlertTriangle, Check, ChevronDown, Upload } from "lucide-react";
import { useGasActor, useGasObjects } from "@/api/gas-ops";
import {
  estimateChecks,
  useEstimateIntake,
  type EstimateCard,
  type PressureMode,
  type UploadRow,
} from "@/api/gas-estimate-intake";
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
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { CardBody } from "./EstimateIntake";

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

type Step = "file" | "check" | "object" | "brigades";
const STEPS: [Step, string][] = [
  ["file", "Файл"],
  ["check", "Проверка"],
  ["object", "Объект"],
  ["brigades", "Бригады"],
];

const rub = (kopecks: number | null) =>
  kopecks === null
    ? "–"
    : `${Math.round(kopecks / 100).toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ₽`;
const hours = (value: number | null) =>
  value === null ? "–" : value.toLocaleString("ru-RU", { maximumFractionDigits: 1 });

function EstimateFlow({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const intake = useEstimateIntake();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [rows, setRows] = useState<UploadRow[] | null>(null);
  const [mode, setMode] = useState<PressureMode>("payroll");
  const [step, setStep] = useState<Step>("file");
  const [objectId, setObjectId] = useState<string | null>(null);

  const versionId =
    rows?.map((r) => r.outcome?.versionId ?? null).find((id): id is string => !!id) ?? null;
  const card = versionId ? intake.cardOf(versionId, mode) : null;

  const send = async (list: File[]) => {
    if (!list.length || intake.busy) return;
    const result = await intake.upload(list.slice(0, 1));
    setRows(result);
    if (result.some((r) => r.outcome?.versionId)) setStep("check");
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    void send([...event.dataTransfer.files]);
  };

  const linked = objectId ?? card?.object?.id ?? null;

  return (
    <AdaptiveSheet
      open={open}
      onOpenChange={onOpenChange}
      id="estimate-flow"
      title="Загрузить смету"
      description={
        step === "file"
          ? "Excel .xls или .xlsx до 20 МБ"
          : (card?.object?.label ?? card?.draft.label ?? "Смета")
      }
    >
      <div className="flex flex-col gap-4" data-testid="estimate-flow" data-step={step}>
        <StepBar step={step} />

        {step === "file" ? (
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
              {intake.busy ? (
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
              loading={intake.busy}
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
                void send(list);
              }}
            />
            {rows && !versionId ? (
              <ul className="flex flex-col gap-1" data-testid="estimate-flow-error">
                {rows.map((r, i) => (
                  <li key={`${r.name}-${i}`} className="text-meta text-warn">
                    {r.name}: {r.text}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {step === "check" && card ? (
          <CheckStep
            card={card}
            duplicate={rows?.[0]?.outcome?.kind === "duplicate"}
            mode={mode}
            onMode={setMode}
            onNext={() => setStep("object")}
          />
        ) : null}

        {step === "object" && card ? (
          <>
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
            {card.object ? (
              <Button
                variant="primary"
                size="field"
                onClick={() => {
                  setObjectId(card.object!.id);
                  setStep("brigades");
                }}
              >
                Дальше: бригады
              </Button>
            ) : null}
          </>
        ) : null}

        {step === "brigades" && linked ? (
          <BrigadesStep objectId={linked} onDone={() => onOpenChange(false)} />
        ) : null}
      </div>
    </AdaptiveSheet>
  );
}

/* ---------------------------------------------------------------- Шаги */

function StepBar({ step }: { step: Step }) {
  const at = STEPS.findIndex(([key]) => key === step);
  return (
    <ol className="grid grid-cols-4 gap-1.5" aria-label="Шаги загрузки сметы">
      {STEPS.map(([key, label], i) => (
        <li
          key={key}
          className="flex min-w-0 flex-col gap-1"
          aria-current={i === at ? "step" : undefined}
        >
          <span
            aria-hidden
            className={cn(
              "h-1 rounded-full",
              i < at ? "bg-ok" : i === at ? "bg-orange" : "bg-surface-3",
            )}
          />
          <span
            className={cn(
              "truncate text-meta",
              i === at ? "text-meta-strong text-text" : "text-text-3",
            )}
          >
            <span className="sr-only">Шаг {i + 1}: </span>
            {label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function CheckStep({
  card,
  duplicate,
  mode,
  onMode,
  onNext,
}: {
  card: EstimateCard;
  duplicate: boolean;
  mode: PressureMode;
  onMode: (mode: PressureMode) => void;
  onNext: () => void;
}) {
  const checks = estimateChecks(card);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const totalWork = card.sections.reduce((a, s) => a + (s.workKopecks ?? 0), 0);
  const totalLabor = card.sections.reduce((a, s) => a + (s.laborHours ?? 0), 0);
  return (
    <>
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
      </ol>
      {duplicate ? (
        <p className="text-meta text-text-2">Этот файл уже загружали: показываем его разбор.</p>
      ) : null}

      {/* Разделы компактной таблицей, как строки сметы (ADR-082) */}
      <section aria-labelledby="flow-sections" className="flex flex-col gap-1.5">
        <h3 id="flow-sections" className="text-meta-strong text-text-2">
          Разделы сметы
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
            <span className="w-24 text-right">Работы</span>
            <span className="w-14 text-right">Чел.-ч</span>
          </div>
          <ul aria-labelledby="flow-sections">
            {card.sections.map((s) => {
              const expanded = openKey === s.key;
              return (
                <li key={s.key} className="border-t border-line">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setOpenKey(expanded ? null : s.key)}
                    className="grid min-h-11 w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 px-3 py-1.5 text-left focus-ring"
                    data-testid="estimate-section"
                  >
                    <span className="flex min-w-0 items-center gap-1">
                      <ChevronDown
                        aria-hidden
                        className={cn(
                          "size-3.5 shrink-0 text-text-3 transition-transform motion-reduce:transition-none",
                          expanded && "rotate-180",
                        )}
                      />
                      <span className="truncate text-text">{sectionLabel(s)}</span>
                    </span>
                    <span className="w-24 text-right text-meta-strong">
                      <span className="sr-only">работы </span>
                      {rub(s.workKopecks)}
                    </span>
                    <span className="w-14 text-right">
                      <span className="sr-only">чел.-ч </span>
                      {hours(s.laborHours)}
                    </span>
                  </button>
                  {expanded ? (
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 bg-surface-2 px-3 py-2 text-meta">
                      <dt className="text-text-3">Итог раздела</dt>
                      <dd className="text-right">
                        {rub(s.totalKopecks)} · стр. {s.totalRow}
                      </dd>
                      <dt className="text-text-3">Материалы</dt>
                      <dd className="text-right">
                        {rub(s.materialsKopecks)}
                        {s.materialsRow !== null ? ` · стр. ${s.materialsRow}` : ""}
                      </dd>
                      {s.pressure ? (
                        <>
                          <dt className="text-text-3">
                            {s.pressure.kind === "section" ? "Опрессовка" : "В т. ч. опрессовка"}
                          </dt>
                          <dd className="text-right">{rub(s.pressure.workKopecks)}</dd>
                        </>
                      ) : null}
                      {s.materialsNote ? (
                        <dd className="col-span-2 text-text-3">{s.materialsNote}</dd>
                      ) : null}
                    </dl>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <p className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 border-t border-line bg-surface-2 px-3 py-1.5 text-meta-strong">
            <span>Итого</span>
            <span className="w-24 text-right">
              <span className="sr-only">работы </span>
              {rub(totalWork)}
            </span>
            <span className="w-14 text-right">
              <span className="sr-only">чел.-ч </span>
              {hours(totalLabor)}
            </span>
          </p>
        </div>
      </section>

      <details className="group rounded-card border border-line px-3 py-2">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-meta-strong text-text-2 focus-ring">
          Шапка сметы и сверка с файлом
          <ChevronDown
            aria-hidden
            className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>
        <div className="pt-2">
          <CardBody card={card} canEdit mode={mode} onMode={onMode} parts={["header"]} />
        </div>
      </details>

      <Button variant="primary" size="field" onClick={onNext} data-testid="estimate-flow-next">
        Дальше: объект
      </Button>
    </>
  );
}

function BrigadesStep({ objectId, onDone }: { objectId: string; onDone: () => void }) {
  const navigate = useNavigate();
  const sections = useObjectSections(objectId);
  const assignments = useSectionAssignments(objectId);
  const options = useAssignOptions();
  const name = useBrigadeName();
  const actions = useSectionActions();
  const object = useGasObjects().find((c) => c.object.id === objectId)?.object ?? null;
  const [busy, setBusy] = useState(false);

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

  const assigned = sections.filter((s) => assignments.some((a) => a.sectionKey === s.key)).length;

  return (
    <>
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
          {options.brigades.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <ul
        className="overflow-hidden rounded-card border border-line [&>li+li]:border-t [&>li+li]:border-line"
        aria-label="Разделы и бригады"
      >
        {sections.map((s) => {
          const own = assignments.filter((a) => a.sectionKey === s.key);
          return (
            <li key={s.key} className="flex flex-col gap-1.5 px-3 py-2" data-testid="flow-section">
              <span className="flex min-w-0 items-center justify-between gap-2">
                <span className="truncate text-meta-strong">{sectionLabel(s)}</span>
                {own.length ? (
                  <span className="flex shrink-0 items-center gap-1 text-meta text-ok">
                    <Check className="size-3.5" aria-hidden />
                    {own.map((a) => name(a.brigadeId)).join(", ")}
                  </span>
                ) : (
                  <span className="shrink-0 text-meta text-text-3">не назначен</span>
                )}
              </span>
              <select
                aria-label={`Бригада: ${sectionLabel(s)}`}
                className="h-11 rounded-control border border-line bg-surface px-3 text-meta text-text"
                disabled={busy}
                value=""
                onChange={(e) => void assign([s.key], e.target.value)}
              >
                <option value="">{own.length ? "Добавить бригаду" : "Выберите бригаду"}</option>
                {options.brigades.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="primary"
          size="field"
          className="flex-1"
          data-testid="flow-open-object"
          onClick={() => {
            onDone();
            void navigate({ to: "/gas/objects/$id", params: { id: objectId } });
          }}
        >
          Открыть объект
        </Button>
        {object ? (
          <Link
            to="/gas/tabel"
            search={{ q: object.label }}
            onClick={onDone}
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-control bg-surface-2 px-4 text-body-strong focus-ring"
          >
            Табель объекта
          </Link>
        ) : null}
      </div>
    </>
  );
}
