import { beforeEach, describe, expect, test } from "bun:test";
import { createDemoRepositories, resetDemo } from "@/adapters/demo";
import type { Repositories } from "@/ports";

/**
 * Ведение справочников с экрана (ADR-023). Проверяется то, что ломает справочник заказчика
 * молча: кольцо в дереве категорий, дубль материала при загрузке и «частично прошло» без
 * объяснения.
 */

const actor = { actorId: "e-dorohov" };
let repos: Repositories;

beforeEach(() => {
  resetDemo();
  repos = createDemoRepositories({ persist: false, simulate: false });
});

describe("дерево категорий", () => {
  test("категория создаётся и переименовывается, изменение попадает в журнал", async () => {
    const created = await repos.catalog.saveCategory(
      { id: null, name: "Герметики и мастики", parentId: null, rules: ["герметик"] },
      actor,
    );
    expect(created.id).toBeTruthy();
    const renamed = await repos.catalog.saveCategory(
      { id: created.id, name: "Герметики", parentId: null, rules: ["герметик"] },
      actor,
    );
    expect(renamed.name).toBe("Герметики");
    const categories = await repos.catalog.categories();
    expect(categories.some((item) => item.name === "Герметики")).toBe(true);

    // Журнал — единственный способ ответить «кто это переименовал»: свежие записи сверху
    const journal = await repos.catalog.catalogChanges();
    expect(journal[0]).toMatchObject({
      entity: "category",
      field: "название",
      before: "Герметики и мастики",
      after: "Герметики",
      by: "e-dorohov",
    });
    expect(journal.some((row) => row.field === "создана")).toBe(true);
  });

  test("перенос внутрь собственного поддерева отклоняется", async () => {
    const parent = await repos.catalog.saveCategory(
      { id: null, name: "Кровля", parentId: null, rules: [] },
      actor,
    );
    const child = await repos.catalog.saveCategory(
      { id: null, name: "Парапеты кровли", parentId: parent.id, rules: [] },
      actor,
    );
    await expect(
      repos.catalog.saveCategory(
        { id: parent.id, name: "Кровля", parentId: child.id, rules: [] },
        actor,
      ),
    ).rejects.toThrow(/внутрь самой себя/u);
  });

  test("повтор названия отклоняется: дерево не держит две одинаковые категории", async () => {
    await expect(
      repos.catalog.saveCategory(
        { id: null, name: "Подконструкция", parentId: null, rules: [] },
        actor,
      ),
    ).rejects.toThrow(/уже есть/u);
  });
});

describe("поставщик", () => {
  test("заводится с регионом и категориями — без них он не попадёт в запрос", async () => {
    const categories = await repos.catalog.categories();
    const created = await repos.catalog.saveSupplier(
      {
        id: null,
        name: "СтройКрепёж СПб",
        inn: "7801234567",
        region: "Санкт-Петербург",
        categories: [categories[0]!.id],
        contactName: "Иванов И. И.",
        phone: "+7 812 000-00-00",
        email: "sales@krepezh.ru",
      },
      actor,
    );
    expect(created.id).toBeTruthy();
    const suppliers = await repos.procurement.suppliers();
    const saved = suppliers.find((item) => item.supplier.id === created.id);
    expect(saved?.profile.region).toBe("Санкт-Петербург");
    expect(saved?.profile.categories).toEqual([categories[0]!.id]);
  });

  test("контрагент с таким названием уже есть — отказ, а не второй такой же", async () => {
    const categories = await repos.catalog.categories();
    await expect(
      repos.catalog.saveSupplier(
        {
          id: null,
          name: "Фасад-Комплект",
          inn: null,
          region: "Москва",
          categories: [categories[0]!.id],
          contactName: "Петров П.",
          phone: "+7 495 000-00-00",
          email: "p@fk.ru",
        },
        actor,
      ),
    ).rejects.toThrow(/уже есть/u);
  });
});

describe("загрузка номенклатуры", () => {
  test("новое добавляется, известное обновляется, непринятое названо строкой и причиной", async () => {
    const before = (await repos.catalog.categories()).length;
    expect(before).toBeGreaterThan(0);
    const report = await repos.catalog.importMaterials(
      {
        rows: [
          { name: "Саморез кровельный 4,8×35", unit: "шт", category: "Подконструкция" },
          { name: "", unit: "шт", category: "Подконструкция" },
          { name: "Лента бутиловая", unit: "м", category: "Такой категории нет" },
          {
            name: "Заклёпка вытяжная 4×12",
            unit: "шт",
            category: "Подконструкция",
            characteristics: "Материал: алюминий; Цвет: RAL 7024",
          },
        ],
      },
      actor,
    );
    expect(report.added).toBe(2);
    expect(report.refused).toEqual([
      { row: 3, reason: "пустое наименование" },
      { row: 4, reason: "нет категории «Такой категории нет»" },
    ]);
  });

  test("повтор в файле не создаёт второй материал: обновляется тот же", async () => {
    const twice = {
      rows: [
        { name: "Нащельник угловой 50×50", unit: "шт", category: "Подконструкция" },
        { name: "Нащельник угловой 50×50", unit: "шт", category: "Подконструкция" },
      ],
    };
    const report = await repos.catalog.importMaterials(twice, actor);
    expect(report.added).toBe(1);
    expect(report.updated).toBe(1);
    expect(report.refused).toEqual([]);
  });
});
