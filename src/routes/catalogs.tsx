import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, History, Pencil, Plus, Search, Upload } from "lucide-react";
import type { Material, MaterialCategory } from "@/contracts";
import { useAccess } from "@/api/access";
import { useCatalog } from "@/api/catalog";
import { useDirectory } from "@/api/directory";
import { queries } from "@/api/queries";
import { EntityDrawer } from "@/components/common/EntityDrawer";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { MobileActionBar } from "@/components/common/MobileActionBar";
import { CategoryDialog } from "@/components/catalog/CategoryDialog";
import { ImportMaterialsDialog } from "@/components/catalog/ImportMaterialsDialog";
import { MaterialForm } from "@/components/catalog/MaterialForm";
import { Button } from "@/components/ui/button";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/catalogs")({
  head: () => ({
    meta: [
      { title: "Справочники — neeklo FieldOps" },
      {
        name: "description",
        content:
          "Номенклатура материалов с характеристиками, синонимами и историей; дерево категорий с правилами.",
      },
    ],
  }),
  component: CatalogsPage,
});

/**
 * Справочники (ADR-014, п. 4–5): номенклатура и дерево категорий. По синонимам и типичным
 * написаниям система предлагает материал позициям спецификации; категория верхнего уровня
 * решает, каким поставщикам уходит запрос.
 */
function CatalogsPage() {
  const { materials, categories, pathOf } = useCatalog();
  const { can } = useAccess();
  const canEdit = can("catalogs", "write");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Material | null | undefined>(undefined);
  const [category, setCategory] = useState<
    { item: MaterialCategory | null; parentId: string | null } | undefined
  >(undefined);
  const [importOpen, setImportOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);

  const tops = categories.filter((item) => item.parentId === null);
  const childrenOf = (id: string) => categories.filter((item) => item.parentId === id);
  const inCategory = (material: Material, id: string) =>
    pathOf(material.categoryId).some((category) => category.id === id);

  const text = query.trim().toLowerCase();
  // Поиск по 12–100 строкам справочника — считаем при каждом рисовании, без мемоизации
  const rows = materials.filter(
    (material) =>
      (!categoryId || inCategory(material, categoryId)) &&
      (!text ||
        [material.name, ...material.synonyms, ...material.spellings].some((value) =>
          value.toLowerCase().includes(text),
        )),
  );

  return (
    <>
      <PageHeader
        title="Справочники"
        description="Номенклатура материалов и дерево категорий. По синонимам и написаниям система предлагает материал позициям, категория решает, кому уходит запрос."
        actions={
          canEdit && (
            <>
              <Button variant="secondary" onClick={() => setImportOpen(true)}>
                <Upload className="size-4" /> Загрузить из Excel
              </Button>
              <Button variant="accent" onClick={() => setEditing(null)}>
                <Plus className="size-4" /> Добавить материал
              </Button>
            </>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <nav aria-label="Категории материалов" className="card-surface self-start p-2">
          <button
            type="button"
            onClick={() => setCategoryId(null)}
            aria-current={categoryId === null ? "true" : undefined}
            className={cn(
              "focus-ring flex min-h-11 w-full items-center justify-between rounded-[var(--r-sm)] px-3 text-left text-[13px] lg:min-h-9",
              categoryId === null ? "bg-surface-2 text-text" : "text-text-2 hover:bg-surface-2",
            )}
          >
            Все категории <span className="tnum text-text-3">{fmtNum(materials.length)}</span>
          </button>
          <ul className="mt-1 grid gap-0.5">
            {tops.map((top) => (
              <li key={top.id}>
                <CategoryButton
                  label={top.name}
                  count={materials.filter((m) => inCategory(m, top.id)).length}
                  active={categoryId === top.id}
                  onClick={() => setCategoryId(top.id)}
                  {...(canEdit
                    ? { onEdit: () => setCategory({ item: top, parentId: top.parentId }) }
                    : {})}
                />
                <ul className="ml-3 grid gap-0.5 border-l border-line pl-2">
                  {childrenOf(top.id).map((child) => (
                    <li key={child.id}>
                      <CategoryButton
                        label={child.name}
                        hint={child.rules.length ? `правило: ${child.rules.join(", ")}` : undefined}
                        count={materials.filter((m) => inCategory(m, child.id)).length}
                        active={categoryId === child.id}
                        onClick={() => setCategoryId(child.id)}
                        {...(canEdit
                          ? { onEdit: () => setCategory({ item: child, parentId: top.id }) }
                          : {})}
                      />
                    </li>
                  ))}
                  {canEdit && (
                    <li>
                      <button
                        type="button"
                        onClick={() => setCategory({ item: null, parentId: top.id })}
                        className="focus-ring flex min-h-11 w-full items-center gap-1.5 rounded-[var(--r-sm)] px-3 text-left text-[13px] text-text-3 hover:bg-surface-2 lg:min-h-9"
                      >
                        <Plus className="size-3.5" aria-hidden /> Подкатегория
                      </button>
                    </li>
                  )}
                </ul>
              </li>
            ))}
          </ul>
          {canEdit && (
            <button
              type="button"
              onClick={() => setCategory({ item: null, parentId: null })}
              className="focus-ring mt-1 flex min-h-11 w-full items-center gap-1.5 rounded-[var(--r-sm)] px-3 text-left text-[13px] text-text-2 hover:bg-surface-2 lg:min-h-9"
            >
              <Plus className="size-4" aria-hidden /> Категория верхнего уровня
            </button>
          )}
        </nav>

        <section aria-label="Номенклатура" className="grid content-start gap-3">
          <div className="flex items-center gap-2">
            <label className="relative block flex-1">
              <span className="sr-only">Поиск по названию, синонимам и написаниям</span>
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-3"
                aria-hidden
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Название, синоним или написание в проекте"
                className="focus-ring h-11 w-full rounded-[var(--r-md)] border border-line bg-surface-2 pr-3 pl-9 text-[14px] text-text placeholder:text-text-3"
              />
            </label>
            {/* Журнал доступен на любой ширине: в шапке экрана его на телефоне не видно */}
            {canEdit && (
              <Button variant="secondary" onClick={() => setJournalOpen(true)}>
                <History className="size-4" /> Журнал
              </Button>
            )}
          </div>

          {rows.length === 0 ? (
            <EmptyState
              variant="filtered"
              icon={BookOpen}
              title="Материалов не найдено"
              description="Смените категорию или уточните поиск: он идёт по названию, синонимам и написаниям."
              actionLabel="Показать все материалы"
              onAction={() => {
                setCategoryId(null);
                setQuery("");
              }}
            />
          ) : (
            <>
              <div className="card-surface hidden overflow-x-auto lg:block">
                <table className="w-full text-table">
                  <caption className="sr-only">Номенклатура материалов</caption>
                  <thead>
                    <tr className="h-10 border-b border-line text-left text-[12px] text-text-3">
                      <th scope="col" className="px-4 font-normal">
                        Наименование
                      </th>
                      <th scope="col" className="px-3 font-normal">
                        Категория
                      </th>
                      <th scope="col" className="px-3 font-normal">
                        Ед.
                      </th>
                      <th scope="col" className="px-4 font-normal">
                        Синонимы и написания
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((material) => (
                      <tr key={material.id} className="h-14 border-b border-line last:border-0">
                        <th scope="row" className="px-4 py-2 text-left font-medium">
                          <button
                            type="button"
                            onClick={() => setOpenId(material.id)}
                            className="focus-ring rounded-[var(--r-xs)] text-left text-text underline-offset-2 hover:underline"
                          >
                            {material.name}
                          </button>
                        </th>
                        <td className="px-3 py-2 text-text-2">
                          {pathOf(material.categoryId)
                            .map((c) => c.name)
                            .join(" › ")}
                        </td>
                        <td className="px-3 py-2 text-text-2">{material.unit}</td>
                        <td className="px-4 py-2 text-caption text-text-3">
                          {[...material.synonyms, ...material.spellings].join(" · ") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="grid gap-2 lg:hidden">
                {rows.map((material) => (
                  <li key={material.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(material.id)}
                      className="focus-ring card-surface block w-full px-4 py-3 text-left"
                    >
                      <span className="block text-[14px] font-medium text-text">
                        {material.name}
                      </span>
                      <span className="mt-0.5 block text-caption text-text-3">
                        {pathOf(material.categoryId)
                          .map((c) => c.name)
                          .join(" › ")}{" "}
                        · {material.unit}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      {openId && (
        <MaterialDrawer
          materialId={openId}
          canEdit={canEdit}
          onEdit={(material) => {
            setOpenId(null);
            setEditing(material);
          }}
          onOpenChange={() => setOpenId(null)}
        />
      )}
      {/* На телефоне действие шапки — в нижней панели, как на остальных экранах */}
      {canEdit && (
        <MobileActionBar>
          {/* Одно главное действие: журнал открывается кнопкой у поиска, загрузка — с компьютера */}
          <Button variant="accent" onClick={() => setEditing(null)}>
            <Plus className="size-4" /> Добавить материал
          </Button>
        </MobileActionBar>
      )}
      <MaterialForm
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
        material={editing ?? null}
      />
      <CategoryDialog
        open={category !== undefined}
        onOpenChange={(open) => !open && setCategory(undefined)}
        category={category?.item ?? null}
        parentId={category?.parentId ?? null}
      />
      <ImportMaterialsDialog open={importOpen} onOpenChange={setImportOpen} />
      {journalOpen && <JournalDrawer onOpenChange={() => setJournalOpen(false)} />}
    </>
  );
}

function CategoryButton({
  label,
  hint,
  count,
  active,
  onClick,
  onEdit,
}: {
  label: string;
  hint?: string | undefined;
  count: number;
  active: boolean;
  onClick: () => void;
  /** Правка видна сразу, а не по наведению: на телефоне наведения нет */
  onEdit?: () => void;
}) {
  return (
    <div className="flex items-center">
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? "true" : undefined}
        className={cn(
          "focus-ring grid min-h-11 flex-1 grid-cols-[1fr_auto] items-center gap-x-2 rounded-[var(--r-sm)] px-3 py-1 text-left text-[13px] lg:min-h-9",
          active ? "bg-surface-2 text-text" : "text-text-2 hover:bg-surface-2",
        )}
      >
        <span>{label}</span>
        <span className="tnum text-text-3">{fmtNum(count)}</span>
        {hint && <span className="col-span-2 text-[11px] text-text-3">{hint}</span>}
      </button>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Изменить категорию «${label}»`}
          className="focus-ring grid size-11 shrink-0 place-items-center rounded-[var(--r-sm)] text-text-3 hover:bg-surface-2 hover:text-text-2 lg:size-8"
        >
          <Pencil className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}

/** Журнал справочников (ADR-023, п. 6): кто, когда и что изменил — включая загрузки из файла */
function JournalDrawer({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const rows = useQuery(queries.catalogChanges()).data ?? [];
  const { employeeName } = useDirectory();
  return (
    <EntityDrawer
      open
      onOpenChange={onOpenChange}
      title="Журнал справочников"
      subtitle="Изменения категорий и поставщиков, свежие сверху"
    >
      {rows.length === 0 ? (
        <p className="text-[13px] text-text-2">
          Записей пока нет: журнал наполняется при правке категорий и поставщиков.
        </p>
      ) : (
        <ol className="grid gap-3 text-[13px]">
          {rows.map((row) => (
            <li key={row.id} className="grid gap-0.5">
              <span className="text-text">
                {row.entity === "category" ? "Категория" : "Поставщик"} «{row.entityName}» —{" "}
                {row.field}
              </span>
              {(row.before !== null || row.after !== null) && (
                <span className="text-caption text-text-2">
                  {row.before ?? "—"} → {row.after ?? "—"}
                </span>
              )}
              <span className="text-caption text-text-3">
                {employeeName(row.by)}, {fmtDateTime(row.at)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </EntityDrawer>
  );
}

/** Карточка материала: категория, характеристики, синонимы, где используется, история */
function MaterialDrawer({
  materialId,
  canEdit,
  onEdit,
  onOpenChange,
}: {
  materialId: string;
  canEdit: boolean;
  onEdit: (material: Material) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const card = useQuery(queries.material(materialId)).data;
  const { employeeName } = useDirectory();
  if (!card) return null;
  const { material } = card;
  return (
    <EntityDrawer
      open
      onOpenChange={onOpenChange}
      title={material.name}
      subtitle={`${card.path.join(" › ")} · ${material.unit}`}
      footer={
        canEdit ? (
          <Button size="sm" variant="secondary" onClick={() => onEdit(material)}>
            <Pencil className="size-4" /> Изменить
          </Button>
        ) : undefined
      }
    >
      <div className="grid gap-5 text-[13px]">
        <p className="text-text-2">
          Сопоставлено позиций: <b className="tnum text-text">{fmtNum(card.usage.positions)}</b> на{" "}
          <b className="tnum text-text">{fmtNum(card.usage.projects)}</b>{" "}
          {card.usage.projects === 1 ? "объекте" : "объектах"}
        </p>
        <section aria-labelledby="mat-chars">
          <h3 id="mat-chars" className="mb-2 font-medium text-text">
            Характеристики
          </h3>
          {material.characteristics.length ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {material.characteristics.map((item) => (
                <div key={item.label} className="contents">
                  <dt className="text-text-2">{item.label}</dt>
                  <dd className="text-text">{item.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-text-2">Не заданы</p>
          )}
        </section>
        <section aria-labelledby="mat-names">
          <h3 id="mat-names" className="mb-2 font-medium text-text">
            Как ещё называют
          </h3>
          <p className="text-text-2">Синонимы</p>
          <p className="text-text">{material.synonyms.join(" · ") || "—"}</p>
          <p className="mt-2 text-text-2">Типичные написания в проектах</p>
          <p className="text-text">{material.spellings.join(" · ") || "—"}</p>
        </section>
        <section aria-labelledby="mat-history">
          <h3 id="mat-history" className="mb-2 font-medium text-text">
            История изменений
          </h3>
          <ol className="grid gap-2">
            {card.changes.map((change) => (
              <li key={change.id} className="grid gap-0.5">
                <span className="text-text">
                  {change.field === "создан" ? "Материал создан" : `Изменено: ${change.field}`}
                </span>
                <span className="text-caption text-text-2">
                  {employeeName(change.actorId)}, {fmtDateTime(change.at)}
                </span>
                {change.field !== "создан" && (
                  <span className="text-caption text-text-2">
                    {change.before ?? "—"} → {change.after ?? "—"}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </EntityDrawer>
  );
}
