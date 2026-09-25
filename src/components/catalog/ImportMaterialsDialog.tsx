import { useRef, useState } from "react";
import { FileUp, Upload } from "lucide-react";
import { readXlsx } from "@/lib/xlsx-read";
import { useImportMaterials } from "@/api/mutations";
import type { ImportReport } from "@/api/types";
import { fmtNum } from "@/lib/format";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Загрузка номенклатуры из Excel (ADR-023, п. 3). Три шага: файл, сопоставление колонок,
 * предпросмотр. Угадывать колонки молча нельзя — в выгрузке из 1С «Наименование» бывает
 * артикулом, и человек должен это увидеть до загрузки, а не после.
 */

/** Столько строк принимает порт за один вызов (`importMaterialsInput`) */
const LIMIT = 5000;

type Field = "name" | "unit" | "category" | "characteristics" | "skip";

const FIELD_LABEL: Record<Field, string> = {
  name: "Наименование",
  unit: "Единица",
  category: "Категория",
  characteristics: "Характеристики",
  skip: "не загружать",
};

/** Догадка по заголовку: человек её поправит, но чаще всего она верна */
function guess(header: string): Field {
  const text = header.toLowerCase();
  if (/наимен|назван|материал|номенклат/.test(text)) return "name";
  if (/ед|изм|unit/.test(text)) return "unit";
  if (/катег|раздел|групп/.test(text)) return "category";
  if (/характер|свойств|параметр/.test(text)) return "characteristics";
  return "skip";
}

export function ImportMaterialsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const load = useImportMaterials({ onFailed: (error) => toast.error(error.message) });
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<string[][]>([]);
  const [total, setTotal] = useState(0);
  const [mapping, setMapping] = useState<Field[]>([]);
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

  const accept = async (file: File | undefined) => {
    if (!file) return;
    setFailure(null);
    try {
      const read = await readXlsx(await file.arrayBuffer());
      if (!read.rows.length) throw new Error("В файле нет строк");
      // Предел загрузки — 5000 строк за раз (порт). Сказать это здесь дешевле, чем показать
      // человеку отказ проверки схемы после того, как он прошёл весь мастер
      if (read.total - 1 > LIMIT) {
        throw new Error(
          `В файле ${fmtNum(read.total - 1)} строк, за один раз загружается ${fmtNum(LIMIT)}. ` +
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

  const nameAt = mapping.indexOf("name");
  const unitAt = mapping.indexOf("unit");
  const categoryAt = mapping.indexOf("category");
  const charsAt = mapping.indexOf("characteristics");
  const ready = nameAt >= 0 && unitAt >= 0 && categoryAt >= 0;

  const preview = rows.slice(1, 6).map((row) => ({
    name: row[nameAt] ?? "",
    unit: row[unitAt] ?? "",
    category: row[categoryAt] ?? "",
  }));

  const submit = () => {
    const payload = rows.slice(1).map((row) => ({
      name: row[nameAt] ?? "",
      unit: row[unitAt] ?? "",
      category: row[categoryAt] ?? "",
      ...(charsAt >= 0 ? { characteristics: row[charsAt] ?? "" } : {}),
    }));
    load.mutate(
      { rows: payload },
      {
        onSuccess: (result) => {
          setReport(result);
          toast.success(
            `Загружено: добавлено ${fmtNum(result.added)}, обновлено ${fmtNum(result.updated)}`,
            result.refused.length
              ? { description: `Не принято строк: ${fmtNum(result.refused.length)} — они ниже` }
              : undefined,
          );
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Загрузить номенклатуру из Excel</DialogTitle>
          <DialogDescription>
            Первая строка файла — заголовки. Загрузка добавляет новое и обновляет известное по паре
            «наименование и единица»; ничего не удаляет.
          </DialogDescription>
        </DialogHeader>

        {!fileName && (
          <div className="grid gap-3">
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="focus-ring flex items-center gap-3 rounded-[var(--r-md)] border border-dashed border-line p-5 text-left transition-fast is-hover:border-line-2"
            >
              <FileUp className="size-5 text-text-3" strokeWidth={1.5} aria-hidden />
              <span>
                <span className="block text-[14px] font-medium">Выберите файл .xlsx</span>
                <span className="block text-caption text-text-muted">
                  Выгрузка из 1С или Excel: наименование, единица, категория
                </span>
              </span>
            </button>
            <input
              ref={input}
              type="file"
              accept=".xlsx"
              aria-label="Файл .xlsx с номенклатурой"
              className="sr-only"
              onChange={(event) => void accept(event.target.files?.[0])}
            />
            {failure && (
              <p className="text-[13px] text-danger" role="alert">
                {failure}
              </p>
            )}
          </div>
        )}

        {fileName && !report && (
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
                      value={mapping[index] ?? "skip"}
                      onChange={(event) =>
                        setMapping((prev) =>
                          prev.map((item, i) =>
                            i === index ? (event.target.value as Field) : item,
                          ),
                        )
                      }
                      aria-label={`Колонка «${header || index + 1}»`}
                      className="focus-ring h-9 w-[200px] rounded-[var(--r-sm)] border border-line bg-surface-2 px-2 text-[13px]"
                    >
                      {(Object.keys(FIELD_LABEL) as Field[]).map((field) => (
                        <option key={field} value={field}>
                          {FIELD_LABEL[field]}
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
                      <th className="py-1.5 text-left font-normal">Наименование</th>
                      <th className="py-1.5 text-left font-normal">Ед.</th>
                      <th className="py-1.5 text-left font-normal">Категория</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, index) => (
                      <tr key={index} className="border-b border-line last:border-0">
                        <td className="py-1.5">{row.name || "—"}</td>
                        <td className="py-1.5">{row.unit || "—"}</td>
                        <td className="py-1.5">{row.category || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-[13px] text-text-3">
                Укажите, где наименование, единица и категория: без них строку загрузить не во что.
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={reset}>
                Другой файл
              </Button>
              <Button onClick={submit} loading={load.isPending} disabled={!ready}>
                <Upload className="size-4" /> Загрузить {fmtNum(Math.max(total - 1, 0))}
              </Button>
            </div>
          </div>
        )}

        {report && (
          <div className="grid gap-3">
            <p className="text-[14px]">
              Добавлено <span className="tnum font-semibold">{fmtNum(report.added)}</span>,
              обновлено <span className="tnum font-semibold">{fmtNum(report.updated)}</span>.
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
                  Поправьте их в файле и загрузите его снова: уже загруженное обновится, а не
                  задвоится.
                </p>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={reset}>
                Загрузить ещё файл
              </Button>
              <Button onClick={() => onOpenChange(false)}>Готово</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
