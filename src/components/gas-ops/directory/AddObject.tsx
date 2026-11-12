/**
 * «Добавить объект» (ADR-062, F3): объект не только из графика. Адрес, свой номер и вид
 * работ; номер уникален, повтор отклоняет порт с понятной причиной.
 */
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/kit/field";
import { AdaptiveSheet } from "@/components/gas-ops/AdaptiveSheet";
import { notify } from "@/components/ui/kit/toast";
import { useGasDirectoryImport } from "@/api/gas-estimates";
import { toast } from "@/lib/toast";

export function AddObject() {
  const { addObject } = useGasDirectoryImport();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [code, setCode] = useState("");
  const [workType, setWorkType] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const labelError = label.trim() ? null : "Укажите адрес";
  const codeError = code.trim() ? null : "Укажите номер объекта";

  const close = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setLabel("");
      setCode("");
      setWorkType("");
      setTried(false);
    }
  };

  const save = async () => {
    setTried(true);
    if (labelError || codeError) return;
    setBusy(true);
    const result = await addObject({ label, code, workType: workType.trim() || null });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    notify(`Объект добавлен: ${result.value.code} · ${result.value.label}`);
    close(false);
  };

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Plus aria-hidden />
        Добавить объект
      </Button>
      <AdaptiveSheet
        open={open}
        onOpenChange={close}
        id="object-add"
        title="Новый объект"
        description="Для объектов, которых ещё нет в графике"
        actions={
          <>
            <Button
              variant="primary"
              className="flex-1"
              loading={busy}
              loadingText="Сохраняю..."
              onClick={() => void save()}
            >
              Добавить
            </Button>
            <Button variant="secondary" onClick={() => close(false)}>
              Отмена
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-block">
          <Field
            label="Адрес"
            value={label}
            onChange={setLabel}
            placeholder="ст. Демо-Северная, ул. Демо, 300"
            error={labelError}
            showError={tried}
          />
          <Field
            label="Номер объекта"
            value={code}
            onChange={setCode}
            placeholder="ОБ-300"
            error={codeError}
            showError={tried}
          />
          <Field
            label="Вид работ"
            value={workType}
            onChange={setWorkType}
            placeholder="котел, газопровод"
          />
          <p className="text-meta text-text-3">
            Объект появится в списке объектов и в привязке сметы. В график недели он попадёт из
            файла графика. Действие пишется в журнал.
          </p>
        </div>
      </AdaptiveSheet>
    </>
  );
}
