/**
 * «Сверить с файлом» (план 20.11, этап 2; идея из разбора ПТО Онлайн): слева то, что система
 * вытащила из сметы, справа лист файла как в Excel. Нажатие на значение прокручивает лист к его
 * строке и подсвечивает её. На телефоне — две вкладки «Разбор» и «Файл».
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { loadFileSheet, type Cell, type FileRow } from "@/api/gas-estimate-intake";
import { AdaptiveSheet } from "@/components/gas-ops/AdaptiveSheet";
import { cn } from "@/lib/utils";

export interface CompareItem {
  label: string;
  value: string;
  row: number | null;
}

const text = (cell: Cell): string =>
  cell === null || cell === undefined
    ? ""
    : typeof cell === "number"
      ? cell.toLocaleString("ru-RU", { maximumFractionDigits: 2 })
      : String(cell);

export function FileCompare({
  file,
  sheet,
  items,
  open,
  onOpenChange,
}: {
  file: FileRow["file"];
  sheet: string | null;
  items: CompareItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "error"; message: string } | { kind: "ok"; grid: Cell[][] }
  >({ kind: "loading" });
  const [row, setRow] = useState<number | null>(null);
  const [tab, setTab] = useState<"parsed" | "file">("parsed");
  const rows = useRef(new Map<number, HTMLTableRowElement>());

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setState({ kind: "loading" });
    void loadFileSheet(file, sheet).then((result) => {
      if (!alive) return;
      setState(
        result.ok ? { kind: "ok", grid: result.grid } : { kind: "error", message: result.message },
      );
    });
    return () => {
      alive = false;
    };
  }, [open, file, sheet]);

  // Колонки: только те, где есть хоть одно значение, и не больше 12 — лист читается глазом
  const columns = useMemo(() => {
    if (state.kind !== "ok") return [];
    const width = Math.max(0, ...state.grid.map((r) => r.length));
    const used: number[] = [];
    for (let c = 0; c < width && used.length < 12; c++)
      if (state.grid.some((r) => text(r[c] ?? null).trim() !== "")) used.push(c);
    return used;
  }, [state]);

  const pick = (target: number | null) => {
    if (target === null) return;
    setRow(target);
    setTab("file");
    requestAnimationFrame(() =>
      rows.current.get(target)?.scrollIntoView({ block: "center", behavior: "smooth" }),
    );
  };

  return (
    <AdaptiveSheet
      open={open}
      onOpenChange={onOpenChange}
      id="file-compare"
      title="Сверить с файлом"
      description={`${file.name}${sheet ? ` · лист «${sheet}»` : ""}`}
    >
      <div
        role="tablist"
        aria-label="Сверка"
        className="mb-3 flex gap-1 rounded-pill bg-panel-3 p-1 lg:hidden"
      >
        {(["parsed", "file"] as const).map((key) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "min-h-11 flex-1 rounded-pill text-body focus-ring",
              tab === key ? "bg-surface font-medium" : "text-text-2",
            )}
          >
            {key === "parsed" ? "Разбор" : "Файл"}
          </button>
        ))}
      </div>
      <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <ul className={cn("flex flex-col gap-1", tab === "file" && "max-lg:hidden")}>
          {items.map((item, i) => (
            <li key={`${item.label}-${i}`}>
              <button
                type="button"
                disabled={item.row === null}
                onClick={() => pick(item.row)}
                aria-pressed={row !== null && row === item.row}
                className={cn(
                  "flex min-h-12 w-full items-center justify-between gap-3 rounded-control px-3 py-2 text-left focus-ring",
                  row !== null && row === item.row ? "bg-flame-soft" : "is-hover:bg-surface-2",
                  item.row === null && "opacity-60",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-body">{item.label}</span>
                  <span className="block text-meta text-text-2">
                    {item.row === null ? "нет в файле" : `строка ${item.row}`}
                  </span>
                </span>
                <span className="shrink-0 text-body-strong tnum">{item.value}</span>
              </button>
            </li>
          ))}
        </ul>
        <div
          className={cn(
            "min-w-0 overflow-auto rounded-card border border-line",
            tab === "parsed" && "max-lg:hidden",
          )}
          style={{ maxHeight: "70vh" }}
          tabIndex={0}
          role="region"
          aria-label="Лист файла"
        >
          {state.kind === "loading" ? (
            <p role="status" className="p-4 text-body text-text-2">
              Открываю файл…
            </p>
          ) : state.kind === "error" ? (
            <p role="alert" className="p-4 text-body text-text-2">
              {state.message}
            </p>
          ) : (
            <table className="w-full border-collapse text-meta tnum">
              <tbody>
                {state.grid.map((cells, index) => {
                  const n = index + 1;
                  return (
                    <tr
                      key={n}
                      ref={(node) => {
                        if (node) rows.current.set(n, node);
                        else rows.current.delete(n);
                      }}
                      data-row={n}
                      className={cn(row === n && "bg-flame-soft")}
                    >
                      <th
                        scope="row"
                        className="sticky left-0 w-10 border-e border-b border-line bg-surface-2 px-2 py-1 text-right font-normal text-text-3"
                      >
                        {n}
                      </th>
                      {columns.map((c) => (
                        <td
                          key={c}
                          className="max-w-64 truncate border-b border-line px-2 py-1"
                          title={text(cells[c] ?? null)}
                        >
                          {text(cells[c] ?? null)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdaptiveSheet>
  );
}
