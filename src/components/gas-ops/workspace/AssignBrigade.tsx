import { useState } from "react";
import { useManualAssignment } from "@/api/gas-demo-workflow";
import { useGasActor } from "@/api/gas-ops";
import { AdaptiveSheet } from "@/components/gas-ops/AdaptiveSheet";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";

export function AssignBrigade({ objectId, brigadeId }: { objectId?: string; brigadeId?: string }) {
  const actor = useGasActor();
  const data = useManualAssignment();
  const [open, setOpen] = useState(false);
  const [object, setObject] = useState(objectId ?? "");
  const [brigade, setBrigade] = useState(brigadeId ?? "");
  const [day, setDay] = useState(data.days[0] ?? "");
  const [busy, setBusy] = useState(false);
  if (actor.role !== "manager" && !actor.isAdmin) return null;
  const save = async () => {
    if (busy) return;
    setBusy(true);
    const result = await data.assign({ objectId: object, brigadeId: brigade, day });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success("Бригада назначена. Объект доступен в графике и форме времени");
    setOpen(false);
  };
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Назначить бригаду
      </Button>
      <AdaptiveSheet
        open={open}
        onOpenChange={setOpen}
        id="assign-brigade"
        title="Назначение на объект"
        description="Добавит день в график, сохранив остальные назначения"
        actions={
          <Button disabled={!object || !brigade || !day || busy} onClick={() => void save()}>
            Сохранить назначение
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-meta">
            Объект
            <select
              className="h-12 max-w-full rounded-control border border-line bg-surface px-3 text-body"
              value={object}
              onChange={(e) => setObject(e.target.value)}
            >
              <option value="">Выберите объект</option>
              {data.objects.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.code} · {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-meta">
            Бригада
            <select
              className="h-12 max-w-full rounded-control border border-line bg-surface px-3 text-body"
              value={brigade}
              onChange={(e) => setBrigade(e.target.value)}
            >
              <option value="">Выберите бригаду</option>
              {data.brigades.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-meta">
            День работы
            <select
              className="h-12 rounded-control border border-line bg-surface px-3 text-body"
              value={day}
              onChange={(e) => setDay(e.target.value)}
            >
              {data.days.map((d) => (
                <option key={d} value={d}>
                  {d.slice(8, 10)}.{d.slice(5, 7)}.{d.slice(0, 4)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </AdaptiveSheet>
    </>
  );
}
