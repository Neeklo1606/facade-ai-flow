import { beforeEach, describe, expect, test } from "bun:test";
import { createGasOpsDemo } from "@/adapters/gas-ops/demo";
import { createGasDocsDemo } from "@/adapters/gas-ops/docs-demo";
import { createGasSupplyDemo } from "@/adapters/gas-ops/supply-demo";
import { getSnapshot, resetState } from "@/adapters/gas-ops/state";
import { buildDocsSeed } from "@/data/mock/gas-docs-seed";
import { buildSupplySeed } from "@/data/mock/gas-supply-seed";
import {
  actPrint,
  actSections,
  canEditDoc,
  canMoveDoc,
  completenessOf,
  docsMetrics,
  docView,
  isDraftMark,
  journalDrafts,
  moveCheck,
  movedDoc,
  proposePackage,
  readinessByObject,
  registryCheck,
  siteNeeds,
  type DocsContext,
  type ExecDoc,
} from "@/domain/gas-ops/exec-docs";
import { DocsError } from "@/ports/gas-docs";

/**
 * Исполнительная документация v1 (ADR-058): комплектность акта, источники полей, статусы
 * и версии документа, реестр версиями, журнал работ и права через порт.
 */

const TODAY = "2026-10-28";
const OBJECTS = [
  { id: "obj-m1", label: "Демо, 101 - котел", code: "ОБ-101" },
  { id: "obj-m2", label: "Демо, 102 - котел, насос", code: "ОБ-102" },
];

function ctx(
  over: Partial<DocsContext["docs"]> = {},
  supply = buildSupplySeed(TODAY),
): DocsContext {
  return { docs: { ...buildDocsSeed(TODAY), ...over }, supply, objects: OBJECTS };
}

function doc(over: Partial<ExecDoc> = {}): ExecDoc {
  return {
    id: "d1",
    objectId: "obj-m1",
    type: "aosr",
    number: 1,
    workId: "wr-1",
    version: 1,
    status: "draft",
    overrides: {},
    remarks: [],
    history: [],
    scan: null,
    signedAt: null,
    createdAt: `${TODAY}T09:00:00`,
    ...over,
  };
}

const work = (c: DocsContext, id: string) => c.docs.works.find((w) => w.id === id)!;

describe("комплектность акта", () => {
  test("ОБ-101, футляры: не хватает только сертификата на трубу, ответственный снабжение", () => {
    const c = ctx();
    const result = completenessOf(c, work(c, "wr-1"));
    expect(result.issues.map((i) => i.code)).toEqual(["no-certificate"]);
    expect(result.issues[0]).toMatchObject({
      text: "Нет сертификата: Труба стальная ВГП 20 мм",
      owner: "Снабжение",
      target: { kind: "certificate", itemId: "nm-pipe-20" },
    });
    // объём, материал, схема, три представителя
    expect(result.checks).toBe(6);
    expect(result.percent).toBe(83);
    expect(result.complete).toBe(false);
  });

  test("сертификат из принятой поставки закрывает строку и становится источником поля", () => {
    const supply = buildSupplySeed(TODAY);
    supply.requests.push({
      ...supply.requests[0]!,
      id: "zk-x",
      number: "ЗК-00009",
      objectId: "obj-m1",
      lines: [{ id: "lx", itemId: "nm-pipe-20", qty: 50 }],
      status: "partial",
    });
    supply.receipts.push({
      id: "rc-x",
      requestId: "zk-x",
      lines: [{ lineId: "lx", qty: 50 }],
      result: "accepted",
      discrepancy: null,
      invoicePhoto: null,
      certificates: [{ lineId: "lx", fileName: "серт_вгп20.pdf" }],
      acceptedBy: "Прораб",
      at: `${TODAY}T11:00:00`,
      clientKey: null,
    });
    const c = ctx({}, supply);
    expect(completenessOf(c, work(c, "wr-1")).complete).toBe(true);
    const material = actSections(c, doc())
      .flatMap((s) => s.fields)
      .find((f) => f.key === "material:nm-pipe-20")!;
    expect(material.source).toEqual({
      kind: "delivery",
      label: "Поставка ЗК-00009, 28.10.2026: серт_вгп20.pdf",
    });
  });

  test("поставка без сертификата строку не закрывает; загруженный файл закрывает", () => {
    const c = ctx({
      files: [
        ...buildDocsSeed(TODAY).files,
        {
          id: "f",
          objectId: "obj-m1",
          kind: "certificate",
          fileName: "серт.pdf",
          workId: null,
          itemId: "nm-pipe-20",
          participantId: null,
          docId: null,
          by: "ПТО",
          at: `${TODAY}T10:00:00`,
        },
      ],
    });
    expect(completenessOf(c, work(c, "wr-1")).complete).toBe(true);
    // Сертификат другого объекта не подходит
    const other = ctx({
      files: [
        {
          id: "f",
          objectId: "obj-m2",
          kind: "certificate",
          fileName: "серт.pdf",
          workId: null,
          itemId: "nm-pipe-20",
          participantId: null,
          docId: null,
          by: "ПТО",
          at: `${TODAY}T10:00:00`,
        },
      ],
    });
    expect(completenessOf(other, work(other, "wr-1")).issues.map((i) => i.code)).toContain(
      "no-certificate",
    );
  });

  test("ОБ-101, дымоход: объём не подтверждён, нет схемы, испытаний и сертификата", () => {
    const c = ctx();
    const result = completenessOf(c, work(c, "wr-2"));
    expect(result.issues.map((i) => [i.code, i.owner])).toEqual([
      ["volume-unconfirmed", "Прораб"],
      ["no-certificate", "Снабжение"],
      ["no-scheme", "Прораб"],
      ["no-tests", "Прораб"],
    ]);
  });

  test("ОБ-102: нет схемы узла 3 и приказа представителя строительного контроля", () => {
    const c = ctx();
    const result = completenessOf(c, work(c, "wr-3"));
    expect(result.issues.map((i) => i.code)).toEqual(["no-scheme", "no-authority"]);
    expect(result.issues[0]!.ask).toBe(
      "Сфотографируйте схему: Прокладка газопровода в футлярах через стены и перекрытия, Узел 3, ввод в дом",
    );
    expect(result.issues[1]).toMatchObject({
      owner: "ПТО",
      target: { kind: "authority", participantId: "pt-obj-m2-bc" },
    });
  });

  test("нет участника обязательной стороны — блокер, проектировщик не обязателен", () => {
    const c = ctx({
      participants: buildDocsSeed(TODAY).participants.filter((p) => p.id !== "pt-obj-m1-cc"),
    });
    const codes = completenessOf(c, work(c, "wr-1")).issues.map((i) => i.code);
    expect(codes).toContain("no-participant");
    expect(codes.filter((x) => x === "no-participant")).toHaveLength(1);
  });
});

describe("поля акта: у каждого значения источник", () => {
  test("работы, даты и проект из данных объекта; пустые поля помечены", () => {
    const fields = actSections(ctx(), doc()).flatMap((s) => s.fields);
    const by = (key: string) => fields.find((f) => f.key === key)!;
    expect(by("works").value).toBe(
      "Прокладка газопровода в футлярах через стены и перекрытия, Кухня, ввод через стену: 12\u00a0м",
    );
    expect(by("works").source).toEqual({
      kind: "record",
      label: "Запись РО-0001, объём подтвердил Прораб",
    });
    expect(by("start").value).toBe("23.10.2026");
    expect(by("end").value).toBe("24.10.2026");
    expect(by("project").source?.kind).toBe("project");
    expect(by("material:nm-pipe-20").value).toContain("документа о качестве нет");
    expect(by("material:nm-pipe-20").source?.kind).toBe("record");
    expect(by("extra").empty).toBe(true);
    for (const f of fields.filter((x) => !x.empty)) expect(f.source).not.toBeNull();
  });

  test("исправление ПТО заменяет значение и становится источником", () => {
    const d = doc({
      overrides: { next: { value: "Отделка", by: "ПТО", at: `${TODAY}T12:00:00` } },
    });
    const next = actSections(ctx(), d)
      .flatMap((s) => s.fields)
      .find((f) => f.key === "next")!;
    expect(next.value).toBe("Отделка");
    expect(next.source).toEqual({ kind: "manual", label: "Исправил ПТО, 28.10.2026" });
  });

  test("файл: метка «Черновик» до подписи, имя с версией", () => {
    const c = ctx();
    expect(actPrint(c, doc()).fileName).toBe("АОСР-1_ОБ-101_v1_черновик.docx");
    expect(actPrint(c, doc()).fileNameAscii).toBe("AOSR-1_OB-101_v1_draft.docx");
    expect(actPrint(c, doc({ status: "signed", version: 2 })).fileName).toBe(
      "АОСР-1_ОБ-101_v2.docx",
    );
    expect(actPrint(c, doc({ status: "signing" })).draft).toBe(true);
    expect(isDraftMark("registry")).toBe(false);
  });
});

describe("статусы и версии документа", () => {
  const complete = { issues: [], checks: 1, passed: 1, percent: 100, complete: true };
  const incomplete = completenessOf(ctx(), work(ctx(), "wr-1"));

  test("переходы: черновик → проверка → подпись → подписан; «в реестре» только закрытием", () => {
    expect(canMoveDoc("draft", "review")).toBe(true);
    expect(canMoveDoc("review", "signing")).toBe(true);
    expect(canMoveDoc("signing", "signed")).toBe(true);
    expect(canMoveDoc("draft", "signed")).toBe(false);
    expect(canMoveDoc("signed", "registry")).toBe(false);
    expect(canMoveDoc("registry", "draft")).toBe(false);
    expect(canEditDoc("review")).toBe(true);
    expect(canEditDoc("signing")).toBe(false);
  });

  test("на подпись только полный комплект; «подписан» только со сканом; возврат с причиной", () => {
    expect(moveCheck(doc({ status: "review" }), "signing", incomplete, {})).toMatchObject({
      ok: false,
      code: "incomplete",
      message: "Комплект неполный: 1 строка в проверке.",
    });
    expect(moveCheck(doc({ status: "review" }), "signing", complete, {})).toEqual({ ok: true });
    expect(moveCheck(doc({ status: "signing" }), "signed", complete, { scan: " " })).toMatchObject({
      code: "scan-required",
    });
    expect(moveCheck(doc({ status: "review" }), "draft", complete, { reason: "" })).toMatchObject({
      code: "reason-required",
    });
  });

  test("возврат с замечанием открывает новую версию и хранит замечание к прежней", () => {
    const back = movedDoc(doc({ status: "review" }), "draft", `${TODAY}T13:00:00`, "ПТО", {
      reason: "Уточнить оси",
    });
    expect(back.version).toBe(2);
    expect(back.remarks).toEqual([
      { at: `${TODAY}T13:00:00`, by: "ПТО", reason: "Уточнить оси", version: 1 },
    ]);
    const signed = movedDoc(
      doc({ status: "signing", version: 2 }),
      "signed",
      `${TODAY}T15:00:00`,
      "ПТО",
      {
        scan: "скан.pdf",
      },
    );
    expect(signed).toMatchObject({ version: 2, scan: "скан.pdf", signedAt: `${TODAY}T15:00:00` });
  });

  test("показатели ПТО: к проверке, не хватает данных, на подписи, подписано за неделю", () => {
    const c = ctx();
    const views = [
      doc({ id: "a", status: "review" }),
      doc({ id: "b", status: "draft", workId: "wr-2" }),
      doc({ id: "c", status: "signing" }),
      doc({ id: "d", status: "signed", signedAt: "2026-10-22T10:00:00" }),
      doc({ id: "e", status: "registry", signedAt: "2026-10-21T10:00:00" }),
    ].map((d) => docView(c, d));
    expect(docsMetrics(views, TODAY)).toEqual({
      review: 1,
      incomplete: 2,
      signing: 1,
      signedWeek: 1,
    });
  });
});

describe("пакет, реестр, журнал, сводки", () => {
  test("пакет за период: по работам объекта, с уже созданным актом", () => {
    const c = ctx({ docs: [doc()] });
    const all = proposePackage(c, { objectId: "obj-m1", from: null, to: null, zone: null });
    expect(all.map((p) => [p.work.number, p.existing?.id ?? null])).toEqual([
      ["РО-0001", "d1"],
      ["РО-0002", null],
    ]);
    expect(
      proposePackage(c, { objectId: "obj-m1", from: "2026-10-26", to: null, zone: null }).map(
        (p) => p.work.number,
      ),
    ).toEqual(["РО-0002"]);
    expect(
      proposePackage(c, { objectId: "obj-m1", from: null, to: null, zone: "Котельная" }),
    ).toHaveLength(1);
  });

  test("реестр: версия из подписанных; без новых подписанных версия не создаётся", () => {
    const base = buildDocsSeed(TODAY);
    expect(registryCheck({ ...base, docs: [doc({ status: "review" })] }, "obj-m1")).toMatchObject({
      ok: false,
      code: "nothing-new",
    });
    const first = registryCheck({ ...base, docs: [doc({ status: "signed" })] }, "obj-m1");
    expect(first).toMatchObject({ ok: true, version: 1 });
    const closed = {
      ...base,
      docs: [doc({ status: "registry" })],
      registries: [
        { id: "r1", objectId: "obj-m1", version: 1, closedAt: TODAY, closedBy: "ПТО", rows: [] },
      ],
    };
    expect(registryCheck(closed, "obj-m1").ok).toBe(false);
    const second = registryCheck(
      { ...closed, docs: [...closed.docs, doc({ id: "d2", number: 2, status: "signed" })] },
      "obj-m1",
    );
    expect(second).toMatchObject({ ok: true, version: 2 });
    if (second.ok) expect(second.docs.map((d) => d.id)).toEqual(["d1", "d2"]);
  });

  test("журнал: черновики только по подтверждённому объёму и без принятой записи", () => {
    const c = ctx();
    const drafts = journalDrafts(c, "obj-m1");
    expect(drafts.map((d) => d.workId)).toEqual(["wr-1"]);
    expect(drafts[0]).toMatchObject({
      dates: "23.10.2026 – 24.10.2026",
      representative: "Прораб, Прораб объекта",
    });
    expect(drafts[0]!.text).toContain("Материалы: Труба стальная ВГП 20 мм 12\u00a0м");
  });

  test("готовность ИД по объектам и блокеры; прорабу только его строки", () => {
    const c = ctx();
    const ready = readinessByObject(c);
    const m1 = ready.find((r) => r.objectId === "obj-m1")!;
    // wr-1: 5 из 6, wr-2: 3 из 8 (объём, материал, схема, испытания, три участника)
    expect(m1.percent).toBe(Math.floor((8 / 13) * 100));
    expect(m1.blockers).toHaveLength(5);
    const needs = siteNeeds(c, new Set(["obj-m1"]));
    expect(needs.map((n) => n.code)).toEqual(["volume-unconfirmed", "no-scheme", "no-tests"]);
  });
});

describe("через порт: права и путь до реестра", () => {
  const ops = createGasOpsDemo();
  const docs = createGasDocsDemo();
  const supply = createGasSupplyDemo();

  beforeEach(() => {
    resetState();
  });

  test("пакет и статусы ведёт ПТО; прораб и снабженец не могут", async () => {
    await ops.signIn("u-prorab");
    await expect(docs.createDocs({ objectId: "obj-m1", workIds: ["wr-1"] })).rejects.toBeInstanceOf(
      DocsError,
    );
    await ops.signIn("u-supply");
    await expect(docs.createDocs({ objectId: "obj-m1", workIds: ["wr-1"] })).rejects.toMatchObject({
      code: "not-allowed",
    });
    await ops.signIn("u-pto");
    const [created] = await docs.createDocs({ objectId: "obj-m1", workIds: ["wr-1"] });
    expect(created).toMatchObject({ number: 1, status: "draft", version: 1 });
    // Повтор по той же работе второй акт не создаёт
    expect(await docs.createDocs({ objectId: "obj-m1", workIds: ["wr-1"] })).toEqual([]);
  });

  test("прораб подтверждает объём и грузит схему только по своим объектам", async () => {
    await ops.signIn("u-prorab");
    await docs.confirmVolume({ workId: "wr-2" });
    await docs.addFile({
      objectId: "obj-m2",
      kind: "scheme",
      fileName: "узел3.jpg",
      workId: "wr-3",
    });
    await expect(
      docs.addFile({
        objectId: "obj-m2",
        kind: "authority",
        fileName: "приказ.pdf",
        participantId: "pt-obj-m2-bc",
      }),
    ).rejects.toMatchObject({ code: "not-allowed" });
    const s = getSnapshot();
    expect(s.docs.works.find((w) => w.id === "wr-2")!.volumeConfirmedBy).toBe("Прораб");
    const c = { docs: s.docs, supply: s.supply, objects: s.objects };
    expect(
      completenessOf(
        c,
        s.docs.works.find((w) => w.id === "wr-3")!,
      ).issues.map((i) => i.code),
    ).toEqual(["no-authority"]);
  });

  test("путь: акт → нет сертификата → поставка с сертификатом → подпись → реестр v1", async () => {
    await ops.signIn("u-pto");
    const [act] = await docs.createDocs({ objectId: "obj-m1", workIds: ["wr-1"] });
    await docs.moveDoc({ docId: act!.id, to: "review" });
    await expect(docs.moveDoc({ docId: act!.id, to: "signing" })).rejects.toMatchObject({
      code: "incomplete",
    });

    // Снабжение везёт трубу, прораб принимает поставку с сертификатом
    await ops.signIn("u-prorab");
    const req = await supply.createRequest({
      objectId: "obj-m1",
      lines: [{ itemId: "nm-pipe-20", qty: 12 }],
      needBy: null,
      priority: "normal",
      photos: [],
      clientKey: null,
    });
    const line = req.lines[0]!.id;
    await ops.signIn("u-supply");
    await supply.moveRequest({ id: req.id, to: "in-work" });
    await supply.moveRequest({ id: req.id, to: "waiting-offers" });
    const offer = await supply.addOffer({
      requestId: req.id,
      supplierId: "sp-a",
      lines: [{ lineId: line, price: "200" }],
      leadDays: "2",
      delivery: "",
      terms: null,
      fileName: null,
    });
    await supply.chooseOffer({ requestId: req.id, offerId: offer.id });
    await supply.markOrdered({ requestId: req.id });
    await supply.markInTransit({ requestId: req.id, eta: getSnapshot().today });
    await ops.signIn("u-prorab");
    await supply.acceptDelivery({
      requestId: req.id,
      lines: [{ lineId: line, qty: 12 }],
      withDiscrepancy: false,
      discrepancy: null,
      invoicePhoto: null,
      certificates: [{ lineId: line, fileName: "серт_вгп20.pdf" }],
      clientKey: null,
    });

    await ops.signIn("u-pto");
    await docs.moveDoc({ docId: act!.id, to: "signing" });
    await expect(
      docs.editField({ docId: act!.id, key: "extra", value: "x" }),
    ).rejects.toMatchObject({ code: "locked" });
    await expect(docs.moveDoc({ docId: act!.id, to: "signed" })).rejects.toMatchObject({
      code: "scan-required",
    });
    await docs.moveDoc({ docId: act!.id, to: "signed", scan: "АОСР-1_скан.pdf" });
    const registry = await docs.closeRegistry({ objectId: "obj-m1" });
    expect(registry.version).toBe(1);
    expect(registry.rows.map((r) => r.title)).toEqual([
      "Акт освидетельствования скрытых работ АОСР №\u00a01",
    ]);
    expect(getSnapshot().docs.docs.find((d) => d.id === act!.id)!.status).toBe("registry");
    await expect(docs.closeRegistry({ objectId: "obj-m1" })).rejects.toMatchObject({
      code: "nothing-new",
    });
  });

  test("журнал: ПТО принимает черновик один раз", async () => {
    await ops.signIn("u-pto");
    const a = await docs.acceptJournal({
      objectId: "obj-m1",
      workId: "wr-1",
      text: "Текст",
      conditions: "",
    });
    const b = await docs.acceptJournal({
      objectId: "obj-m1",
      workId: "wr-1",
      text: "Текст",
      conditions: "",
    });
    expect(b.id).toBe(a.id);
    await expect(
      docs.acceptJournal({ objectId: "obj-m1", workId: "wr-2", text: "Текст", conditions: "" }),
    ).rejects.toMatchObject({ code: "not-found" });
  });
});

describe("файл акта docx", () => {
  test("черновик: метка в колонтитуле и первой строке; подписанный без метки", async () => {
    const { buildActDocx } = await import("@/adapters/gas-ops/exec-docs-files");
    const JSZip = (await import("jszip")).default;
    const c = ctx();
    const draft = await JSZip.loadAsync(await buildActDocx(actPrint(c, doc())));
    const xml = await draft.file("word/document.xml")!.async("string");
    expect(xml).toContain("Черновик. Не подписан, юридической силы не имеет.");
    expect(xml).toContain("headerReference");
    expect(xml).toContain("Прокладка газопровода в футлярах");
    expect(await draft.file("word/header1.xml")!.async("string")).toContain("Черновик");
    const signed = await JSZip.loadAsync(
      await buildActDocx(actPrint(c, doc({ status: "signed" }))),
    );
    const signedXml = await signed.file("word/document.xml")!.async("string");
    expect(signedXml).not.toContain("Черновик.");
    expect(signedXml).not.toContain("headerReference");
  });
});
