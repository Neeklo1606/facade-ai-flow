/**
 * «Сверка с отчётом заказчика» в «Неделе» (финальный промт, 1.8; ADR-063): руководитель
 * загружает ручной «ФАКТИЧЕСКИЙ ОТЧЁТ» за ту же неделю и видит расхождения по объектам
 * и дням с причиной. Инструмент пилота: файл не сохраняется, читается в браузере.
 */
import { useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { fmtRub } from "@/api/gas-ops";
import {
  RECONCILE_REASON_LABEL,
  useFileReconcile,
  type FileReconciliation,
} from "@/api/gas-estimates";
import { Button, Card } from "@/components/ui/mono";
import { plural } from "@/lib/format";

const shortDay = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}`;
const hoursText = (hours: number) =>
  `${hours.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ч`;

export function ReconcileUpload() {
  const reconcile = useFileReconcile();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ name: string; data: FileReconciliation } | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const answer = await reconcile(file);
    setBusy(false);
    if (answer.ok) setResult({ name: file.name, data: answer.result });
    else {
      setResult(null);
      setError(answer.message);
    }
    if (input.current) input.current.value = "";
  };

  const list = result?.data.discrepancies ?? [];

  return (
    <Card title="Сверка с отчётом заказчика">
      <div className="flex flex-col gap-3" data-testid="reconcile-upload">
        <p className="type-label text-ink-2">
          Загрузите ручной «Фактический отчёт» за эту неделю: система сравнит его с принятыми
          записями по объектам и дням. Файл не сохраняется.
        </p>
        <input
          ref={input}
          type="file"
          accept=".xlsx,.xls"
          className="sr-only"
          data-testid="reconcile-file"
          aria-label="Excel заказчика за неделю"
          onChange={(event) => void pick(event.target.files?.[0])}
        />
        <Button
          variant="secondary"
          className="self-start"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <FileUp aria-hidden />
          {busy ? "Сверяем…" : "Загрузить Excel заказчика"}
        </Button>
        {error ? (
          <p role="alert" className="type-label text-down">
            {error}
          </p>
        ) : null}
        {result ? (
          <div className="flex flex-col gap-2" data-testid="reconcile-result">
            <p className="type-text" role="status">
              {list.length === 0
                ? `Расхождений нет: ${result.data.matched} ${plural(result.data.matched, "пара", "пары", "пар")} «объект · день» совпали до рубля и до сотой часа.`
                : `Расхождений: ${list.length} из ${result.data.compared}. Совпало: ${result.data.matched}.`}
            </p>
            {list.length > 0 ? (
              <ul aria-label="Расхождения" className="flex flex-col divide-y divide-line">
                {list.map((d) => (
                  <li key={`${d.objectId}|${d.day}`} className="flex flex-col gap-0.5 py-2">
                    <span className="type-text">
                      {shortDay(d.day)} · {d.objectLabel}
                    </span>
                    <span className="type-label text-caution">
                      {RECONCILE_REASON_LABEL[d.reason]}
                    </span>
                    <span className="type-label text-ink-2 tnum">
                      Файл:{" "}
                      {d.file ? `${fmtRub(d.file.amountRub)}, ${hoursText(d.file.hours)}` : "нет"} ·
                      Система:{" "}
                      {d.system
                        ? `${fmtRub(d.system.amountRub)}, ${hoursText(d.system.hours)}`
                        : "нет"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {result.data.unknown.length > 0 ? (
              <p className="type-label text-ink-2">
                Адреса из файла, которых нет среди объектов:{" "}
                {result.data.unknown.map((u) => `строка ${u.row} «${u.label}»`).join("; ")}.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
