/**
 * «На уточнение» для выбранных записей журнала (ADR-061, 10; раздел 4.4): вопрос бригадиру
 * обязателен. Принятие пачкой — в экране, оно без формы.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { REASONS, reasonText } from "../review/reasons";
import { plural } from "@/lib/format";
import { cn } from "@/lib/utils";

export function BulkClarifyDialog({
  open,
  count,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  count: number;
  onOpenChange: (open: boolean) => void;
  onSubmit: (comment: string) => Promise<void>;
}) {
  const [chip, setChip] = useState<string | null>(null);
  const [own, setOwn] = useState("");
  const [busy, setBusy] = useState(false);
  const comment = reasonText(chip, own);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setChip(null);
          setOwn("");
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            Вернуть на уточнение {count} {plural(count, "запись", "записи", "записей")}
          </DialogTitle>
          <DialogDescription>
            Вопрос увидит бригадир в «Уточнениях». Без вопроса вернуть нельзя.
          </DialogDescription>
        </DialogHeader>
        <div role="group" aria-label="Частые вопросы" className="flex flex-wrap gap-2">
          {REASONS.clarify.map((reason) => {
            const on = chip === reason;
            return (
              <button
                key={reason}
                type="button"
                aria-pressed={on}
                onClick={() => setChip(on ? null : reason)}
                className={`inline-flex min-h-segment items-center rounded-full px-3 text-body-strong transition-fast focus-ring ${
                  on ? "bg-pill text-pill-text" : "bg-surface-2 text-text is-hover:bg-surface-3"
                }`}
              >
                {reason}
              </button>
            );
          })}
        </div>
        <label className="block text-meta text-text-2">
          Свой вопрос
          <textarea
            value={own}
            onChange={(event) => setOwn(event.target.value)}
            rows={2}
            placeholder="Что спросить у бригадира"
            className="mt-1 block w-full resize-none rounded-control border border-line-2 bg-surface px-3 py-2 text-body text-text focus-ring"
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            disabled={!comment || busy}
            onClick={async () => {
              setBusy(true);
              await onSubmit(comment);
              setBusy(false);
              setChip(null);
              setOwn("");
            }}
          >
            Вернуть бригадирам
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
