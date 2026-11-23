import { useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/kit/field";

/**
 * Подтверждение необратимого удаления (ADR-088). Диалог, а не тост «Отменить»: удалённое
 * не возвращается. Для очистки всей базы человек вводит слово — случайный тап её не запустит.
 * Диалог закрывается только после ответа: отказ правил показывает экран, а не пустота.
 */
export function DeleteConfirm({
  trigger,
  title,
  description,
  confirmLabel,
  typed,
  onConfirm,
  testId,
}: {
  trigger: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  /** Слово, которое нужно ввести перед удалением */
  typed?: string | undefined;
  /** true — удалено, диалог закрывается */
  onConfirm: () => Promise<boolean>;
  testId?: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = !typed || word.trim().toLowerCase() === typed.toLowerCase();
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        setOpen(next);
        if (!next) setWord("");
      }}
    >
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent data-testid={testId}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="flex flex-col gap-2">{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {typed ? (
          <Field
            label={`Чтобы подтвердить, введите «${typed}»`}
            value={word}
            onChange={setWord}
            autoComplete="off"
            autoCapitalize="characters"
            data-testid="delete-confirm-word"
          />
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Отмена</AlertDialogCancel>
          <Button
            variant="destructive"
            className="border-danger"
            disabled={!ready}
            loading={busy}
            loadingText="Удаляю..."
            data-testid="delete-confirm-action"
            onClick={async () => {
              setBusy(true);
              const ok = await onConfirm();
              setBusy(false);
              if (ok) {
                setOpen(false);
                setWord("");
              }
            }}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
