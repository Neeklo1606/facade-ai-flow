import { completePageHead } from "@/lib/page-head";
import { ScreenHint } from "@/components/gas-ops/page";
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/kit/field";
import { ListRow } from "@/components/ui/kit/list";
import { PickerSheet, Sheet } from "@/components/ui/kit/sheet";
import { Chip } from "@/components/ui/kit/status";
import { notify } from "@/components/ui/kit/toast";
import { SourceMark } from "@/components/gas-ops/marks";
import {
  fmtRub,
  useGasActions,
  useGasActor,
  useGasDirectory,
  useGasEstimates,
  type Estimate,
} from "@/api/gas-ops";
import {
  ESTIMATE_SAMPLES,
  fmtKopecks,
  workCostCandidate,
  type EstimateSample,
} from "@/lib/gas-ops/estimate-samples";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/**
 * Стоимость работ и сметы (ТЗ, п. 6 и 10; вид ADR-045, 5.10). Список объектов со статусом
 * сметы, загрузка сметы с разбором и ручной ввод для объектов без сметы (котлы).
 *
 * Разбор в демо показан на двух подготовленных примерах из раздела 1.3 (ГРАНД-Смета
 * и ресурсная 14 граф): выбор любого файла открывает пример, а не читает файл. Кандидат
 * стоимости работ — иллюстрация с меткой «Требует согласования», расчёт не меняется.
 */
export const Route = createFileRoute("/gas/estimates")({
  head: () =>
    completePageHead(
      { meta: [{ title: "Стоимость работ · Учёт выработки бригад" }] },
      "Стоимость работ · Учёт выработки бригад",
      "Подтверждённая стоимость работ без материалов, загрузка смет и ручной ввод сумм.",
    ),
  component: EstimatesPage,
});

const STATUS: Record<Estimate["status"], { word: string; dot: string }> = {
  confirmed: { word: "Подтверждена", dot: "bg-ok" },
  "manual-pending": { word: "Ждёт подтверждения", dot: "bg-warn" },
  missing: { word: "Нет сметы", dot: "bg-text-3" },
};

function EstimatesPage() {
  const rows = useGasEstimates();
  const actor = useGasActor();
  const actions = useGasActions();
  const directory = useGasDirectory();
  const [upload, setUpload] = useState(false);
  const [sample, setSample] = useState<EstimateSample | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [picker, setPicker] = useState(false);
  const [objectId, setObjectId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const value = Number(amount.replace(/[\s\u00a0]/g, "").replace(",", "."));
  const amountError = !amount.trim()
    ? "Укажите сумму"
    : !Number.isFinite(value) || value <= 0
      ? "Сумма числом больше нуля"
      : null;
  const object = directory.objects.find((o) => o.id === objectId) ?? null;

  /* Любой файл в демо открывает пример разбора: xls — ресурсная, остальное — ГРАНД-Смета */
  const pickFile = (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setSample(/\.xls$/i.test(file.name) ? ESTIMATE_SAMPLES.resource : ESTIMATE_SAMPLES.grand);
    setUpload(false);
  };

  const save = async () => {
    setTried(true);
    if (!objectId || amountError) return;
    const result = await actions.setEstimate({
      objectId,
      amountRub: value,
      note: note.trim() || undefined,
    });
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    notify(
      `Стоимость сохранена: ${fmtRub(result.value.amountRub)}, версия ${result.value.version}`,
    );
    setAmount("");
    setNote("");
    setTried(false);
    setManual(false);
  };

  return (
    <div className="flex flex-col gap-block">
      <ScreenHint screen="estimates" className="mb-0" />
      <p className="text-meta text-text-3">
        Стоимость работ без материалов, целые рубли. В фактическом отчёте заказчика подтверждённой
        стоимости нет: здесь только то, что подтвердил человек. Какие статьи сметы входят в
        стоимость работ: открытый вопрос ТЗ.
      </p>

      {actor.canManageEstimates ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="lg" onClick={() => setUpload(true)}>
            <Upload aria-hidden />
            Загрузить смету
          </Button>
          <Button variant="outline" size="lg" onClick={() => setManual(true)}>
            Ввести вручную
          </Button>
        </div>
      ) : null}

      <section aria-labelledby="estimates-list">
        <h2 id="estimates-list" className="flex h-7 items-center text-meta text-text-3">
          Объекты и сметы
        </h2>
        <ul className="surface-1 overflow-hidden [&>li+li]:border-t [&>li+li]:border-line">
          {rows.map(({ estimate, object: obj }) => {
            const status = STATUS[estimate.status];
            return (
              <li key={estimate.id}>
                <ListRow
                  title={obj?.label ?? estimate.objectId}
                  meta={
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <span
                        aria-hidden
                        className={cn("size-2 shrink-0 rounded-full", status.dot)}
                      />
                      <span className="truncate">
                        {status.word} · {obj?.code ?? "–"} · версия {estimate.version}
                      </span>
                    </span>
                  }
                  value={
                    estimate.status === "missing" ? (
                      <span className="font-normal text-warn">нет сметы</span>
                    ) : (
                      fmtRub(estimate.amountRub)
                    )
                  }
                  valueMeta={<SourceMark source={estimate.source} />}
                />
              </li>
            );
          })}
          {sample ? (
            <li>
              <ListRow
                title={fileName ?? sample.format}
                meta={
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden className="size-2 rounded-full bg-info" />
                    Загружена, ждёт сметчика · Развитие
                  </span>
                }
                value={fmtKopecks(workCostCandidate(sample))}
                valueMeta="кандидат"
                onClick={() => setSample({ ...sample })}
              />
            </li>
          ) : null}
        </ul>
      </section>

      {sample ? (
        <ParsedEstimate
          sample={sample}
          fileName={fileName}
          onManual={() => setManual(true)}
          onClose={() => setSample(null)}
        />
      ) : null}

      <Sheet
        open={upload}
        onOpenChange={setUpload}
        id="estimate-upload"
        title="Загрузить смету"
        description="Файл xlsx или xls из ГРАНД-Сметы или ресурсная смета"
      >
        <div className="flex flex-col gap-block">
          <p className="text-meta text-text-3">
            Развитие · в демо разбор показан на примере: файл не читается и не отправляется.
          </p>
          <label
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              pickFile(event.dataTransfer.files[0]);
            }}
            className="flex min-h-30 cursor-pointer flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line-2 p-card text-center focus-within:ring-2 focus-within:ring-orange"
          >
            <FileSpreadsheet className="size-8 text-text-3" aria-hidden />
            <span className="text-body">Выберите файл сметы</span>
            <span className="hidden text-meta text-text-3 md:block">или перетащите его сюда</span>
            <input
              ref={input}
              type="file"
              accept=".xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={(event) => pickFile(event.target.files?.[0])}
            />
          </label>
          <p className="text-meta text-text-3">Или откройте пример разбора:</p>
          <div className="flex flex-col gap-2">
            {Object.values(ESTIMATE_SAMPLES).map((item) => (
              <Button
                key={item.key}
                variant="outline"
                className="justify-start"
                onClick={() => {
                  setFileName(null);
                  setSample(item);
                  setUpload(false);
                }}
              >
                {item.format}
              </Button>
            ))}
          </div>
        </div>
      </Sheet>

      <Sheet
        open={manual}
        onOpenChange={setManual}
        id="estimate-manual"
        title="Ручной ввод стоимости"
        description="Для объектов без сметы: котлы и мелкие работы"
        actions={
          <>
            <Button variant="primary" size="lg" className="flex-1" onClick={() => void save()}>
              Сохранить
            </Button>
            <Button variant="outline" size="lg" onClick={() => setManual(false)}>
              Отмена
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-block">
          <div className="flex flex-col gap-1">
            <span className="text-meta text-text-2">Объект</span>
            <Button
              variant="outline"
              className={cn(
                "h-field justify-start",
                tried && !objectId && "border-danger text-danger",
              )}
              onClick={() => setPicker(true)}
            >
              <span className="truncate">
                {object ? `${object.code} · ${object.label}` : "Выберите объект"}
              </span>
            </Button>
            {tried && !objectId ? (
              <p role="alert" className="text-meta text-danger">
                Выберите объект
              </p>
            ) : null}
          </div>
          <Field
            label="Стоимость работ"
            value={amount}
            onChange={setAmount}
            inputMode="decimal"
            placeholder="14 700"
            unit="₽"
            error={amountError}
            showError={tried}
          />
          <Field
            label="Комментарий"
            value={note}
            onChange={setNote}
            placeholder="Откуда сумма: договор, прайс, согласование"
          />
          <p className="text-meta text-text-3">
            Сохранение создаёт новую версию стоимости и пишется в журнал действий.
          </p>
        </div>
      </Sheet>

      <PickerSheet
        open={picker}
        onOpenChange={setPicker}
        title="Объект"
        searchLabel="Адрес или номер"
        value={objectId}
        onPick={setObjectId}
        options={directory.objects.map((o) => ({ value: o.id, label: o.label, meta: o.code }))}
      />
    </div>
  );
}

/** Разбор сметы: формат, итоги таблицей, разделы, трудозатраты и кандидат стоимости */
function ParsedEstimate({
  sample,
  fileName,
  onManual,
  onClose,
}: {
  sample: EstimateSample;
  fileName: string | null;
  onManual: () => void;
  onClose: () => void;
}) {
  const candidate = workCostCandidate(sample);
  return (
    <section aria-labelledby="parsed-title" className="surface-1 flex flex-col gap-section p-card">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-meta text-text-3">Развитие · разбор сметы</p>
          <h2 id="parsed-title" className="text-heading">
            {sample.format}
          </h2>
          <p className="text-meta text-text-3">
            {sample.file} · {sample.vat}
          </p>
        </div>
        <Button variant="quiet" className="-me-2 px-2" onClick={onClose}>
          Закрыть
        </Button>
      </header>
      {fileName ? (
        <p className="rounded-control bg-info-bg px-3 py-2 text-meta text-info">
          В демо разбор показан на примере: файл «{fileName}» не читался.
        </p>
      ) : null}

      <div>
        <h3 className="text-meta-strong text-text-2">Распознанные итоги</h3>
        <table className="mt-1 w-full text-body">
          <tbody className="divide-y divide-line">
            {sample.totals.map((row) => (
              <tr key={row.label}>
                <th scope="row" className="py-2 pe-3 text-left font-normal text-text-2">
                  {row.label}
                </th>
                <td className="py-2 text-right tnum">
                  {row.unit === "чел.-ч"
                    ? `${row.value.toLocaleString("ru-RU", { maximumFractionDigits: 3 })} чел.-ч`
                    : fmtKopecks(row.value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="text-meta-strong text-text-2">Разделы сметы</h3>
        <ul className="mt-1 divide-y divide-line">
          {sample.sections.map((section) => (
            <li key={section} className="py-2 text-body">
              {section}
            </li>
          ))}
        </ul>
        <p className="mt-1 text-meta text-text-3">Суммы разделов появятся при разборе файла.</p>
      </div>

      {sample.laborHours !== null ? (
        <p className="text-body">
          Нормативные трудозатраты:{" "}
          <span className="tnum">
            {sample.laborHours.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} чел.-ч
          </span>{" "}
          <span className="text-meta text-text-3">· Развитие: рядом с часами бригады</span>
        </p>
      ) : null}

      <div className="rounded-card border border-line-2 p-card">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-heading">Стоимость работ для выработки</h3>
          <Chip tone="info">Требует согласования</Chip>
        </div>
        <p className="mt-1 text-title tnum" data-testid="estimate-candidate">
          {fmtKopecks(candidate)}
        </p>
        <p className="mt-1 text-meta text-text-2">
          Кандидат: всего без НДС {fmtKopecks(sample.withoutVat)} минус материалы{" "}
          {fmtKopecks(sample.materials)}. Какие строки входят, решает заказчик.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="primary"
            onClick={() =>
              notify("Подтверждение сметчиком появится после согласования правила, вопрос 3")
            }
          >
            Подтвердить сумму
          </Button>
          <Button variant="outline" onClick={onManual}>
            Ввести вручную
          </Button>
        </div>
      </div>
    </section>
  );
}
