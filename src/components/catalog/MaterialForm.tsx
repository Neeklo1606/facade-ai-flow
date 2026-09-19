import { useEffect, useId, useState, type FormEvent } from "react";
import type { Material } from "@/contracts";
import { useCatalog } from "@/api/catalog";
import { useSaveMaterial } from "@/api/mutations";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";

const lines = (value: string) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const toCharacteristics = (value: string) =>
  lines(value).map((line) => {
    const [label, ...rest] = line.split(":");
    return rest.length
      ? { label: label!.trim(), value: rest.join(":").trim() }
      : { label: "Примечание", value: line };
  });

/**
 * Добавить или изменить материал номенклатуры (ADR-014, п. 4). Категорию предлагает правило
 * по наименованию; синонимы и типичные написания — по строке: по ним система предлагает
 * материал позициям спецификации.
 */
export function MaterialForm({
  open,
  onOpenChange,
  material,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null — новый материал */
  material: Material | null;
}) {
  const { categories, pathOf, categoryFor } = useCatalog();
  const save = useSaveMaterial();
  const ids = {
    name: useId(),
    unit: useId(),
    category: useId(),
    chars: useId(),
    syn: useId(),
    spell: useId(),
  };
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [characteristics, setCharacteristics] = useState("");
  const [synonyms, setSynonyms] = useState("");
  const [spellings, setSpellings] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(material?.name ?? "");
    setUnit(material?.unit ?? "");
    setCategoryId(material?.categoryId ?? "");
    setCharacteristics(
      (material?.characteristics ?? []).map((c) => `${c.label}: ${c.value}`).join("\n"),
    );
    setSynonyms((material?.synonyms ?? []).join("\n"));
    setSpellings((material?.spellings ?? []).join("\n"));
  }, [open, material]);

  const suggested = name.trim().length >= 3 ? categoryFor(name) : null;
  const leaves = categories.filter((item) => item.parentId !== null);
  const valid = name.trim().length >= 3 && unit.trim().length > 0 && categoryId !== "";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    save.mutate(
      {
        id: material?.id ?? null,
        name: name.trim(),
        unit: unit.trim(),
        categoryId,
        characteristics: toCharacteristics(characteristics),
        synonyms: lines(synonyms),
        spellings: lines(spellings),
      },
      {
        onSuccess: (saved) => {
          toast.success(material ? "Материал изменён" : "Материал добавлен", {
            description: `${saved.name}, ${saved.unit}. Изменение записано в историю.`,
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
          <DialogTitle>{material ? "Изменить материал" : "Новый материал"}</DialogTitle>
          <DialogDescription>
            Название и единица уникальны в справочнике. Каждое изменение попадает в историю
            материала.
          </DialogDescription>
        </DialogHeader>
        <form id="material-form" onSubmit={submit} className="grid min-h-0 gap-4 overflow-y-auto">
          <div className="grid gap-1.5">
            <label htmlFor={ids.name} className="text-[13px] text-text-2">
              Нормализованное наименование
            </label>
            <input
              id={ids.name}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={300}
              className={field}
            />
          </div>
          <div className="grid grid-cols-[1fr_2fr] gap-3">
            <div className="grid gap-1.5">
              <label htmlFor={ids.unit} className="text-[13px] text-text-2">
                Единица
              </label>
              <input
                id={ids.unit}
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                maxLength={20}
                className={field}
              />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor={ids.category} className="text-[13px] text-text-2">
                Категория
              </label>
              <select
                id={ids.category}
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className={field}
              >
                <option value="">Выберите категорию</option>
                {leaves.map((item) => (
                  <option key={item.id} value={item.id}>
                    {pathOf(item.id)
                      .map((c) => c.name)
                      .join(" › ")}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {suggested && suggested.id !== categoryId && (
            <p className="flex flex-wrap items-center gap-2 text-caption text-text-2">
              По правилу категорий:{" "}
              <b className="text-text">
                {pathOf(suggested.id)
                  .map((c) => c.name)
                  .join(" › ")}
              </b>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setCategoryId(suggested.id)}
              >
                Выбрать
              </Button>
            </p>
          )}
          <div className="grid gap-1.5">
            <label htmlFor={ids.chars} className="text-[13px] text-text-2">
              Характеристики — по строке, «Название: значение»
            </label>
            <textarea
              id={ids.chars}
              rows={3}
              value={characteristics}
              onChange={(e) => setCharacteristics(e.target.value)}
              className={field}
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={ids.syn} className="text-[13px] text-text-2">
              Синонимы — по строке
            </label>
            <textarea
              id={ids.syn}
              rows={2}
              value={synonyms}
              onChange={(e) => setSynonyms(e.target.value)}
              className={field}
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={ids.spell} className="text-[13px] text-text-2">
              Типичные написания в проектах — по строке
            </label>
            <textarea
              id={ids.spell}
              rows={2}
              value={spellings}
              onChange={(e) => setSpellings(e.target.value)}
              className={field}
            />
          </div>
        </form>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            type="submit"
            form="material-form"
            variant="accent"
            disabled={!valid || save.isPending}
          >
            {material ? "Сохранить" : "Добавить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
