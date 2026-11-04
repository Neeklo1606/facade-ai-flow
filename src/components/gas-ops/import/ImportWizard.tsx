/**
 * Мастер импорта Excel (ADR-061, 12; раздел 4.7, образец ПТО Онлайн), общий для сметы
 * и недельного графика. Шаги: файл → лист и строка начала → что в каких колонках (с примером
 * значения) → проверка с плашкой и предпросмотр изменений → «Всё верно, применить» с отменой.
 * Рядом «Показать файл как есть» и «Скачать шаблон (.xlsx)». Правила — в domain, здесь вид.
 * Формат распознан (`recognized`) — шаг 3 свёрнут в строку «Колонки определены автоматически
 * · Изменить» (ADR-062, F4): человек не разбирает колонки, которые на итог не влияют.
 */
import { Download, FileSpreadsheet, Table2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import {
  downloadTemplate,
  loadImportTools,
  readExcelSheets,
  type ImportCheck,
  type ImportTools,
  type SheetGrid,
} from "@/api/gas-estimates";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/kit/sheet";
import { toast } from "@/lib/toast";

export interface WizardField {
  key: string;
  label: string;
  required: boolean;
}

export interface WizardState {
  tools: ImportTools;
  sheets: SheetGrid[];
  sheetIndex: number;
  /** Строка заголовка или начала таблицы, с нуля */
  headerRow: number;
  map: Record<string, number | null>;
  fileName: string;
}

export interface WizardResult {
  check: ImportCheck;
  preview: ReactNode;
  canApply: boolean;
}

const CHECK_CLASS: Record<ImportCheck["level"], string> = {
  ok: "bg-mint-soft text-mint",
  warn: "bg-warn-bg text-warn",
  error: "bg-danger-bg text-danger",
};

export function ImportWizard({
  open,
  onOpenChange,
  id,
  title,
  description,
  fileTestId,
  fields,
  template,
  defaultSheet,
  detect,
  evaluate,
  options,
  recognized,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  id: string;
  title: string;
  description: string;
  fileTestId: string;
  fields: WizardField[];
  template: { fileName: string; rows: (string | number | null)[][] };
  /** Лист по умолчанию: первый непустой или лучший по разбору */
  defaultSheet?: (tools: ImportTools, sheets: SheetGrid[]) => number;
  /** Угадать строку заголовка и колонки на листе */
  detect: (
    tools: ImportTools,
    grid: SheetGrid["grid"],
  ) => {
    headerRow: number;
    map: Record<string, number | null>;
  };
  evaluate: (state: WizardState) => WizardResult;
  /** Настройки вида «цены с НДС / без», если нужны */
  options?: ReactNode;
  /** Формат файла узнан: шаг колонок свёрнут, пока человек не нажмёт «Изменить» */
  recognized?: (state: WizardState) => boolean;
  /** Применить; true — мастер закрывается */
  onApply: (state: WizardState) => Promise<boolean>;
}) {
  const [state, setState] = useState<WizardState | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);

  // Закрыли мастер — следующее открытие начинается с выбора файла
  useEffect(() => {
    if (!open) {
      setState(null);
      setError(null);
      setRaw(false);
      setColumnsOpen(false);
    }
  }, [open]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setReading(true);
    const [result, tools] = await Promise.all([readExcelSheets(file), loadImportTools()]);
    setReading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    const sheetIndex = defaultSheet
      ? defaultSheet(tools, result.sheets)
      : tools.firstFilledSheet(result.sheets);
    const grid = result.sheets[sheetIndex]?.grid ?? [];
    setColumnsOpen(false);
    setState({
      tools,
      sheets: result.sheets,
      sheetIndex,
      fileName: file.name,
      ...detect(tools, grid),
    });
  };

  const chooseSheet = (index: number) => {
    if (!state) return;
    const grid = state.sheets[index]?.grid ?? [];
    setState({ ...state, sheetIndex: index, ...detect(state.tools, grid) });
  };

  const grid = state ? (state.sheets[state.sheetIndex]?.grid ?? []) : [];
  const columns = state ? state.tools.columnsOf(grid, state.headerRow) : [];
  const result = state ? evaluate(state) : null;
  const collapsed = !!state && !columnsOpen && !!recognized?.(state);

  const apply = async () => {
    if (!state || !result?.canApply) return;
    setBusy(true);
    const closed = await onApply(state);
    setBusy(false);
    if (closed) onOpenChange(false);
  };

  const templateButton = (
    <Button
      variant="quiet"
      onClick={async () => {
        const done = await downloadTemplate(template.rows, template.fileName);
        if (!done.ok) toast.error(done.message);
      }}
    >
      <Download aria-hidden />
      Скачать шаблон (.xlsx)
    </Button>
  );

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      id={id}
      title={title}
      description={description}
      size="full"
      actions={
        state ? (
          <Button
            variant="primary"
            size="field"
            className="flex-1"
            disabled={!result?.canApply || busy}
            onClick={() => void apply()}
          >
            Всё верно, применить
          </Button>
        ) : undefined
      }
    >
      <ol className="flex flex-col gap-section" aria-label="Шаги импорта">
        <li>
          <h3 className="text-meta-strong text-text-2">1. Файл</h3>
          {state ? (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-body">
              <FileSpreadsheet className="size-5 text-text-3" aria-hidden />
              <span className="min-w-0 truncate">{state.fileName}</span>
              <Button variant="quiet" onClick={() => setState(null)}>
                Выбрать другой
              </Button>
            </p>
          ) : (
            <label
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                void pick(event.dataTransfer.files[0]);
              }}
              className="mt-2 flex min-h-30 cursor-pointer flex-col items-center justify-center gap-2 rounded-card border border-dashed border-field-line p-card text-center focus-within:ring-2 focus-within:ring-accent-text"
            >
              <FileSpreadsheet className="size-8 text-text-3" aria-hidden />
              <span className="text-body">
                {reading ? "Читаю файл в браузере" : "Выберите файл Excel (.xlsx или .xls)"}
              </span>
              <span className="hidden text-meta text-text-3 md:block">
                или перетащите его сюда. Файл не уходит на сервер
              </span>
              <input
                type="file"
                accept=".xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                data-testid={fileTestId}
                onChange={(event) => void pick(event.target.files?.[0])}
              />
            </label>
          )}
          <div className="mt-1">{templateButton}</div>
          {error ? (
            <p
              role="alert"
              className="mt-2 rounded-control bg-danger-bg px-3 py-2 text-meta text-danger"
            >
              {error}
            </p>
          ) : null}
        </li>

        {state ? (
          <>
            <li>
              <h3 className="text-meta-strong text-text-2">2. Лист и строка начала</h3>
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-meta text-text-2">
                  Лист
                  <select
                    value={state.sheetIndex}
                    onChange={(event) => chooseSheet(Number(event.target.value))}
                    className="mt-1 h-btn w-full rounded-control border border-field-line bg-panel-2 px-3 text-body text-ink focus-ring"
                  >
                    {state.sheets.map((sheet, index) => (
                      <option key={sheet.name} value={index}>
                        {sheet.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-meta text-text-2">
                  Строка заголовка
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, grid.length)}
                    value={state.headerRow + 1}
                    onChange={(event) =>
                      setState({
                        ...state,
                        headerRow: Math.max(
                          0,
                          Math.min(grid.length - 1, Number(event.target.value) - 1),
                        ),
                      })
                    }
                    className="mt-1 h-btn w-full rounded-control border border-field-line bg-panel-2 px-3 text-body text-ink tnum focus-ring"
                  />
                </label>
              </div>
              <Button
                variant="quiet"
                className="mt-1"
                aria-expanded={raw}
                onClick={() => setRaw(!raw)}
              >
                <Table2 aria-hidden />
                {raw ? "Скрыть файл" : "Показать файл как есть"}
              </Button>
              {raw ? (
                <div className="mt-2 max-h-80 overflow-auto rounded-control border border-line">
                  <table className="text-meta tnum" aria-label="Файл как есть">
                    <tbody>
                      {state.tools.rawPreview(grid, 40, 12).map((line) => (
                        <tr
                          key={line.row}
                          className={line.row === state.headerRow + 1 ? "bg-orange-dim" : undefined}
                        >
                          <th
                            scope="row"
                            className="sticky left-0 bg-surface-2 px-2 text-right font-normal text-text-3"
                          >
                            {line.row}
                          </th>
                          {line.cells.map((cell, c) => (
                            <td
                              key={c}
                              className="max-w-[160px] truncate border-s border-line px-2"
                              title={cell}
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </li>

            <li>
              <h3 className="text-meta-strong text-text-2">3. Что в каких колонках</h3>
              {collapsed ? (
                <p
                  className="mt-1 flex flex-wrap items-center gap-x-1 text-body text-text-2"
                  data-testid="columns-auto"
                >
                  Колонки определены автоматически ·
                  <Button variant="quiet" onClick={() => setColumnsOpen(true)}>
                    Изменить
                  </Button>
                </p>
              ) : null}
              <ul
                className={collapsed ? "hidden" : "mt-2 flex flex-col gap-2"}
                aria-label="Колонки"
              >
                {fields.map((field) => {
                  const chosen = columns.find((c) => c.index === state.map[field.key]);
                  return (
                    <li key={field.key}>
                      <label className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <span className="text-body">
                          {field.label}
                          {field.required ? null : (
                            <span className="text-meta text-text-3"> · если есть</span>
                          )}
                        </span>
                        <select
                          value={state.map[field.key] ?? ""}
                          onChange={(event) =>
                            setState({
                              ...state,
                              map: {
                                ...state.map,
                                [field.key]:
                                  event.target.value === "" ? null : Number(event.target.value),
                              },
                            })
                          }
                          className="h-btn max-w-[60%] rounded-control border border-field-line bg-panel-2 px-3 text-body text-ink focus-ring"
                        >
                          <option value="">Нет колонки</option>
                          {columns.map((c) => (
                            <option key={c.index} value={c.index}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p className="text-meta text-text-3" data-testid={`sample-${field.key}`}>
                        {chosen ? `Пример: ${chosen.sample ?? "пусто"}` : "Колонка не выбрана"}
                      </p>
                    </li>
                  );
                })}
              </ul>
              {options ? <div className="mt-3">{options}</div> : null}
            </li>

            <li>
              <h3 className="text-meta-strong text-text-2">4. Проверка и что изменится</h3>
              {result ? (
                <>
                  <div
                    role="status"
                    data-testid="import-check"
                    data-level={result.check.level}
                    className={`mt-2 rounded-control px-3 py-2 text-meta ${CHECK_CLASS[result.check.level]}`}
                  >
                    <p className="text-meta-strong">{result.check.title}</p>
                    {result.check.details.length ? (
                      <ul className="mt-1 list-disc ps-4">
                        {result.check.details.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <div className="mt-3" data-testid="import-preview">
                    {result.preview}
                  </div>
                </>
              ) : null}
            </li>
          </>
        ) : null}
      </ol>
    </Sheet>
  );
}
