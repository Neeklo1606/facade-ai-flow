import { useState } from "react";
import { HardHat } from "lucide-react";
import type { WorkZone } from "@/contracts";
import { useCreateReport } from "@/api/mutations";
import { note } from "@/lib/contour-copy";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Отчёт с площадки руками (ADR-022). Поля те же, что прораб диктует голосом: захватка,
 * вид работ, объём, дата смены, сколько человек, что мешало.
 *
 * Пока нет бота, это единственный способ сдать объём — поэтому форма короткая и без
 * необязательных подробностей: их некому заполнять в конце смены.
 */
export function CreateReportDialog({
  open,
  onOpenChange,
  projectId,
  zones,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  zones: WorkZone[];
  today: string;
}) {
  const create = useCreateReport({ onFailed: (error) => toast.error(error.message) });
  const [zoneId, setZoneId] = useState(zones[0]?.id ?? "");
  const [workType, setWorkType] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("м²");
  const [date, setDate] = useState(today);
  const [headcount, setHeadcount] = useState("4");
  const [summary, setSummary] = useState("");
  const [issue, setIssue] = useState("");

  const ready =
    zoneId && workType.trim().length > 1 && Number(qty) > 0 && summary.trim().length > 2;

  const submit = () => {
    create.mutate(
      {
        projectId,
        zoneId,
        workType: workType.trim(),
        declaredQty: Number(qty),
        unit: unit.trim(),
        reportDate: date,
        headcount: Number(headcount) || 0,
        summary: summary.trim(),
        ...(issue.trim() ? { issue: issue.trim() } : {}),
      },
      {
        onSuccess: () => {
          toast.success("Отчёт заведён", {
            description: "Он в ленте со статусом «На проверке»: объём принимает руководитель.",
          });
          onOpenChange(false);
          setWorkType("");
          setQty("");
          setSummary("");
          setIssue("");
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Завести отчёт с площадки</DialogTitle>
          <DialogDescription>{note("telegram")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <label className="grid gap-1.5">
            <span className="text-[13px] text-text-2">Захватка</span>
            <select
              value={zoneId}
              onChange={(event) => setZoneId(event.target.value)}
              aria-label="Захватка"
              className="focus-ring h-10 rounded-[var(--r-sm)] border border-line bg-surface-2 px-3 text-[14px] text-text"
            >
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5">
            <span className="text-[13px] text-text-2">Вид работ</span>
            <Input
              value={workType}
              onChange={(event) => setWorkType(event.target.value)}
              placeholder="Монтаж облицовки из керамогранита"
              aria-label="Вид работ"
            />
          </label>

          <div className="grid grid-cols-[1fr_100px_120px] gap-2">
            <label className="grid gap-1.5">
              <span className="text-[13px] text-text-2">Объём за смену</span>
              <Input
                value={qty}
                onChange={(event) => setQty(event.target.value.replace(",", "."))}
                inputMode="decimal"
                placeholder="184"
                aria-label="Объём за смену"
                className="tnum"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[13px] text-text-2">Единица</span>
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Единица" />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[13px] text-text-2">Дата смены</span>
              <Input
                type="date"
                value={date}
                max={today}
                onChange={(event) => setDate(event.target.value)}
                aria-label="Дата смены"
                className="tnum"
              />
            </label>
          </div>

          <label className="grid gap-1.5">
            <span className="text-[13px] text-text-2">Человек в смене</span>
            <Input
              value={headcount}
              onChange={(event) => setHeadcount(event.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              aria-label="Человек в смене"
              className="tnum w-24"
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-[13px] text-text-2">Что сделали</span>
            <textarea
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              rows={3}
              placeholder="Монтаж облицовки, захватка 2, оси Г–К, этажи 9–11."
              aria-label="Что сделали"
              className="focus-ring rounded-[var(--r-sm)] border border-line bg-surface-2 p-3 text-[14px] leading-[1.5] text-text"
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-[13px] text-text-2">Что мешало — если мешало</span>
            <Input
              value={issue}
              onChange={(event) => setIssue(event.target.value)}
              placeholder="Не хватает нащельника углового, 12 шт"
              aria-label="Что мешало"
            />
          </label>

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button onClick={submit} loading={create.isPending} disabled={!ready}>
              <HardHat className="size-4" /> Завести отчёт
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
