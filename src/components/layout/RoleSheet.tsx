import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { DEMO_PERSONAS, dataSource } from "@/api/config";
import { queries } from "@/api/queries";
import { employeeRoleLabel } from "@/contracts";
import { useApp } from "@/lib/app-context";
import { useEnterAs } from "@/lib/persona";
import { BottomSheet, SheetRow } from "@/components/common/BottomSheet";

/**
 * Шторка «Вы смотрите как» (ADR-048, 01_SPEC 4.1): открывается аватаром в шапке телефона
 * и «Сменить роль» на экране «Ещё». Роли канона показа; директор в показ не выходит (ADR-038).
 * Доступность ADR-046 живёт здесь: удержание фокуса, Escape, возврат фокуса на кнопку.
 */
export function RoleSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const enterAs = useEnterAs();
  const { personaId } = useApp();
  const employees = useQuery(queries.employees()).data ?? [];
  const personas = DEMO_PERSONAS.map((id) => employees.find((item) => item.id === id))
    .filter((item): item is (typeof employees)[number] => !!item)
    .filter((item) => item.role !== "director");

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Вы смотрите как"
      description={
        dataSource === "demo"
          ? "Роль меняет рабочий экран и вкладки. Данные демонстрации общие."
          : "Роль приходит из учётной записи"
      }
    >
      <div className="grid gap-1 pb-2">
        {personas.map((person) => (
          <SheetRow
            key={person.id}
            label={employeeRoleLabel[person.role]}
            hint={person.id === personaId ? `${person.name}, выбрано` : person.name}
            onSelect={() => {
              onOpenChange(false);
              void enterAs(person.id, person.role).then((to: string) => navigate({ to }));
            }}
          />
        ))}
      </div>
    </BottomSheet>
  );
}
