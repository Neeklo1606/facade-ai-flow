import { useEffect, useId, useState, type FormEvent } from "react";
import { zoneLevelLabel, type WorkZone } from "@/contracts";
import { useSaveZone } from "@/api/mutations";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fmtNum } from "@/lib/format";
import { toast } from "@/lib/toast";

/**
 * Захватка объекта (ADR-024): корпус, секция, этаж, захватка. Без неё отчёт с площадки
 * не к чему привязать, а «сделали 120 м² где-то на объекте» — не отчёт, а разговор.
 */
const LEVELS = ["building", "section", "floor", "zone"] as const;

export function ZoneDialog({
  open,
  onOpenChange,
  projectId,
  zone,
  zones,
  /** Приняты ли по этой захватке объёмы: тогда «выполнено до начала учёта» не правится */
  hasAcceptedFact,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** null — новая захватка */
  zone: WorkZone | null;
  zones: WorkZone[];
  hasAcceptedFact: boolean;
}) {
  const save = useSaveZone();
  const ids = {
    name: useId(),
    level: useId(),
    parent: useId(),
    axes: useId(),
    floors: useId(),
    plan: useId(),
    unit: useId(),
    fact: useId(),
  };
  const [name, setName] = useState("");
  const [level, setLevel] = useState<(typeof LEVELS)[number]>("zone");
  const [parent, setParent] = useState("");
  const [axes, setAxes] = useState("");
  const [floors, setFloors] = useState("");
  const [plan, setPlan] = useState("");
  const [unit, setUnit] = useState("м²");
  const [fact, setFact] = useState("0");

  useEffect(() => {
    if (!open) return;
    setName(zone?.name ?? "");
    setLevel(zone?.level ?? "zone");
    setParent(zone?.parentId ?? "");
    setAxes(zone?.axes ?? "");
    setFloors(zone?.floors ?? "");
    setPlan(zone ? String(zone.planQty) : "");
    setUnit(zone?.unit ?? "м²");
    setFact(zone ? String(zone.factQty) : "0");
  }, [open, zone]);

  /** Своё поддерево: внутрь себя участок не переносят */
  const own = new Set<string>();
  if (zone) {
    own.add(zone.id);
    for (let pass = 0; pass < 10; pass += 1) {
      for (const item of zones) if (item.parentId && own.has(item.parentId)) own.add(item.id);
    }
  }
  const parents = zones.filter((item) => !own.has(item.id));
  const planNumber = Number(plan.replace(",", "."));
  const factNumber = Number(fact.replace(",", "."));
  const valid =
    name.trim().length >= 2 &&
    unit.trim().length > 0 &&
    Number.isFinite(planNumber) &&
    planNumber >= 0 &&
    Number.isFinite(factNumber) &&
    factNumber >= 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    save.mutate(
      {
        id: zone?.id ?? null,
        projectId,
        parentId: parent === "" ? null : parent,
        level,
        name: name.trim(),
        axes: axes.trim() === "" ? null : axes.trim(),
        floors: floors.trim() === "" ? null : floors.trim(),
        planQty: planNumber,
        baselineFactQty: hasAcceptedFact && zone ? zone.factQty : factNumber,
        unit: unit.trim(),
      },
      {
        onSuccess: (saved) => {
          toast.success(zone ? "Захватка изменена" : "Захватка заведена", {
            description: `${saved.name}: план ${fmtNum(saved.planQty)} ${saved.unit}. Запись — в истории объекта.`,
          });
          onOpenChange(false);
        },
        onError: (error) => toast.error("Не сохранено", { description: error.message }),
      },
    );
  };

  const field =
    "focus-ring w-full rounded-[var(--r-sm)] border border-line bg-surface-2 px-3 py-2 text-[14px] text-text placeholder:text-text-3";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-dvh flex-col sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{zone ? "Изменить захватку" : "Новая захватка"}</DialogTitle>
          <DialogDescription>
            К захватке привязываются отчёты с площадки и принятые объёмы. Готовность считается от
            плана, поэтому план — обязательное число.
          </DialogDescription>
        </DialogHeader>
        <form id="zone-form" onSubmit={submit} className="grid min-h-0 gap-4 overflow-y-auto">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
            <div className="grid gap-1.5">
              <label htmlFor={ids.level} className="text-[13px] text-text-2">
                Уровень
              </label>
              <select
                id={ids.level}
                value={level}
                onChange={(event) => setLevel(event.target.value as (typeof LEVELS)[number])}
                className={field}
              >
                {LEVELS.map((item) => (
                  <option key={item} value={item}>
                    {zoneLevelLabel[item]}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <label htmlFor={ids.parent} className="text-[13px] text-text-2">
                Внутри чего
              </label>
              <select
                id={ids.parent}
                value={parent}
                onChange={(event) => setParent(event.target.value)}
                className={field}
              >
                <option value="">Прямо в объекте</option>
                {parents.map((item) => (
                  <option key={item.id} value={item.id}>
                    {zoneLevelLabel[item.level]}: {item.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={ids.name} className="text-[13px] text-text-2">
              Название
            </label>
            <input
              id={ids.name}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Фасад А, оси 1–8"
              maxLength={120}
              className={field}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <label htmlFor={ids.axes} className="text-[13px] text-text-2">
                Оси — можно позже
              </label>
              <input
                id={ids.axes}
                value={axes}
                onChange={(event) => setAxes(event.target.value)}
                placeholder="1–8"
                maxLength={60}
                className={field}
              />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor={ids.floors} className="text-[13px] text-text-2">
                Этажи — можно позже
              </label>
              <input
                id={ids.floors}
                value={floors}
                onChange={(event) => setFloors(event.target.value)}
                placeholder="1–12"
                maxLength={60}
                className={field}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <div className="grid gap-1.5">
              <label htmlFor={ids.plan} className="text-[13px] text-text-2">
                План
              </label>
              <input
                id={ids.plan}
                value={plan}
                onChange={(event) => setPlan(event.target.value)}
                inputMode="decimal"
                placeholder="1240"
                className={field}
              />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor={ids.unit} className="text-[13px] text-text-2">
                Единица
              </label>
              <input
                id={ids.unit}
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
                maxLength={20}
                className={field}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={ids.fact} className="text-[13px] text-text-2">
              Выполнено до начала учёта
            </label>
            <input
              id={ids.fact}
              value={hasAcceptedFact && zone ? String(zone.factQty) : fact}
              onChange={(event) => setFact(event.target.value)}
              inputMode="decimal"
              disabled={hasAcceptedFact && !!zone}
              className={`${field} disabled:cursor-not-allowed disabled:text-text-3`}
            />
            <p className="text-caption text-text-muted">
              {hasAcceptedFact && zone
                ? "По захватке уже приняты объёмы: это число сложено с ними, и править его здесь нельзя."
                : "Сколько сделано до того, как учёт пошёл через систему. Дальше факт растёт принятыми объёмами."}
            </p>
          </div>
        </form>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            type="submit"
            form="zone-form"
            variant="accent"
            disabled={!valid || save.isPending}
          >
            {zone ? "Сохранить" : "Завести"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
