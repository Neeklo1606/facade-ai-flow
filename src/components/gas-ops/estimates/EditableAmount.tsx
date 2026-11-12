/**
 * Строка разбора сметы с правкой (ADR-066): итог, раздел или строка ниже «ВСЕГО». До
 * подтверждения сметы сумму можно исправить на ту, о которой договорились с заказчиком.
 * Основание обязательно и остаётся рядом со значением вместе с «было» (правило 2).
 */
import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/kit/field";
import { notify } from "@/components/ui/kit/toast";
import {
  useGasEstimateActions,
  type CorrectionTarget,
  type EstimateCorrection,
} from "@/api/gas-estimates";
import { toast } from "@/lib/toast";

const kop = (k: number) =>
  `${(k / 100).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;

/** «25 000,5» → 2 500 050 копеек; null — не число */
export function parseKopecks(text: string): number | null {
  const clean = text.replace(/[\s\u00a0₽]/g, "").replace(",", ".");
  if (!clean || !/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

export function EditableAmount({
  versionId,
  target,
  label,
  row,
  kopecks,
  correction,
  canEdit,
}: {
  versionId: string;
  target: CorrectionTarget;
  label: string;
  row: number;
  kopecks: number;
  correction: EstimateCorrection | null;
  canEdit: boolean;
}) {
  const actions = useGasEstimateActions();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const value = parseKopecks(amount);
  const amountError = value === null ? "Сумма числом: 25 000,50" : null;
  const noteError = note.trim() ? null : "Основание: с кем и о чём договорились";

  const open = () => {
    setAmount((kopecks / 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 }));
    setNote("");
    setTried(false);
    setEditing(true);
  };

  const save = async () => {
    setTried(true);
    if (value === null || noteError) return;
    setBusy(true);
    const result = await actions.correct({ id: versionId, target, kopecks: value, note });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    notify(`${label}: ${kop(value)}. Основание в журнале`);
    setEditing(false);
  };

  return (
    <li className="py-2" data-testid="estimate-line">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-body text-text-2">{label}</p>
          <p className="text-meta text-text-3">строка {row}</p>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-body tnum">{kop(kopecks)}</span>
          {correction ? (
            <span className="text-meta text-text-3 tnum">
              было <s>{kop(correction.fromKopecks)}</s>
            </span>
          ) : null}
        </div>
        {canEdit && !editing ? (
          <Button
            variant="quiet"
            size="icon"
            className="-me-2 -mt-1 shrink-0"
            aria-label={`Исправить: ${label}`}
            title="Исправить"
            onClick={open}
          >
            <Pencil aria-hidden />
          </Button>
        ) : null}
      </div>
      {correction && !editing ? (
        <p className="mt-1 rounded-control bg-flame-soft px-3 py-2 text-meta text-flame-text">
          Исправлено вручную. Основание: {correction.note}
        </p>
      ) : null}
      {editing ? (
        <div className="mt-2 flex flex-col gap-2 rounded-control bg-surface-2 p-3">
          <Field
            label="Новая сумма"
            value={amount}
            onChange={setAmount}
            inputMode="decimal"
            unit="₽"
            error={amountError}
            showError={tried}
          />
          <Field
            label="Основание"
            value={note}
            onChange={setNote}
            placeholder="Согласовано с заказчиком 03.10 по телефону"
            error={noteError}
            showError={tried}
          />
          <div className="flex gap-2">
            <Button
              variant="primary"
              className="flex-1"
              loading={busy}
              loadingText="Сохраняю..."
              onClick={() => void save()}
            >
              Сохранить
            </Button>
            <Button variant="secondary" onClick={() => setEditing(false)}>
              Отмена
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
