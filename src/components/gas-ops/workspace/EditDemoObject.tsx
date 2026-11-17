import { useState } from "react";
import {
  demoWorkspaceEnabled,
  DEMO_OBJECT_STATUS,
  useDemoObjectEditor,
  type DemoObjectStatus,
} from "@/api/gas-demo-workflow";
import { useGasActor } from "@/api/gas-ops";
import { AdaptiveSheet } from "@/components/gas-ops/AdaptiveSheet";
import { Field } from "@/components/ui/kit/field";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";

export function EditDemoObject({ objectId }: { objectId: string }) {
  const actor = useGasActor();
  const data = useDemoObjectEditor();
  const object = data.objects.find((o) => o.id === objectId);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [code, setCode] = useState("");
  const [workType, setWorkType] = useState("");
  const [status, setStatus] = useState<DemoObjectStatus>("active");
  const [busy, setBusy] = useState(false);
  if (!demoWorkspaceEnabled || !object || (actor.role !== "manager" && !actor.isAdmin)) return null;
  const start = () => {
    setLabel(object.label);
    setCode(object.code);
    setWorkType(object.workType ?? "");
    setStatus(object.demoStatus ?? "active");
    setOpen(true);
  };
  const save = async () => {
    if (busy) return;
    setBusy(true);
    const result = await data.save(objectId, { label, code, workType, demoStatus: status });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success("Объект сохранён в демонстрации");
    setOpen(false);
  };
  return (
    <>
      <Button variant="quiet" onClick={start}>
        Редактировать объект
      </Button>
      <AdaptiveSheet
        open={open}
        onOpenChange={setOpen}
        id="edit-demo-object"
        title="Редактировать объект"
        description="Демонстрация: изменения сохраняются в этом браузере и журнале"
        actions={
          <Button disabled={busy || !label.trim() || !code.trim()} onClick={() => void save()}>
            Сохранить объект
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Адрес" value={label} onChange={setLabel} />
          <Field label="Номер объекта" value={code} onChange={setCode} />
          <Field label="Вид работ" value={workType} onChange={setWorkType} />
          <label className="flex flex-col gap-1 text-meta">
            Статус объекта
            <select
              className="h-12 rounded-control border border-line bg-surface px-3 text-body"
              value={status}
              onChange={(e) => setStatus(e.target.value as DemoObjectStatus)}
            >
              {Object.entries(DEMO_OBJECT_STATUS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </AdaptiveSheet>
    </>
  );
}
