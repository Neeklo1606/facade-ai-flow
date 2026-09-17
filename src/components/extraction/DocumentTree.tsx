import { memo, useState } from "react";
import { ChevronRight, FileText } from "lucide-react";
import { fmtNum } from "@/lib/format";
import { cn } from "@/lib/utils";
import { type DocumentSheet } from "@/contracts";

export interface SheetCounts {
  total: number;
  /** Позиции «Требует внимания» и «Не удалось определить», ещё не разобранные */
  attention: number;
}

/** Структура документа: разделы спецификации и листы с числом найденных позиций. */
export const DocumentTree = memo(function DocumentTree({
  sheets,
  counts,
  currentSheetId,
  onSelectSheet,
}: {
  sheets: DocumentSheet[];
  counts: Map<string, SheetCounts>;
  currentSheetId: string | null;
  onSelectSheet: (sheetId: string) => void;
}) {
  const groups = sheets.reduce<{ title: string; sheets: DocumentSheet[] }[]>((acc, sheet) => {
    const last = acc.at(-1);
    if (last && last.title === sheet.group) last.sheets.push(sheet);
    else acc.push({ title: sheet.group, sheets: [sheet] });
    return acc;
  }, []);
  const [collapsed, setCollapsed] = useState<string[]>([]);

  return (
    <nav aria-label="Структура документа" className="py-2">
      {groups.map((group) => {
        const open = !collapsed.includes(group.title);
        const groupTotal = group.sheets.reduce(
          (acc, sheet) => acc + (counts.get(sheet.id)?.total ?? 0),
          0,
        );
        return (
          <div key={group.title} className="mb-1">
            <button
              type="button"
              aria-expanded={open}
              onClick={() =>
                setCollapsed((prev) =>
                  prev.includes(group.title)
                    ? prev.filter((t) => t !== group.title)
                    : [...prev, group.title],
                )
              }
              className="focus-ring flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[12px] font-semibold text-text-secondary transition-fast hover:text-text-primary"
            >
              <ChevronRight
                className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")}
              />
              <span className="min-w-0 flex-1 truncate">{group.title}</span>
              {groupTotal > 0 && (
                <span className="tnum text-[11px] font-normal text-text-muted">
                  {fmtNum(groupTotal)}
                </span>
              )}
            </button>
            {open && (
              <ul>
                {group.sheets.map((sheet) => {
                  const count = counts.get(sheet.id);
                  const current = sheet.id === currentSheetId;
                  return (
                    <li key={sheet.id}>
                      <button
                        type="button"
                        onClick={() => onSelectSheet(sheet.id)}
                        aria-current={current ? "page" : undefined}
                        className={cn(
                          "focus-ring relative flex w-full items-center gap-2 py-1.5 pr-3 pl-8 text-left transition-fast hover:bg-hover",
                          current && "bg-surface-2",
                        )}
                      >
                        {current && (
                          <span
                            className="absolute inset-y-1 left-0 w-[3px] rounded-r-full bg-text"
                            aria-hidden
                          />
                        )}
                        <FileText
                          className={cn(
                            "size-3.5 shrink-0",
                            current ? "text-text" : "text-text-muted",
                          )}
                          strokeWidth={1.5}
                        />
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              "block truncate text-[12px]",
                              current ? "font-medium text-text-primary" : "text-text-secondary",
                            )}
                          >
                            Лист {sheet.number}
                          </span>
                          <span className="block truncate text-[11px] text-text-muted">
                            {sheet.title}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-0.5">
                          <span className="tnum text-[11px] text-text-secondary">
                            {count?.total ? fmtNum(count.total) : "—"}
                          </span>
                          {count && count.attention > 0 && (
                            <span
                              className="tnum rounded-full bg-warn-bg px-1.5 text-[10px] font-semibold text-warn"
                              title="Требуют разбора"
                            >
                              {count.attention}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
});
