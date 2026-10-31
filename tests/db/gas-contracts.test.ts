import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createGasOpsDemo } from "@/adapters/gas-ops/demo";
import { createGasDocsDemo } from "@/adapters/gas-ops/docs-demo";
import { createGasSupplyDemo } from "@/adapters/gas-ops/supply-demo";
import { rowsToSnapshot, snapshotToRows } from "@/adapters/gas-ops/db-codec";
import { getServerSnapshot, getSnapshot, resetState } from "@/adapters/gas-ops/state";
import { gasTables } from "@/contracts/gas";
import type { GasOpsSnapshot } from "@/ports/gas-ops";
import { gasMigration } from "../../scripts/gas-ddl";

/**
 * Контракты модулей сервиса v1 (ADR-060): строки снимка проходят схемы таблиц, снимок
 * переводится в строки и обратно без потерь, миграция в репозитории равна выводу генератора.
 */

/** null и «нет ключа» у необязательных полей записи значат одно и то же: в базе это NULL */
function normalize(snapshot: GasOpsSnapshot): GasOpsSnapshot {
  return JSON.parse(
    JSON.stringify({
      ...snapshot,
      entries: snapshot.entries.map((e) =>
        Object.fromEntries(Object.entries(e).filter(([, v]) => v !== null)),
      ),
    }),
  );
}

function validate(snapshot: GasOpsSnapshot) {
  const rows = snapshotToRows(snapshot);
  const problems: string[] = [];
  for (const def of gasTables) {
    const list = rows[def.meta.name];
    if (!list) {
      problems.push(`${def.meta.name}: кодек не отдаёт строк`);
      continue;
    }
    list.forEach((row, index) => {
      const result = def.schema.safeParse(row);
      if (!result.success) {
        problems.push(
          `${def.meta.name}[${index}]: ${result.error.issues[0]?.path.join(".")} ${result.error.issues[0]?.message}`,
        );
      }
    });
  }
  expect(Object.keys(rows).sort()).toEqual(gasTables.map((t) => t.meta.name).sort());
  return problems;
}

/** Снимок после путей S5 и S6: заявка, предложение, приёмка, акт до реестра, журнал */
async function walked(): Promise<GasOpsSnapshot> {
  resetState();
  const ops = createGasOpsDemo();
  const supply = createGasSupplyDemo();
  const docs = createGasDocsDemo();
  await ops.signIn("u-prorab");
  const req = await supply.createRequest({
    objectId: "obj-m1",
    lines: [{ itemId: "nm-pipe-20", qty: 12 }],
    needBy: null,
    priority: "urgent",
    photos: ["фото.jpg"],
    clientKey: "k-1",
  });
  const line = req.lines[0]!.id;
  await ops.signIn("u-supply");
  await supply.moveRequest({ id: req.id, to: "in-work" });
  await supply.moveRequest({ id: req.id, to: "waiting-offers" });
  const offer = await supply.addOffer({
    requestId: req.id,
    supplierId: "sp-a",
    lines: [{ lineId: line, price: "199,90" }],
    leadDays: "2",
    delivery: "1500",
    terms: null,
    fileName: "кп.pdf",
  });
  await supply.chooseOffer({ requestId: req.id, offerId: offer.id });
  await supply.markOrdered({ requestId: req.id });
  await supply.markInTransit({ requestId: req.id, eta: getSnapshot().today });
  await ops.signIn("u-prorab");
  await supply.acceptDelivery({
    requestId: req.id,
    lines: [{ lineId: line, qty: 10 }],
    withDiscrepancy: true,
    discrepancy: "Не довезли 2 м",
    invoicePhoto: "накладная.jpg",
    certificates: [{ lineId: line, fileName: "серт.pdf" }],
    clientKey: "k-2",
  });
  await docs.confirmVolume({ workId: "wr-2" });
  await ops.signIn("u-pto");
  const [act] = await docs.createDocs({ objectId: "obj-m1", workIds: ["wr-1", "wr-2"] });
  await docs.editField({ docId: act!.id, key: "extra", value: "Сведения" });
  await docs.moveDoc({ docId: act!.id, to: "review" });
  await docs.moveDoc({ docId: act!.id, to: "draft", reason: "Уточнить" });
  await docs.moveDoc({ docId: act!.id, to: "review" });
  await docs.moveDoc({ docId: act!.id, to: "signing" });
  await docs.moveDoc({ docId: act!.id, to: "signed", scan: "скан.pdf" });
  await docs.closeRegistry({ objectId: "obj-m1" });
  await docs.acceptJournal({ objectId: "obj-m1", workId: "wr-1", text: "Запись", conditions: "" });
  return getSnapshot();
}

describe("контракты модулей сервиса v1", () => {
  test("исходный набор: каждая строка проходит схему своей таблицы", () => {
    expect(validate(getServerSnapshot())).toEqual([]);
  });

  test("исходный набор: снимок → строки → снимок без потерь", () => {
    const seed = getServerSnapshot();
    expect(normalize(rowsToSnapshot(snapshotToRows(seed)))).toEqual(normalize(seed));
  });

  test("после путей снабжения и документов: схемы и обратный перевод", async () => {
    const after = await walked();
    expect(validate(after)).toEqual([]);
    expect(normalize(rowsToSnapshot(snapshotToRows(after)))).toEqual(normalize(after));
    // В снимке действительно есть то, что проверяем
    expect(after.supply.receipts.at(-1)?.clientKey).toBe("k-2");
    expect(after.docs.registries).toHaveLength(1);
    expect(after.docs.docs.find((d) => d.status === "registry")?.version).toBe(2);
  });

  test("миграция в репозитории равна выводу генератора из контрактов", () => {
    const file = readFileSync("db/migrations/20261031100000_gas_service_v1.sql", "utf8");
    expect(file).toBe(gasMigration());
  });

  test("ключи отправки с телефона уникальны в базе: индексы есть у записей, заявок, приёмок", () => {
    for (const name of ["gas_time_entries", "gas_supply_requests", "gas_receipts"]) {
      const def = gasTables.find((t) => t.meta.name === name)!;
      expect(
        def.meta.indexes.some((i) => i.unique && i.columns[0] === "clientKey"),
        name,
      ).toBe(true);
    }
  });
});
