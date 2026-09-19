import { useEffect, useMemo, useState } from "react";
import { Camera, Check, Trash2, X } from "lucide-react";
import type { Delivery } from "@/contracts";
import { useAcceptanceRules, type AcceptanceDraft } from "@/api/deliveries";
import { useAcceptDelivery } from "@/api/mutations";
import { useCurrentUser } from "@/lib/project-scope";
import { compressPhoto } from "@/lib/photo";
import { fmtNum } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const MAX_PHOTOS = 6;

type Answer = "ok" | "fail" | undefined;

/**
 * Приёмка поставки на площадке (ADR-011). Рассчитана на телефон: крупные поля количества,
 * камера, кнопки на всю ширину. Правила акта — те же, что проверит адаптер: полностью —
 * только без расхождений; расхождение — фото обязательно; отклонение — с причиной.
 */
export function AcceptanceDialog({
  delivery,
  open,
  onOpenChange,
}: {
  delivery: Delivery;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const rules = useAcceptanceRules(delivery);
  const user = useCurrentUser();
  const accept = useAcceptDelivery();
  const [facts, setFacts] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [compressing, setCompressing] = useState(false);

  // Каждое открытие — чистый акт: факт по умолчанию равен заявленному
  useEffect(() => {
    if (!open) return;
    setFacts(Object.fromEntries(delivery.items.map((line) => [line.id, String(line.qty)])));
    setRemarks({});
    setAnswers({});
    setNotes({});
    setPhotos([]);
    setReason("");
    setRejecting(false);
    setConfirmed(false);
  }, [open, delivery]);

  const lines = useMemo(
    () =>
      delivery.items.map((line) => ({
        lineId: line.id,
        acceptedQty: Number((facts[line.id] ?? "").replace(",", ".")),
        remark: remarks[line.id]?.trim() || null,
      })),
    [delivery.items, facts, remarks],
  );
  const checklist = rules.checklist.map((item) => ({
    id: item.id,
    label: item.label,
    ok: answers[item.id] === "ok",
    note: notes[item.id]?.trim() || null,
  }));
  const answered = rules.checklist.every((item) => answers[item.id] !== undefined);
  const discrepancies = rules.discrepancies({ lines });
  const discrepancy = rules.hasDiscrepancy({ lines, checklist });

  const draft = (result: AcceptanceDraft["result"]): AcceptanceDraft => ({
    result,
    lines,
    checklist,
    photos: photos.length,
    reason: reason.trim() || null,
    confirmed,
  });
  const result: AcceptanceDraft["result"] = rejecting
    ? "rejected"
    : discrepancy
      ? "accepted_with_remarks"
      : "accepted";
  const problem = !answered
    ? "Ответьте на каждый пункт входного контроля"
    : rules.error(draft(result));

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setCompressing(true);
    try {
      const room = MAX_PHOTOS - photos.length;
      const next = await Promise.all([...files].slice(0, room).map(compressPhoto));
      setPhotos((list) => [...list, ...next].slice(0, MAX_PHOTOS));
    } catch (error) {
      toast.error("Фото не добавлено", { description: (error as Error).message });
    } finally {
      setCompressing(false);
    }
  };

  const submit = () => {
    if (problem) return;
    // mutateAsync, а не колбэки mutate: после ответа поставка перестаёт быть «прибывшей»,
    // диалог размонтируется, и колбэки mutate уже не сработали бы — пользователь не увидел
    // бы ни подтверждения, ни того, что замечания ушли снабжению
    accept
      .mutateAsync({
        deliveryId: delivery.id,
        result,
        lines,
        checklist,
        photos: photos.map((dataUrl) => ({ dataUrl, caption: null })),
        reason: reason.trim() || null,
        confirmed: true,
      })
      .then((card) => {
        const remarkCount = card.remarks.filter((item) => item.status === "open").length;
        toast.success(
          result === "rejected"
            ? "Поставка отклонена"
            : result === "accepted"
              ? "Поставка принята"
              : "Поставка принята с замечаниями",
          {
            description: remarkCount
              ? `Замечаний: ${remarkCount}. Переданы снабжению в очередь «Требует решения».`
              : "Позиции материалов получили фактическое количество.",
          },
        );
        onOpenChange(false);
      })
      .catch((error: Error) => toast.error("Акт не сохранён", { description: error.message }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-dvh flex-col max-sm:h-dvh max-sm:max-w-none max-sm:rounded-none sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>Приёмка поставки</DialogTitle>
          <DialogDescription>
            Укажите, сколько фактически пришло, пройдите входной контроль и сфотографируйте, если
            есть расхождение.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 gap-5 overflow-y-auto pb-2">
          <fieldset className="grid gap-3">
            <legend className="mb-1 text-[13px] font-medium">Фактическое количество</legend>
            {delivery.items.map((line) => {
              const diff = discrepancies.find((item) => item.lineId === line.id);
              return (
                <div key={line.id} className="grid gap-1.5">
                  <label className="grid gap-1 text-[13px]">
                    <span className="text-text">{line.name}</span>
                    <span className="flex items-center gap-2">
                      <input
                        inputMode="decimal"
                        value={facts[line.id] ?? ""}
                        onChange={(event) =>
                          setFacts((prev) => ({ ...prev, [line.id]: event.target.value }))
                        }
                        aria-label={`Принято, ${line.unit}: ${line.name}`}
                        className="tnum focus-ring h-12 w-36 rounded-[var(--r-sm)] border border-line bg-surface-2 px-3 text-[16px] text-text"
                      />
                      <span className="text-text-2">
                        {line.unit} из {fmtNum(line.qty)} заявленных
                      </span>
                    </span>
                  </label>
                  {diff && (
                    <>
                      <p className="text-[13px] text-warn">
                        {diff.kind === "shortage" ? "Недостача" : "Излишек"}{" "}
                        {fmtNum(Math.abs(diff.declared - diff.accepted))} {line.unit} — станет
                        замечанием снабжению
                      </p>
                      <input
                        value={remarks[line.id] ?? ""}
                        onChange={(event) =>
                          setRemarks((prev) => ({ ...prev, [line.id]: event.target.value }))
                        }
                        placeholder="Что с расхождением: не довезли, пересорт, брак"
                        maxLength={500}
                        aria-label={`Замечание: ${line.name}`}
                        className="focus-ring h-11 rounded-[var(--r-sm)] border border-line bg-surface-2 px-3 text-[14px] text-text placeholder:text-text-3"
                      />
                    </>
                  )}
                </div>
              );
            })}
          </fieldset>

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-[13px] font-medium">Входной контроль</legend>
            {rules.checklist.map((item) => (
              <div key={item.id} className="grid gap-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[14px] text-text">{item.label}</span>
                  <div role="radiogroup" aria-label={item.label} className="flex shrink-0 gap-1">
                    {(["ok", "fail"] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={answers[item.id] === value}
                        aria-label={value === "ok" ? "Да" : "Нет"}
                        onClick={() => setAnswers((prev) => ({ ...prev, [item.id]: value }))}
                        className={cn(
                          "focus-ring grid size-11 place-items-center rounded-[var(--r-sm)] border transition-fast",
                          answers[item.id] === value
                            ? value === "ok"
                              ? "border-ok bg-ok-bg text-ok"
                              : "border-danger bg-danger-bg text-danger"
                            : "border-line bg-surface-2 text-text-3",
                        )}
                      >
                        {value === "ok" ? (
                          <Check className="size-4" strokeWidth={2} />
                        ) : (
                          <X className="size-4" strokeWidth={2} />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                {answers[item.id] === "fail" && (
                  <input
                    value={notes[item.id] ?? ""}
                    onChange={(event) =>
                      setNotes((prev) => ({ ...prev, [item.id]: event.target.value }))
                    }
                    placeholder="Что не так"
                    maxLength={300}
                    aria-label={`Что не так: ${item.label}`}
                    className="focus-ring h-11 rounded-[var(--r-sm)] border border-line bg-surface-2 px-3 text-[14px] text-text placeholder:text-text-3"
                  />
                )}
              </div>
            ))}
          </fieldset>

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-[13px] font-medium">
              Фото {discrepancy || rejecting ? "— обязательно при расхождении" : ""}
            </legend>
            <div className="flex flex-wrap gap-2">
              {photos.map((dataUrl, index) => (
                <div key={index} className="relative">
                  <img
                    src={dataUrl}
                    alt={`Фото ${index + 1}`}
                    className="size-20 rounded-[var(--r-sm)] border border-line object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setPhotos((list) => list.filter((_, i) => i !== index))}
                    aria-label={`Удалить фото ${index + 1}`}
                    className="focus-ring absolute -top-2 -right-2 grid size-8 place-items-center rounded-full border border-line bg-surface text-text-2"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS && (
                <label className="focus-within:ring-2 focus-within:ring-orange-line grid size-20 cursor-pointer place-items-center rounded-[var(--r-sm)] border border-dashed border-line-2 bg-surface-2 text-text-2">
                  <span className="grid place-items-center gap-1 text-[12px]">
                    <Camera className="size-5" strokeWidth={1.5} />
                    {compressing ? "Сжимаем…" : "Снять"}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    className="sr-only"
                    aria-label="Добавить фото"
                    onChange={(event) => {
                      void addPhotos(event.target.files);
                      event.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
          </fieldset>

          {rejecting && (
            <label className="grid gap-1 text-[13px]">
              <span className="font-medium">Причина отклонения</span>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                maxLength={1000}
                className="focus-ring rounded-[var(--r-sm)] border border-line bg-surface-2 px-3 py-2 text-[14px] text-text"
              />
            </label>
          )}

          <label className="flex items-start gap-3 text-[13px]">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              className="mt-0.5 size-5 shrink-0 accent-[var(--text)]"
            />
            <span className="text-text-2">
              Подтверждаю приёмку от имени {user?.name ?? "—"}, {user?.roleLabel.toLowerCase()}.
              Электронной подписи в системе нет: в акт записываются сотрудник и время.
            </span>
          </label>
        </div>

        <DialogFooter className="grid gap-2 sm:flex">
          {problem && (
            <p className="text-[13px] text-text-3 sm:mr-auto sm:self-center">{problem}</p>
          )}
          {rejecting ? (
            <Button variant="ghost" onClick={() => setRejecting(false)}>
              Не отклонять
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setRejecting(true)}>
              Отклонить…
            </Button>
          )}
          <Button
            variant={rejecting ? "destructive" : "accent"}
            disabled={!!problem || accept.isPending}
            onClick={submit}
            className="max-sm:h-12"
          >
            {rejecting
              ? "Отклонить поставку"
              : discrepancy
                ? "Принять с замечаниями"
                : "Принять полностью"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
