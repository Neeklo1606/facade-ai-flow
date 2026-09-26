import { useEffect, useId, useState, type FormEvent } from "react";
import type { MaterialCategory } from "@/contracts";
import { useCatalog } from "@/api/catalog";
import { useSaveCategory } from "@/api/mutations";
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

/**
 * Категория дерева: создать, переименовать, перенести (ADR-023, п. 2). Перенос внутрь своего
 * поддерева отклоняет домен, но в списке родителей такие ветки не показываем вовсе — выбрать
 * невозможное и получить отказ хуже, чем этого варианта не видеть.
 */
const lines = (value: string) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

export function CategoryDialog({
  open,
  onOpenChange,
  category,
  parentId = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null — новая категория */
  category: MaterialCategory | null;
  /** Куда добавляем новую: null — верхний уровень */
  parentId?: string | null;
}) {
  const { categories, pathOf } = useCatalog();
  const save = useSaveCategory();
  const ids = { name: useId(), parent: useId(), rules: useId() };
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const [rules, setRules] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(category?.name ?? "");
    setParent(category ? (category.parentId ?? "") : (parentId ?? ""));
    setRules((category?.rules ?? []).join("\n"));
  }, [open, category, parentId]);

  /** Своё поддерево: внутрь себя категорию не переносят */
  const own = new Set<string>();
  if (category) {
    own.add(category.id);
    for (let pass = 0; pass < 10; pass += 1) {
      for (const item of categories) {
        if (item.parentId && own.has(item.parentId)) own.add(item.id);
      }
    }
  }
  const parents = categories.filter((item) => !own.has(item.id));
  const valid = name.trim().length >= 2;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    save.mutate(
      {
        id: category?.id ?? null,
        name: name.trim(),
        parentId: parent === "" ? null : parent,
        rules: lines(rules),
      },
      {
        onSuccess: (saved) => {
          toast.success(category ? "Категория изменена" : "Категория создана", {
            description: `${pathOf(saved.id)
              .map((item) => item.name)
              .join(" › ")}. Изменение записано в журнал справочников.`,
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
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{category ? "Изменить категорию" : "Новая категория"}</DialogTitle>
          <DialogDescription>
            Категория верхнего уровня решает, каким поставщикам уходит запрос по материалам этой
            ветки. Материалы вешают на нижний уровень.
          </DialogDescription>
        </DialogHeader>
        <form id="category-form" onSubmit={submit} className="grid gap-4">
          <div className="grid gap-1.5">
            <label htmlFor={ids.name} className="text-[13px] text-text-2">
              Название
            </label>
            <input
              id={ids.name}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              className={field}
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={ids.parent} className="text-[13px] text-text-2">
              Где находится
            </label>
            <select
              id={ids.parent}
              value={parent}
              onChange={(event) => setParent(event.target.value)}
              className={field}
            >
              <option value="">Верхний уровень</option>
              {parents.map((item) => (
                <option key={item.id} value={item.id}>
                  {pathOf(item.id)
                    .map((c) => c.name)
                    .join(" › ")}
                </option>
              ))}
            </select>
            {category && category.parentId !== (parent === "" ? null : parent) && (
              <p className="text-caption text-text-2">
                Перенос: материалы этой ветки останутся на ней, но запрос по ним пойдёт поставщикам
                новой категории верхнего уровня.
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={ids.rules} className="text-[13px] text-text-2">
              Правила определения по наименованию — по строке
            </label>
            <textarea
              id={ids.rules}
              rows={3}
              value={rules}
              onChange={(event) => setRules(event.target.value)}
              placeholder={"кронштейн\nконсоль"}
              className={field}
            />
            <p className="text-caption text-text-muted">
              По этим словам система предлагает категорию новому материалу. Пусто — предлагать не
              будет, категорию выберут руками.
            </p>
          </div>
        </form>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            type="submit"
            form="category-form"
            variant="accent"
            disabled={!valid || save.isPending}
          >
            {category ? "Сохранить" : "Создать"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
