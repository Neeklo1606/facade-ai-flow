/**
 * Мастер «Загрузить смету» (ADR-080): один вход с «Обзора» и «Объектов». Файл → итоги разбора
 * по шагам → карточки сметы (шапка, объект, разделы) → «Создать» или «Прикрепить» → страница
 * объекта, где разделы раздают бригадам. Разбор и запись те же, что в «Папке смет» (ADR-077).
 */
import { useNavigate } from "@tanstack/react-router";
import { useRef, useState, type DragEvent } from "react";
import { AlertTriangle, Check, Upload } from "lucide-react";
import { useGasActor } from "@/api/gas-ops";
import {
  estimateChecks,
  useEstimateIntake,
  type PressureMode,
  type UploadRow,
} from "@/api/gas-estimate-intake";
import { AdaptiveSheet } from "@/components/gas-ops/AdaptiveSheet";
import { Button } from "@/components/ui/button";
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

function EstimateFlow({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const intake = useEstimateIntake();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [rows, setRows] = useState<UploadRow[] | null>(null);
  const [mode, setMode] = useState<PressureMode>("payroll");

  const versionId =
    rows?.map((r) => r.outcome?.versionId ?? null).find((id): id is string => !!id) ?? null;
  const card = versionId ? intake.cardOf(versionId, mode) : null;

  const send = async (list: File[]) => {
    if (!list.length || intake.busy) return;
    setRows(await intake.upload(list.slice(0, 1)));
  };

  const toObject = (objectId: string) => {
    onOpenChange(false);
    void navigate({ to: "/gas/objects/$id", params: { id: objectId } });
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    void send([...event.dataTransfer.files]);
  };

  const checks = card ? estimateChecks(card) : [];

  return (
    <AdaptiveSheet
      open={open}
      onOpenChange={onOpenChange}
      id="estimate-flow"
      title={card ? "Смета разобрана" : "Загрузить смету"}
      description={
        card
          ? "Проверьте карточки и выберите объект"
          : "Excel .xls или .xlsx до 20 МБ. Объект и разделы система предложит сама"
      }
    >
      <div className="flex flex-col gap-section" data-testid="estimate-flow">
        {!card ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
            className={cn(
              "flex flex-col items-center gap-3 rounded-card border border-dashed p-card py-10 text-center",
              over ? "border-accent bg-panel-2" : "border-line-2",
            )}
          >
            <p className="text-body text-text-2" role="status">
              {intake.busy
                ? "Читаю шапку, разделы и итоги, ищу объект…"
                : "Перетащите файл сметы сюда"}
            </p>
            <Button
              variant="primary"
              size="field"
              loading={intake.busy}
              onClick={() => input.current?.click()}
              iconEnd={<Upload />}
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
        ) : (
          <>
            <ol
              className="flex flex-col gap-2"
              aria-label="Что нашли в файле"
              data-testid="estimate-flow-checks"
            >
              {checks.map((c) => (
                <li key={c.key} className="flex items-start gap-3" data-tone={c.tone}>
                  <span
                    className={cn(
                      "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
                      c.tone === "ok" ? "bg-ok-bg text-ok" : "bg-warn-bg text-warn",
                    )}
                    aria-hidden
                  >
                    {c.tone === "ok" ? (
                      <Check className="size-4" />
                    ) : (
                      <AlertTriangle className="size-4" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="text-body-strong">{c.label}</span>
                    <span className="text-body text-text-2">: {c.text}</span>
                  </span>
                </li>
              ))}
            </ol>
            {rows?.[0]?.outcome?.kind === "duplicate" ? (
              <p className="text-meta text-text-2">
                Этот файл уже загружали: показываем его разбор.
              </p>
            ) : null}
            <CardBody card={card} canEdit mode={mode} onMode={setMode} onLinked={toObject} />
            {card.object ? (
              <Button variant="primary" size="field" onClick={() => toObject(card.object!.id)}>
                Открыть объект {card.object.code}
              </Button>
            ) : null}
          </>
        )}
      </div>
    </AdaptiveSheet>
  );
}
