import { afterAll, describe, expect, test } from "bun:test";
import { tables as contractTables } from "@/contracts";
import { buildSnapshot, snapshotTables } from "@/adapters/fixtures/views";
import { fixtureTables, type TableRows } from "@/adapters/fixtures/tables";
import { createDemoRepositories, resetDemo } from "@/adapters/demo";
import { getState } from "@/adapters/demo/state";
import { stopSimulator } from "@/adapters/demo/simulator";
import { checklistFor } from "@/domain/deliveries";
import { allPositions } from "../consistency/screens";

/**
 * Таблицы ↔ состояние (ADR-005, п. 5): адаптер PostgreSQL строит состояние тем же сборщиком
 * и пишет обратно `snapshotTables`. Если обратное преобразование что-то теряет, база молча
 * потеряет данные — этот тест такого не пропустит.
 */
const byKey = (name: string, rows: Record<string, unknown>[]) => {
  const pk = contractTables.find((def) => def.meta.name === name)!.meta.primaryKey;
  return [...rows]
    .map((row) => JSON.stringify(row, Object.keys(row).sort()))
    .sort()
    .map((text, index) => ({ index, text, pk }));
};

function expectSameTables(actual: TableRows, expected: TableRows) {
  for (const name of Object.keys(expected) as (keyof TableRows)[]) {
    const a = byKey(name, actual[name] as Record<string, unknown>[]).map((row) => row.text);
    const e = byKey(name, expected[name] as Record<string, unknown>[]).map((row) => row.text);
    expect({ table: name, rows: a }).toEqual({ table: name, rows: e });
  }
}

afterAll(() => stopSimulator());

describe("таблицы ↔ состояние", () => {
  test("фикстуры: состояние → таблицы → состояние без потерь", () => {
    // Сравниваются состояния, а не таблицы фикстур: в фикстурах поставленное количество
    // позиций не записано, его досчитывает сборщик по актам приёмки (withDeliveries)
    const state = buildSnapshot(fixtureTables);
    const again = buildSnapshot(snapshotTables(state));
    expect(JSON.parse(JSON.stringify(again))).toEqual(JSON.parse(JSON.stringify(state)));
  });

  test("таблицы из состояния — неподвижная точка: второй проход ничего не меняет", () => {
    const tables = snapshotTables(buildSnapshot(fixtureTables));
    expectSameTables(snapshotTables(buildSnapshot(tables)), tables);
  });

  test("в каждой таблице схемы есть данные или она явно пуста", () => {
    const names = new Set(Object.keys(fixtureTables));
    expect(contractTables.map((def) => def.meta.name).filter((name) => !names.has(name))).toEqual(
      [],
    );
  });

  test("после действий демо: состояние, собранное из своих таблиц, равно самому состоянию", async () => {
    resetDemo();
    const repos = createDemoRepositories({ persist: false });
    const actor = { actorId: "e-sokolov" };
    const positions = await allPositions(repos, "p-korona");
    await repos.positions.confirm(
      {
        ids: positions
          .filter((p) => p.review === "pending")
          .slice(0, 3)
          .map((p) => p.id),
      },
      actor,
    );
    const card = await repos.procurement.request("sr-323");
    await repos.procurement.chooseSupplier(
      {
        requestId: "sr-323",
        supplierId: card!.comparison.columns.find((c) => c.offerId)!.supplierId,
        reason: "Лучшая цена и полный объём по спецификации",
        approvedBy: "e-sokolov",
      },
      actor,
    );
    const delivery = (await repos.procurement.deliveries("p-korona")).find(
      (d) => d.requestId === "sr-323",
    )!;
    await repos.procurement.moveDelivery(
      { deliveryId: delivery.id, status: "arrived", note: null },
      actor,
    );
    await repos.procurement.acceptDelivery(
      {
        deliveryId: delivery.id,
        result: "accepted_with_remarks",
        lines: delivery.items.map((l) => ({
          lineId: l.id,
          acceptedQty: l.qty - 5,
          remark: "Недостача",
        })),
        checklist: checklistFor(["tile"]).map((i) => ({
          id: i.id,
          label: i.label,
          ok: true,
          note: null,
        })),
        photos: [{ dataUrl: "data:image/jpeg;base64,/9j/4AAQ", caption: null }],
        reason: null,
        confirmed: true,
      },
      actor,
    );
    const [material] = await repos.positions.materials();
    await repos.catalog.saveMaterial({ ...material!, synonyms: ["Проверочный синоним"] }, actor);

    const { version: _v, jobs: _j, ...state } = getState();
    const rebuilt = buildSnapshot(snapshotTables(state));
    expect(JSON.parse(JSON.stringify(rebuilt))).toEqual(JSON.parse(JSON.stringify(state)));
  });
});
