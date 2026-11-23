import { useNavigate } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { objectPhrase, useCleanupRights, useGasCleanup, useObjectCleanup } from "@/api/gas-cleanup";
import { toast } from "@/lib/toast";
import { DeleteConfirm } from "./DeleteConfirm";

/**
 * «Удалить объект» на странице объекта (ADR-088): объект со сметами, разделами и записями.
 * Записи закрытой недели не удаляются — тогда вместо кнопки объяснение.
 */
export function DeleteObject({ objectId, code }: { objectId: string; code: string }) {
  const rights = useCleanupRights();
  const { phrase, locked } = useObjectCleanup(objectId);
  const cleanup = useGasCleanup();
  const navigate = useNavigate();
  if (!rights.object) return null;
  return (
    <section aria-labelledby="object-delete" className="surface-1 p-4 lg:p-5">
      <h2 id="object-delete" className="text-heading">
        Удаление объекта
      </h2>
      {locked ? (
        <p className="mt-2 text-body text-text-2" data-testid="object-delete-locked">
          У объекта есть записи закрытой недели: такой объект не удаляется. Переоткройте неделю или
          очистите данные целиком в «Настройке».
        </p>
      ) : (
        <>
          <p className="mt-2 text-body text-text-2">Вместе с объектом удалится: {phrase}.</p>
          <DeleteConfirm
            testId="object-delete-dialog"
            trigger={
              <Button variant="destructive" className="mt-3" data-testid="object-delete">
                <Trash2 aria-hidden />
                Удалить объект
              </Button>
            }
            title={`Удалить объект ${code}?`}
            description={
              <>
                <p>Вместе с объектом удалится: {phrase}. Вернуть удалённое нельзя.</p>
                <p>Бригады, сотрудники и ставки останутся.</p>
              </>
            }
            confirmLabel="Удалить объект"
            onConfirm={async () => {
              const result = await cleanup.deleteObject(objectId);
              if (!result.ok) {
                toast.error(result.message);
                return false;
              }
              toast.success(`Объект удалён вместе с данными: ${objectPhrase(result.value)}`);
              void navigate({ to: "/gas/objects" });
              return true;
            }}
          />
        </>
      )}
    </section>
  );
}
