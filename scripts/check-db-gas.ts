/**
 * Модули сервиса v1 в PostgreSQL (ADR-060): часть `check:db` на временной базе после миграций.
 *
 * 1. Сид: исходный набор пишется хранилищем базы и читается обратно без потерь.
 * 2. Паритет: путь снабжения и документов (S5 → S6) выполняется портами над вкладкой
 *    и над базой; ответы и итоговые снимки совпадают с точностью до новых ключей и минут.
 * 3. Одновременная запись: две заявки из двух хранилищ одной базы — обе на месте, номера разные.
 */
import { createGasDocsDemo } from "../src/adapters/gas-ops/docs-demo";
import { createGasSupplyDemo } from "../src/adapters/gas-ops/supply-demo";
import { createGasDbStore } from "../src/adapters/gas-ops/db-store";
import { getServerSnapshot, resetState } from "../src/adapters/gas-ops/state";
import { demoStore, retrying, type GasStore } from "../src/adapters/gas-ops/store";
import type { Driver } from "../src/adapters/db/driver";
import type { GasOpsSnapshot } from "../src/ports/gas-ops";

/** Новые ключи и минуты действий различаются между прогонами: в сравнении заменяются метками */
function masked(value: unknown): string {
  return JSON.stringify(normalize(value))
    .replace(/\b(zk|zl|of|rc|ed|df|rg|jr|aud|sp)-[a-z0-9]{6,}\b/g, "$1-*")
    .replace(/T\d\d:\d\d:00/g, "T*");
}

/** Порядок ключей jsonb и null у необязательных полей записи времени не значимы */
function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
        .map((k) => [k, normalize((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

function entriesNormalized(s: GasOpsSnapshot): GasOpsSnapshot {
  return {
    ...s,
    entries: s.entries.map(
      (e) =>
        Object.fromEntries(
          Object.entries(e).filter(([, v]) => v !== null),
        ) as GasOpsSnapshot["entries"][number],
    ),
  };
}

async function walk(store: GasStore): Promise<unknown[]> {
  const as = (actorId: string) => store.update((s) => ({ ...s, actorId }));
  const supply = createGasSupplyDemo(store);
  const docs = createGasDocsDemo(store);
  const answers: unknown[] = [];
  const step = async <T>(run: () => Promise<T>) => {
    try {
      const value = await run();
      answers.push(value);
      return value;
    } catch (error) {
      answers.push({ error: (error as { code?: string }).code ?? String(error) });
      return null;
    }
  };

  await as("u-pto");
  const created = await step(() => docs.createDocs({ objectId: "obj-m1", workIds: ["wr-1"] }));
  const act = created?.[0];
  await step(() => docs.moveDoc({ docId: act!.id, to: "review" }));
  // Нет сертификата: на подпись не уходит
  await step(() => docs.moveDoc({ docId: act!.id, to: "signing" }));

  await as("u-prorab");
  const req = await step(() =>
    supply.createRequest({
      objectId: "obj-m1",
      lines: [{ itemId: "nm-pipe-20", qty: "12" }],
      needBy: null,
      priority: "normal",
      photos: [],
      clientKey: "check-1",
    }),
  );
  // Повтор с тем же ключом: та же заявка
  await step(() =>
    supply.createRequest({
      objectId: "obj-m1",
      lines: [{ itemId: "nm-pipe-20", qty: "12" }],
      needBy: null,
      priority: "normal",
      photos: [],
      clientKey: "check-1",
    }),
  );
  const line = req!.lines[0]!.id;
  await as("u-supply");
  await step(() => supply.moveRequest({ id: req!.id, to: "in-work" }));
  await step(() => supply.moveRequest({ id: req!.id, to: "waiting-offers" }));
  const offer = await step(() =>
    supply.addOffer({
      requestId: req!.id,
      supplierId: "sp-b",
      lines: [{ lineId: line, price: "200" }],
      leadDays: "2",
      delivery: "",
      terms: null,
      fileName: null,
    }),
  );
  await step(() => supply.chooseOffer({ requestId: req!.id, offerId: offer!.id }));
  await step(() => supply.markOrdered({ requestId: req!.id }));
  await step(() => supply.markInTransit({ requestId: req!.id, eta: "2026-10-08" }));
  await as("u-prorab");
  await step(() =>
    supply.acceptDelivery({
      requestId: req!.id,
      lines: [{ lineId: line, qty: 12 }],
      withDiscrepancy: false,
      discrepancy: null,
      invoicePhoto: null,
      certificates: [{ lineId: line, fileName: "серт.pdf" }],
      clientKey: "check-2",
    }),
  );
  // Чужое действие: прораб не меняет статус акта
  await step(() => docs.moveDoc({ docId: act!.id, to: "signing" }));

  await as("u-pto");
  await step(() => docs.moveDoc({ docId: act!.id, to: "signing" }));
  await step(() => docs.moveDoc({ docId: act!.id, to: "signed", scan: "скан.pdf" }));
  await step(() => docs.closeRegistry({ objectId: "obj-m1" }));
  await step(() => docs.closeRegistry({ objectId: "obj-m1" }));
  await step(() =>
    docs.acceptJournal({ objectId: "obj-m1", workId: "wr-1", text: "Запись", conditions: "" }),
  );
  answers.push(entriesNormalized(await store.read()));
  return answers;
}

export async function checkGas(db: Driver): Promise<boolean> {
  let failed = false;
  const seed = getServerSnapshot();
  const store = createGasDbStore(db);

  const started = performance.now();
  await store.seed(seed);
  const back = await store.read();
  if (masked(entriesNormalized(back)) !== masked(entriesNormalized(seed))) {
    console.error("✗ модули v1: исходный набор после записи и чтения отличается");
    failed = true;
  } else {
    console.log(
      `✓ модули v1: сид записан и прочитан без потерь за ${Math.round(performance.now() - started)} мс ` +
        `(записей времени ${back.entries.length}, заявок ${back.supply.requests.length}, работ ${back.docs.works.length})`,
    );
  }

  resetState();
  const demo = await walk(demoStore);
  const base = await walk(store);
  const mismatch = demo.findIndex((answer, i) => masked(answer) !== masked(base[i]));
  if (mismatch !== -1 || demo.length !== base.length) {
    console.error(`✗ модули v1: паритет вкладки и базы расходится на шаге ${mismatch + 1}`);
    console.error(`  вкладка: ${masked(demo[mismatch]).slice(0, 400)}`);
    console.error(`  база:    ${masked(base[mismatch]).slice(0, 400)}`);
    failed = true;
  } else {
    const refused = demo.filter((a) => a && typeof a === "object" && "error" in a).length;
    console.log(
      `✓ модули v1: путь снабжения и документов одинаков во вкладке и в базе (${demo.length - 1} шагов, отказов по правилам ${refused})`,
    );
  }

  // Две записи из двух процессов: вторая перечитывает снимок после конфликта версии
  const a = createGasDbStore(db);
  const b = createGasDbStore(db);
  await a.update((s) => ({ ...s, actorId: "u-prorab" }));
  const input = (key: string) => ({
    objectId: "obj-m1",
    lines: [{ itemId: "nm-valve", qty: 1 }],
    needBy: null,
    priority: "normal" as const,
    photos: [],
    clientKey: key,
  });
  const [first, second] = await Promise.all([
    retrying(createGasSupplyDemo(a)).createRequest(input("race-a")),
    retrying(createGasSupplyDemo(b)).createRequest(input("race-b")),
  ]);
  const after = await store.read();
  const both = ["race-a", "race-b"].every((k) =>
    after.supply.requests.some((r) => r.clientKey === k),
  );
  if (!both || first.number === second.number) {
    console.error(
      `✗ модули v1: одновременная запись потеряла заявку или дала одинаковые номера (${first.number}, ${second.number})`,
    );
    failed = true;
  } else {
    console.log(
      `✓ модули v1: одновременная запись из двух хранилищ, обе заявки на месте (${first.number}, ${second.number})`,
    );
  }
  return failed;
}
