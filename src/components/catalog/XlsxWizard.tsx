import { useRef, useState } from "react";
import { FileUp, Upload } from "lucide-react";
import { readXlsx } from "@/lib/xlsx-read";
import type { ImportReport } from "@/api/types";
import { fmtNum } from "@/lib/format";
import { Button } from "@/components/ui/button";

/**
 * Загрузка таблицы из .xlsx: файл, сопоставление колонок, предпросмотр, отчёт (ADR-023, п. 3).
 * Один мастер на все загрузки: номенклатура и спецификация отличаются только набором полей,
 * а поведение — угадывание по заголовкам, предпросмотр, номера непринятых строк — одно.
 */

export interface WizardField {
  id: string;
  label: string;
  /** Без этих полей строку загружать не во что */
  required?: boolean;
  /** Догадка по заголовку файла: человек её поправит, но чаще всего она верна */
  guess?: RegExp;
}

const SKIP = "skip";

export function XlsxWizard({
  fields,
  limit,
  hint,
  submitting,
  onSubmit,
  onClose,
}: {
  fields: WizardField[];
  /** Сколько строк принимает порт за один вызов */
  limit: number;
  /** Что за файл ждём: показывается на первом шаге */
  hint: string;
  submitting: boolean;
  onSubmit: (rows: Record<string, string>[]) => Promise<ImportReport | null>;
  onClose: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<string[][]>([]);
  const [total, setTotal] = useState(0);
  const [mapping, setMapping] = useState<string[]>([]);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const reset = () => {
    setFileName(null);
    setRows([]);
    setTotal(0);
    setMapping([]);
    setReport(null);
    setFailure(null);
  };

  const guess = (header: string) => {
    const text = header.toLowerCase();
    return fields.find((field) => field.guess?.test(text))?.id ?? SKIP;
  };

  const accept = async (file: File | undefined) => {
    if (!file) return;
    setFailure(null);
    try {
      const read = await readXlsx(await file.arrayBuffer());
      if (!read.rows.length) throw new Error("В файле нет строк");
      // Предел загрузки сказать здесь дешевле, чем показать отказ проверки после всего мастера
      if (read.total - 1 > limit) {
        throw new Error(
          `В файле ${fmtNum(read.total - 1)} строк, за один раз загружается ${fmtNum(limit)}. ` +
            "Разделите выгрузку на части — загрузки складываются, повторы обновляются.",
        );
      }
      setFileName(file.name);
      setRows(read.rows);
      setTotal(read.total);
      setMapping((read.rows[0] ?? []).map(guess));
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Файл не прочитался");
    }
  };

  const columnOf = (id: string) => mapping.indexOf(id);
  const ready = fields.every((field) => !field.required || columnOf(field.id) >= 0);
  const value = (row: string[], id: string) => {
    const at = columnOf(id);
    return at >= 0 ? (row[at] ?? "") : "";
  };
  const shown = fields.filter((field) => field.required);
  const preview = rows.slice(1, 6);

  const submit = async () => {
    const payload = rows.slice(1).map((row) => {
      const item: Record<string, string> = {};
      for (const field of fields) {
        const at = columnOf(field.id);
        if (at >= 0) item[field.id] = row[at] ?? "";
      }
      return item;
    });
    const result = await onSubmit(payload);
    if (result) setReport(result);
  };

  if (report) {
    return (
      <div className="grid gap-3">
        <p className="text-[14px]">
          Добавлено <span className="tnum font-semibold">{fmtNum(report.added)}</span>
          {report.updated > 0 && (
            <>
              , обновлено <span className="tnum font-semibold">{fmtNum(report.updated)}</span>
            </>
          )}
          .
        </p>
        {report.refused.length > 0 && (
          <div className="grid gap-1.5">
            <span className="text-[13px] font-medium">
              Не принято строк: {fmtNum(report.refused.length)}
            </span>
            <ul className="grid max-h-48 gap-1 overflow-y-auto text-[13px] text-text-2">
              {report.refused.map((item) => (
                <li key={item.row}>
                  строка {item.row} — {item.reason}
                </li>
              ))}
            </ul>
            <p className="text-caption text-text-muted">
              Поправьте их в файле и загрузите его снова: уже загруженное обновится, а не задвоится.
            </p>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={reset}>
            Загрузить ещё файл
          </Button>
          <Button onClick={onClose}>Готово</Button>
        </div>
      </div>
    );
  }

  if (!fileName) {
    return (
      <div className="grid gap-3">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="focus-ring flex items-center gap-3 rounded-[var(--r-md)] border border-dashed border-line p-5 text-left transition-fast is-hover:border-line-2"
        >
          <FileUp className="size-5 text-text-3" strokeWidth={1.5} aria-hidden />
          <span>
            <span className="block text-[14px] font-medium">Выберите файл .xlsx</span>
            <span className="block text-caption text-text-muted">{hint}</span>
          </span>
        </button>
        <input
          ref={input}
          type="file"
          accept=".xlsx"
          aria-label="Файл .xlsx"
          className="sr-only"
          onChange={(event) => void accept(event.target.files?.[0])}
        />
        {failure && (
          <p className="text-[13px] text-danger" role="alert">
            {failure}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <p className="text-[13px] text-text-2">
        {fileName} · строк в файле: <span className="tnum">{fmtNum(total - 1)}</span>
      </p>

      <div className="grid gap-2">
        <span className="text-[13px] font-medium">Какая колонка чем является</span>
        <div className="grid gap-1.5">
          {(rows[0] ?? []).map((header, index) => (
            <label key={index} className="flex items-center gap-2 text-[13px]">
              <span className="min-w-0 flex-1 truncate text-text-2">
                {header || `Колонка ${index + 1}`}
              </span>
              <select
                value={mapping[index] ?? SKIP}
                onChange={(event) =>
                  setMapping((prev) =>
                    prev.map((item, i) => (i === index ? event.target.value : item)),
                  )
                }
                aria-label={`Колонка «${header || index + 1}»`}
                className="focus-ring h-9 w-[200px] rounded-[var(--r-sm)] border border-line bg-surface-2 px-2 text-[13px]"
              >
                {[...fields, { id: SKIP, label: "не загружать" }].map((field) => (
                  <option key={field.id} value={field.id}>
                    {field.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>

      {ready ? (
        <div className="grid gap-2">
          <span className="text-[13px] font-medium">Так это будет загружено</span>
          <table className="w-full text-[13px]">
            <thead className="text-caption text-text-muted">
              <tr className="border-b border-line">
                {shown.map((field) => (
                  <th key={field.id} className="py-1.5 text-left font-normal">
                    {field.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, index) => (
                <tr key={index} className="border-b border-line last:border-0">
                  {shown.map((field) => (
                    <td key={field.id} className="py-1.5">
                      {value(row, field.id) || "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-[13px] text-text-3">
          Укажите обязательные колонки: {shown.map((field) => field.label.toLowerCase()).join(", ")}
          . Без них строку загрузить не во что.
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={reset}>
          Другой файл
        </Button>
        <Button onClick={() => void submit()} loading={submitting} disabled={!ready}>
          <Upload className="size-4" /> Загрузить {fmtNum(Math.max(total - 1, 0))}
        </Button>
      </div>
    </div>
  );
}
