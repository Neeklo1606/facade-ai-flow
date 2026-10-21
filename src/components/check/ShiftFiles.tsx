/**
 * Сводка смены и черновик ведомости объёмов (ADR-037, сценарий 2) — стеклянными капсулами
 * в шапке очереди. Файл собирается из принятых записей смены и прямо подписан черновиком:
 * исполнительную документацию демонстрация не выпускает.
 */
import { useState } from "react";
import { Download } from "lucide-react";
import { saveShiftFile, useShift } from "@/api/capture";
import { useNow } from "@/api/clock";
import { fmtDate, fmtNum, plural } from "@/lib/format";
import { recordAction } from "@/lib/guide/telemetry";
import { toast } from "@/lib/toast";

export function ShiftFiles({ projectId }: { projectId: string }) {
  const now = useNow();
  const date = now.slice(0, 10);
  /*
   * Ведомость собирается за последнюю смену с принятыми записями: факт, который ПТО принял
   * сегодня, может быть позавчерашним, и прятать от него документ из-за этого неправильно.
   * Дата документа названа рядом с кнопкой, поэтому подмены не происходит.
   */
  const shift = useShift(projectId, date, true);
  const [saving, setSaving] = useState(false);
  const rows = shift.data?.rows.length ?? 0;

  const save = (kind: "shift" | "statement") => {
    setSaving(true);
    void saveShiftFile({ projectId, date: shift.data?.date ?? date }, kind)
      .then(() => recordAction(kind === "statement" ? "downloadStatement" : "downloadShift"))
      .catch((error: Error) => toast.error("Документ не собрался", { description: error.message }))
      .finally(() => setSaving(false));
  };

  const capsule =
    "glass inline-flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-medium text-text transition-fast focus-ring press is-hover:bg-surface disabled:pointer-events-none disabled:opacity-50 sm:flex-none";

  return (
    <div className="flex min-w-0 flex-col gap-2 lg:items-end">
      <div className="flex gap-2">
        <button
          type="button"
          aria-label="Скачать сводку смены"
          disabled={saving || rows === 0}
          onClick={() => save("shift")}
          className={capsule}
        >
          <Download className="size-4" aria-hidden /> Сводка
        </button>
        <button
          type="button"
          aria-label="Скачать черновик ведомости"
          disabled={saving || rows === 0}
          onClick={() => save("statement")}
          className={capsule}
        >
          <Download className="size-4" aria-hidden /> Ведомость
        </button>
      </div>
      <span className="text-[13px] leading-[18px] text-text-2 lg:text-right">
        {rows > 0
          ? `В документ ${plural(rows, "войдёт", "войдут", "войдут")} ${fmtNum(rows)} ${plural(rows, "принятая запись", "принятые записи", "принятых записей")} за ${fmtDate(shift.data?.date ?? date)}`
          : "Принятых записей пока нет: примите факт, и документ соберётся"}
      </span>
    </div>
  );
}
