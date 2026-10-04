import { useState } from "react";
import { HardHat } from "lucide-react";
import type { WorkZone } from "@/contracts";
import { note } from "@/lib/contour-copy";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  emptyReport,
  ReportFields,
  reportReady,
  useReportSubmit,
  type ReportFormValue,
} from "./ReportForm";

/**
 * Отчёт с площадки руками (ADR-022) на экране отчётов. Поля и правила записи — общие
 * со шторкой «+» (ADR-029): форма одна, входов два.
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
  const [value, setValue] = useState<ReportFormValue>(() => emptyReport(zones[0]?.id ?? "", today));
  const { submit, pending } = useReportSubmit(projectId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Завести отчёт с площадки</DialogTitle>
          <DialogDescription>{note("telegram")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <ReportFields value={value} onChange={setValue} zones={zones} today={today} />

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button
              onClick={() =>
                submit(value, () => {
                  toast.success("Отчёт заведён", {
                    description:
                      "Он в ленте со статусом «На проверке»: объём принимает руководитель.",
                  });
                  onOpenChange(false);
                  setValue(emptyReport(value.zoneId, today));
                })
              }
              loading={pending}
              disabled={!reportReady(value)}
            >
              <HardHat className="size-4" /> Завести отчёт
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
