import { useState } from "react";
import { CalendarRange, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/kit/sheet";
import { notify } from "@/components/ui/kit/toast";
import {
  REQUIRED_FIELDS,
  SCHEDULE_FIELD_LABEL,
  loadScheduleTools,
  readScheduleFile,
  useGasEstimateActions,
  useGasSchedule,
  type ColumnMap,
  type Grid,
  type ScheduleField,
  type ScheduleTools,
} from "@/api/gas-estimates";
import { toast } from "@/lib/toast";

/**
 * Импорт недельного графика объектов (ADR-053, 4). График заказчика меняется почти каждый
 * день: человек выбирает файл, один раз сопоставляет колонки (выбор запоминается в браузере),
 * смотрит «добавится / изменится / уйдёт» и применяет одной кнопкой с отменой 6 секунд.
 */
const MAP_KEY = "neeklo-gas-schedule-columns";
const FIELDS: ScheduleField[] = ["object", "code", "brigade", "day"];

function headerText(grid: Grid, row: number, col: number | null): string | null {
  if (col === null) return null;
  const v = grid[row]?.[col];
  return typeof v === "string" || typeof v === "number" ? String(v).trim() : null;
}

/** Запомненное сопоставление хранится подписями колонок, а не номерами: порядок в файле плавает */
function rememberedMap(grid: Grid, row: number): ColumnMap | null {
  try {
    const saved = JSON.parse(localStorage.getItem(MAP_KEY) ?? "null") as Record<
      ScheduleField,
      string | null
    > | null;
    if (!saved) return null;
    const header = (grid[row] ?? []).map((c) =>
      c === null || c === undefined ? "" : String(c).trim(),
    );
    const map = {} as ColumnMap;
    for (const field of FIELDS) {
      const at = saved[field] ? header.indexOf(saved[field]!) : -1;
      map[field] = at >= 0 ? at : null;
    }
    return REQUIRED_FIELDS.every((f) => map[f] !== null) ? map : null;
  } catch {
    return null;
  }
}

function remember(grid: Grid, row: number, map: ColumnMap) {
  try {
    const saved = Object.fromEntries(FIELDS.map((f) => [f, headerText(grid, row, map[f])]));
    localStorage.setItem(MAP_KEY, JSON.stringify(saved));
  } catch {
    // без хранилища сопоставление просто спросится снова
  }
}

export function ScheduleImport() {
  const { schedule } = useGasSchedule();
  const actions = useGasEstimateActions();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<{ name: string; grid: Grid; headerRow: number } | null>(null);
  const [map, setMap] = useState<ColumnMap>({ object: null, code: null, brigade: null, day: null });
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [tools, setTools] = useState<ScheduleTools | null>(null);

  const pick = async (picked: File | undefined) => {
    if (!picked) return;
    setError(null);
    setReading(true);
    const [result, loaded] = await Promise.all([readScheduleFile(picked), loadScheduleTools()]);
    setTools(loaded);
    setReading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    const guess = loaded.guessHeader(result.grid);
    const headerRow = guess?.row ?? 0;
    setFile({ name: picked.name, grid: result.grid, headerRow });
    setMap(
      rememberedMap(result.grid, headerRow) ??
        guess?.map ?? { object: null, code: null, brigade: null, day: null },
    );
  };

  const parsed = file && tools ? tools.readSchedule(file.grid, file.headerRow, map) : null;
  const diff = parsed && tools ? tools.diffSchedule(schedule?.rows ?? [], parsed.rows) : null;
  const columns = file
    ? (file.grid[file.headerRow] ?? []).map((c, i) => ({
        index: i,
        label:
          c === null || c === undefined || String(c).trim() === ""
            ? `Колонка ${i + 1}`
            : String(c).trim(),
      }))
    : [];

  const apply = async () => {
    if (!file || !parsed || parsed.rows.length === 0) return;
    remember(file.grid, file.headerRow, map);
    const result = await actions.applySchedule({ rows: parsed.rows, fileName: file.name });
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    const previous = result.value;
    setOpen(false);
    setFile(null);
    notify(`График применён: строк ${parsed.rows.length}`, {
      undo: () => void actions.restoreSchedule(previous),
    });
  };

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <CalendarRange aria-hidden />
        Загрузить график недели
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        id="schedule-import"
        title="График объектов на неделю"
        description="Excel-файл заказчика: объект, бригада и день"
        actions={
          file ? (
            <Button
              variant="primary"
              className="flex-1"
              size="field"
              disabled={!parsed || parsed.rows.length === 0}
              onClick={() => void apply()}
            >
              Применить
            </Button>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-block">
          {!file ? (
            <label className="flex min-h-30 cursor-pointer flex-col items-center justify-center gap-2 rounded-card border border-dashed border-field-line p-card text-center focus-within:ring-2 focus-within:ring-accent-text">
              <FileSpreadsheet className="size-8 text-text-3" aria-hidden />
              <span className="text-body">
                {reading ? "Читаю файл в браузере" : "Выберите файл графика"}
              </span>
              <input
                type="file"
                accept=".xlsx,.xls"
                className="sr-only"
                data-testid="schedule-file"
                onChange={(event) => void pick(event.target.files?.[0])}
              />
            </label>
          ) : (
            <>
              <section aria-labelledby="schedule-columns" className="flex flex-col gap-2">
                <h3 id="schedule-columns" className="text-meta-strong text-text-2">
                  Какая колонка что значит
                </h3>
                {FIELDS.map((field) => (
                  <label key={field} className="flex items-center justify-between gap-3">
                    <span className="text-body">
                      {SCHEDULE_FIELD_LABEL[field]}
                      {REQUIRED_FIELDS.includes(field) ? null : (
                        <span className="text-meta text-text-3"> · если есть</span>
                      )}
                    </span>
                    <select
                      value={map[field] ?? ""}
                      onChange={(event) =>
                        setMap((m) => ({
                          ...m,
                          [field]: event.target.value === "" ? null : Number(event.target.value),
                        }))
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
                ))}
              </section>

              {diff && parsed ? (
                <section aria-labelledby="schedule-preview" className="flex flex-col gap-2">
                  <h3 id="schedule-preview" className="text-meta-strong text-text-2">
                    Что изменится
                  </h3>
                  <ul className="grid grid-cols-3 gap-2 text-center">
                    {(
                      [
                        ["Добавится", diff.added.length],
                        ["Изменится", diff.changed.length],
                        ["Уйдёт", diff.removed.length],
                      ] as const
                    ).map(([label, n]) => (
                      <li key={label} className="rounded-control bg-panel-2 p-2">
                        <span className="block text-title tnum">{n}</span>
                        <span className="block text-meta text-text-3">{label}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-meta text-text-3">
                    Без изменений: {diff.unchanged}. Строк в файле: {parsed.rows.length}.
                  </p>
                  {diff.changed.slice(0, 3).map((c) => (
                    <p key={c.to.key} className="text-meta text-text-2">
                      {c.to.objectLabel}, {c.to.day.slice(8, 10)}.{c.to.day.slice(5, 7)}:{" "}
                      {c.from.brigade} → {c.to.brigade}
                    </p>
                  ))}
                  {parsed.skipped.length > 0 ? (
                    <ul className="flex flex-col gap-1">
                      {parsed.skipped.slice(0, 5).map((s) => (
                        <li
                          key={s.row}
                          className="rounded-control bg-warn-bg px-3 py-2 text-meta text-warn"
                        >
                          Строка {s.row}: {s.reason}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              ) : null}
              <Button variant="quiet" size="sm" onClick={() => setFile(null)}>
                Выбрать другой файл
              </Button>
            </>
          )}
          {error ? (
            <p
              role="alert"
              className="rounded-control bg-danger-bg px-3 py-2 text-meta text-danger"
            >
              {error}
            </p>
          ) : null}
          {schedule ? (
            <p className="text-meta text-text-3">
              Сейчас действует график от {schedule.appliedAt.replace("T", " ").slice(5, 16)}, строк{" "}
              {schedule.rows.length}.
            </p>
          ) : (
            <p className="text-meta text-text-3">
              График ещё не загружали: бот берёт назначения демо.
            </p>
          )}
        </div>
      </Sheet>
    </>
  );
}
