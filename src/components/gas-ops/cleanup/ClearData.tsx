import { Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResetButton } from "@/components/gas-ops/shell/GasShell";
import { countsPhrase, useCleanupRights, useClearCleanup, useGasCleanup } from "@/api/gas-cleanup";
import { workingContour } from "@/lib/cabinet";
import { toast } from "@/lib/toast";
import { DeleteConfirm } from "./DeleteConfirm";

const WORD = "ОЧИСТИТЬ";

/**
 * Раздел «Данные» в «Настройке» (ADR-088): очистить рабочие данные, чтобы проверить загрузку
 * смет и табель с нуля или показать заказчику пустую базу. Справочники и люди остаются.
 * Рядом в демо-контуре — возврат к исходному набору показа.
 */
export function ClearData() {
  const rights = useCleanupRights();
  const { phrase, empty } = useClearCleanup();
  const cleanup = useGasCleanup();
  if (!rights.clear && workingContour) return null;
  return (
    <div className="surface-1 flex flex-col gap-3 p-4 lg:p-5" data-testid="clear-data">
      <p className="text-body">
        {empty ? "Рабочих данных нет: можно загружать сметы с нуля." : `Сейчас в базе: ${phrase}.`}
      </p>
      <p className="text-meta text-text-3">
        Очистка удаляет объекты, сметы и их файлы, разделы, записи времени, проверки, отчёты,
        закрытые недели, заявки и документы. Остаются бригады, сотрудники, ставки, пользователи,
        правило расчёта компании и режим проверки.
        {workingContour ? " Перед очисткой рабочей базы сделайте резервную копию." : null}
      </p>
      <div className="flex flex-wrap gap-2">
        {rights.clear ? (
          <DeleteConfirm
            testId="clear-data-dialog"
            typed={WORD}
            trigger={
              <Button variant="destructive" disabled={empty} data-testid="clear-data-open">
                <Eraser aria-hidden />
                Очистить данные
              </Button>
            }
            title="Очистить рабочие данные?"
            description={
              <>
                <p>Удалится: {phrase}. Вернуть удалённое нельзя.</p>
                <p>Бригады, сотрудники, ставки и пользователи останутся.</p>
              </>
            }
            confirmLabel="Очистить"
            onConfirm={async () => {
              const result = await cleanup.clearData();
              if (!result.ok) {
                toast.error(result.message);
                return false;
              }
              toast.success(`Данные очищены: ${countsPhrase(result.value)}`);
              return true;
            }}
          />
        ) : null}
        {/* Демонстрация: вернуть исходный набор показа после проверки на пустой базе */}
        {workingContour ? null : <ResetButton />}
      </div>
    </div>
  );
}
