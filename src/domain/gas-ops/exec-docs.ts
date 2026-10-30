/**
 * Исполнительная документация v1 (ADR-058): участники, основания актов, комплектность,
 * статусы и версии документа, реестр и журнал работ.
 *
 * Система готовит черновики, подписывают люди. Состав полей АОСР взят из приложения 3
 * к составу ИД (приказ Минстроя России от 16.05.2023 № 344/пр), столбцы журнала из
 * раздела 3 и раздела 5 общего журнала работ (приказ от 02.12.2022 № 1026/пр). Текст
 * приказов прочитан пересказом страницы, поэтому формулировки подписаны «сверить с приказом»,
 * а применимость формы подтверждает специалист заказчика.
 */
import type { DataSource } from "./model";
import { acceptedMaterials, fmtQty, itemOf, type SupplyState } from "./supply";

/** Пометка у каждой формы: формулировки сверяет специалист, юридической силы черновик не имеет */
export const FORM_CHECK_NOTE = "Черновик формы, сверить с приказом № 344/пр";
export const JOURNAL_CHECK_NOTE = "Черновик записи, сверить с приказом № 1026/пр";

// ---------- Участники ----------

export type ParticipantSide =
  "customer-control" | "builder" | "builder-control" | "designer" | "performer";

export const SIDE_LABEL: Record<ParticipantSide, string> = {
  "customer-control":
    "Представитель застройщика или технического заказчика по строительному контролю",
  builder: "Представитель лица, осуществляющего строительство",
  "builder-control": "Представитель лица, осуществляющего строительство, по строительному контролю",
  designer: "Представитель лица, осуществляющего подготовку проектной документации",
  performer: "Представитель лица, выполнившего работы",
};

/** Порядок представителей и подписей в акте */
export const SIDE_ORDER: readonly ParticipantSide[] = [
  "customer-control",
  "builder",
  "builder-control",
  "designer",
  "performer",
];

/** Проектировщик и исполнитель по договору подписывают, когда привлечены: их отсутствие не блокер */
export const REQUIRED_SIDES: readonly ParticipantSide[] = [
  "customer-control",
  "builder",
  "builder-control",
];

export interface Participant {
  id: string;
  objectId: string;
  side: ParticipantSide;
  org: string;
  position: string;
  person: string;
  /** Документ о представительстве (приказ, доверенность): без него акт не подписать */
  authority: { title: string; fileName: string | null } | null;
  /** Идентификационный номер в НРС: только там, где требуется членство в СРО */
  nrsId: string | null;
  source: DataSource;
}

// ---------- Проект, виды работ, записи ----------

export interface ProjectSheet {
  id: string;
  objectId: string;
  cipher: string;
  section: string;
  sheets: string;
  title: string;
  author: string;
  source: DataSource;
}

export type ActType = "aosr" | "aook";
export type DocType = ActType | "ojr" | "registry";

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  aosr: "Акт освидетельствования скрытых работ",
  aook: "Акт освидетельствования ответственных конструкций",
  ojr: "Запись общего журнала работ",
  registry: "Реестр исполнительной документации",
};

export const ACT_SHORT: Record<ActType, string> = { aosr: "АОСР", aook: "АООК" };
const ACT_ASCII: Record<ActType, string> = { aosr: "AOSR", aook: "AOOK" };

/** Справочник «вид работы → какой акт»: что нужно акту кроме объёма и материалов */
export interface WorkKind {
  id: string;
  name: string;
  unit: string;
  act: ActType;
  needsScheme: boolean;
  needsTests: boolean;
  /** Пункт 7 акта: какие работы разрешаются после освидетельствования */
  next: string;
  source: DataSource;
}

/** Выполненная работа на объекте: объём, даты, материалы. Источник основания акта */
export interface WorkRecord {
  id: string;
  /** «РО-0001»: номер записи объёма, как его видит прораб */
  number: string;
  objectId: string;
  /** Захватка или место: оси, этаж, помещение */
  zone: string | null;
  kindId: string;
  volume: number;
  from: string;
  to: string;
  materials: { itemId: string; qty: number }[];
  sheetIds: string[];
  reportedBy: string;
  /** Кто подтвердил объём. Пока пусто, акт неполный: объём не подтверждён */
  volumeConfirmedBy: string | null;
  volumeConfirmedAt: string | null;
  source: DataSource;
}

export type FileKind = "scheme" | "tests" | "certificate" | "authority" | "scan";

export const FILE_KIND_LABEL: Record<FileKind, string> = {
  scheme: "Исполнительная схема",
  tests: "Результаты испытаний",
  certificate: "Сертификат",
  authority: "Документ о представительстве",
  scan: "Скан подписанного",
};

/** Файл основания. В демо хранится только имя файла */
export interface DocFile {
  id: string;
  objectId: string;
  kind: FileKind;
  fileName: string;
  workId: string | null;
  itemId: string | null;
  participantId: string | null;
  docId: string | null;
  by: string;
  at: string;
}

// ---------- Документ ----------

export type DocStatus = "draft" | "review" | "signing" | "signed" | "registry";

export const DOC_STATUS_LABEL: Record<DocStatus, string> = {
  draft: "Черновик",
  review: "На проверке ПТО",
  signing: "Передан на подпись",
  signed: "Подписан",
  registry: "В реестре",
};

/** Переходы руками. «В реестре» ставит только закрытие реестра */
const NEXT: Record<DocStatus, readonly DocStatus[]> = {
  draft: ["review"],
  review: ["draft", "signing"],
  signing: ["draft", "signed"],
  signed: [],
  registry: [],
};

export function canMoveDoc(from: DocStatus, to: DocStatus): boolean {
  return NEXT[from].includes(to);
}

/** Поля правятся, пока документ не ушёл на подпись */
export function canEditDoc(status: DocStatus): boolean {
  return status === "draft" || status === "review";
}

/** Метка «Черновик» в файле снимается только у подписанного */
export function isDraftMark(status: DocStatus): boolean {
  return status !== "signed" && status !== "registry";
}

export interface Remark {
  at: string;
  by: string;
  reason: string;
  /** Версия, к которой относится замечание */
  version: number;
}

export interface DocHistoryItem {
  at: string;
  actor: string;
  status: DocStatus;
  note: string | null;
}

export interface FieldOverride {
  value: string;
  by: string;
  at: string;
}

export interface ExecDoc {
  id: string;
  objectId: string;
  type: ActType;
  /** Порядковый номер акта своего типа на объекте */
  number: number;
  workId: string;
  /** Растёт, когда документ возвращают с замечанием: новая редакция */
  version: number;
  status: DocStatus;
  overrides: Record<string, FieldOverride>;
  remarks: Remark[];
  history: DocHistoryItem[];
  scan: string | null;
  signedAt: string | null;
  createdAt: string;
}

export interface RegistryRow {
  docId: string;
  title: string;
  details: string;
  signedAt: string | null;
  signers: string;
}

export interface RegistryVersion {
  id: string;
  objectId: string;
  version: number;
  closedAt: string;
  closedBy: string;
  rows: RegistryRow[];
}

export interface JournalEntry {
  id: string;
  objectId: string;
  workId: string;
  dates: string;
  conditions: string;
  text: string;
  representative: string;
  acceptedBy: string;
  acceptedAt: string;
}

export interface DocsState {
  participants: Participant[];
  sheets: ProjectSheet[];
  kinds: WorkKind[];
  works: WorkRecord[];
  files: DocFile[];
  docs: ExecDoc[];
  registries: RegistryVersion[];
  journal: JournalEntry[];
}

/** Что нужно правилам документов кроме своего состояния: объекты и снабжение */
export interface DocsContext {
  docs: DocsState;
  supply: Pick<SupplyState, "items" | "requests" | "receipts">;
  objects: readonly { id: string; label: string; code: string }[];
}

// ---------- Форматирование ----------

export function ruDate(iso: string | null): string {
  return iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "";
}

export function docTitle(doc: Pick<ExecDoc, "type" | "number">): string {
  return `${ACT_SHORT[doc.type]} №\u00a0${doc.number}`;
}

function objectOf(ctx: DocsContext, id: string) {
  return ctx.objects.find((o) => o.id === id) ?? null;
}

function objectText(ctx: DocsContext, id: string): string {
  const o = objectOf(ctx, id);
  return o ? `${o.code}, ${o.label}` : "Объект не найден";
}

export function kindOf(ctx: DocsContext, id: string): WorkKind | null {
  return ctx.docs.kinds.find((k) => k.id === id) ?? null;
}

export function workOf(ctx: DocsContext, id: string): WorkRecord | null {
  return ctx.docs.works.find((w) => w.id === id) ?? null;
}

function representative(p: Participant): string {
  const parts = [p.position, p.person, p.org];
  if (p.nrsId) parts.push(`номер в НРС ${p.nrsId}`);
  return parts.join(", ");
}

// ---------- Основания и комплектность ----------

export type SourceKind =
  "record" | "delivery" | "file" | "project" | "participant" | "kind" | "manual" | "object";

export interface FieldSource {
  kind: SourceKind;
  label: string;
}

export interface ActField {
  key: string;
  label: string;
  value: string;
  source: FieldSource | null;
  /** Пусто и нужно заполнить: подсветка в редакторе, а не блокер комплектности */
  empty: boolean;
}

export interface ActSection {
  title: string;
  fields: ActField[];
}

export type IssueCode =
  | "volume-unconfirmed"
  | "no-certificate"
  | "no-scheme"
  | "no-tests"
  | "no-authority"
  | "no-participant";

export type IssueOwner = "Прораб" | "Снабжение" | "ПТО";

/** Что «Добавить» открывает у строки комплектности */
export type IssueTarget =
  | { kind: "volume"; workId: string }
  | { kind: "certificate"; itemId: string }
  | { kind: "scheme"; workId: string }
  | { kind: "tests"; workId: string }
  | { kind: "authority"; participantId: string }
  | { kind: "participant"; side: ParticipantSide };

export interface Issue {
  code: IssueCode;
  text: string;
  /** Строка для прораба на телефоне: действием, а не названием проверки */
  ask: string;
  owner: IssueOwner;
  target: IssueTarget;
}

/** Сертификат на материал объекта: из принятой поставки или загруженный файлом */
export function certificateOf(
  ctx: DocsContext,
  objectId: string,
  itemId: string,
): FieldSource | null {
  const delivered = acceptedMaterials(ctx.supply, new Set([objectId])).find(
    (m) => m.itemId === itemId && m.certificates.length > 0,
  );
  if (delivered) {
    return {
      kind: "delivery",
      label: `Поставка ${delivered.requestNumber}, ${ruDate(delivered.at)}: ${delivered.certificates.join(", ")}`,
    };
  }
  const file = ctx.docs.files.find(
    (f) => f.kind === "certificate" && f.objectId === objectId && f.itemId === itemId,
  );
  return file ? { kind: "file", label: `Файл ${file.fileName}, загрузил ${file.by}` } : null;
}

function workFile(ctx: DocsContext, work: WorkRecord, kind: "scheme" | "tests"): DocFile | null {
  return ctx.docs.files.find((f) => f.kind === kind && f.workId === work.id) ?? null;
}

export function participantsOf(ctx: DocsContext, objectId: string): Participant[] {
  return ctx.docs.participants
    .filter((p) => p.objectId === objectId)
    .sort((a, b) => SIDE_ORDER.indexOf(a.side) - SIDE_ORDER.indexOf(b.side));
}

function authorityFile(ctx: DocsContext, p: Participant): string | null {
  return (
    p.authority?.fileName ??
    ctx.docs.files.find((f) => f.kind === "authority" && f.participantId === p.id)?.fileName ??
    null
  );
}

export interface Completeness {
  issues: Issue[];
  checks: number;
  passed: number;
  /** Целые проценты: 100 только когда блокеров нет */
  percent: number;
  complete: boolean;
}

/** Проверка комплектности акта по работе: что мешает передать его на подпись */
export function completenessOf(ctx: DocsContext, work: WorkRecord): Completeness {
  const kind = kindOf(ctx, work.kindId);
  const issues: Issue[] = [];
  let checks = 0;
  const kindName = kind?.name ?? "Вид работ не найден";
  const place = work.zone ? `, ${work.zone}` : "";

  checks += 1;
  if (!work.volumeConfirmedBy) {
    issues.push({
      code: "volume-unconfirmed",
      text: `Объём не подтверждён: ${work.number}, ${fmtQty(work.volume)}\u00a0${kind?.unit ?? ""}`.trim(),
      ask: `Подтвердите объём: ${kindName}${place}, ${fmtQty(work.volume)}\u00a0${kind?.unit ?? ""}`.trim(),
      owner: "Прораб",
      target: { kind: "volume", workId: work.id },
    });
  }

  for (const m of work.materials) {
    checks += 1;
    if (!certificateOf(ctx, work.objectId, m.itemId)) {
      const name = itemOf(ctx.supply.items, m.itemId)?.name ?? "Позиция не найдена";
      issues.push({
        code: "no-certificate",
        text: `Нет сертификата: ${name}`,
        ask: `Сфотографируйте сертификат: ${name}`,
        owner: "Снабжение",
        target: { kind: "certificate", itemId: m.itemId },
      });
    }
  }

  if (kind?.needsScheme) {
    checks += 1;
    if (!workFile(ctx, work, "scheme")) {
      issues.push({
        code: "no-scheme",
        text: `Нет исполнительной схемы: ${kindName}${place}`,
        ask: `Сфотографируйте схему: ${kindName}${place}`,
        owner: "Прораб",
        target: { kind: "scheme", workId: work.id },
      });
    }
  }

  if (kind?.needsTests) {
    checks += 1;
    if (!workFile(ctx, work, "tests")) {
      issues.push({
        code: "no-tests",
        text: `Нет результатов испытаний: ${kindName}${place}`,
        ask: `Сфотографируйте протокол испытаний: ${kindName}${place}`,
        owner: "Прораб",
        target: { kind: "tests", workId: work.id },
      });
    }
  }

  const people = participantsOf(ctx, work.objectId);
  for (const side of REQUIRED_SIDES) {
    checks += 1;
    const p = people.find((x) => x.side === side);
    if (!p) {
      issues.push({
        code: "no-participant",
        text: `Не указан участник: ${SIDE_LABEL[side].toLowerCase()}`,
        ask: `Не указан участник: ${SIDE_LABEL[side].toLowerCase()}`,
        owner: "ПТО",
        target: { kind: "participant", side },
      });
    } else if (!authorityFile(ctx, p)) {
      issues.push({
        code: "no-authority",
        text: `Нет приказа представителя: ${p.position}, ${p.person}`,
        ask: `Нет приказа представителя: ${p.position}, ${p.person}`,
        owner: "ПТО",
        target: { kind: "authority", participantId: p.id },
      });
    }
  }

  const passed = checks - issues.length;
  return {
    issues,
    checks,
    passed,
    percent: checks === 0 ? 100 : Math.floor((passed / checks) * 100),
    complete: issues.length === 0,
  };
}

// ---------- Поля акта ----------

function field(key: string, label: string, value: string, source: FieldSource | null): ActField {
  return { key, label, value, source, empty: value.trim() === "" };
}

/**
 * Поля акта из данных объекта. У каждого значения источник: запись объёма, поставка, файл,
 * проект, участник. Исправление ПТО заменяет значение и становится его источником
 */
export function actSections(ctx: DocsContext, doc: ExecDoc): ActSection[] {
  const work = workOf(ctx, doc.workId);
  const kind = work ? kindOf(ctx, work.kindId) : null;
  const sheets = work ? ctx.docs.sheets.filter((s) => work.sheetIds.includes(s.id)) : [];
  const people = participantsOf(ctx, doc.objectId);
  const record: FieldSource | null = work
    ? {
        kind: "record",
        label: `Запись ${work.number}${work.volumeConfirmedBy ? `, объём подтвердил ${work.volumeConfirmedBy}` : ", объём не подтверждён"}`,
      }
    : null;
  const project: FieldSource | null = sheets.length
    ? { kind: "project", label: `Проект ${sheets.map((s) => s.cipher).join(", ")}` }
    : null;

  const sections: ActSection[] = [
    {
      title: "Объект и участники",
      fields: [
        field("object", "Объект капитального строительства", objectText(ctx, doc.objectId), {
          kind: "object",
          label: "Справочник объектов",
        }),
        ...SIDE_ORDER.filter(
          (side) => REQUIRED_SIDES.includes(side) || people.some((p) => p.side === side),
        ).map((side) => {
          const p = people.find((x) => x.side === side);
          const authority = p ? authorityFile(ctx, p) : null;
          return field(
            `side:${side}`,
            SIDE_LABEL[side],
            p
              ? `${representative(p)}${p.authority ? `; ${p.authority.title}` : ""}${authority ? "" : "; документа о представительстве нет"}`
              : "",
            p ? { kind: "participant", label: `Участники объекта: ${p.org}` } : null,
          );
        }),
      ],
    },
    {
      title: "Освидетельствование",
      fields: [
        field(
          "works",
          "1. К освидетельствованию предъявлены работы",
          work && kind
            ? `${kind.name}${work.zone ? `, ${work.zone}` : ""}: ${fmtQty(work.volume)}\u00a0${kind.unit}`
            : "",
          record,
        ),
        field(
          "project",
          "2. Работы выполнены по проектной документации",
          sheets
            .map((s) => `${s.cipher}, раздел ${s.section}, листы ${s.sheets}, ${s.author}`)
            .join("; "),
          project,
        ),
        ...(work?.materials ?? []).map((m, i) => {
          const item = itemOf(ctx.supply.items, m.itemId);
          const cert = certificateOf(ctx, doc.objectId, m.itemId);
          return field(
            `material:${m.itemId}`,
            i === 0 ? "3. При выполнении работ применены" : "",
            `${item?.name ?? "Позиция не найдена"}, ${fmtQty(m.qty)}\u00a0${item?.unit ?? ""}${cert ? "" : "; документа о качестве нет"}`,
            // Количество из записи объёма; документ о качестве — из поставки или файла
            cert ?? record,
          );
        }),
        field(
          "proofs",
          "4. Предъявлены документы, подтверждающие соответствие работ",
          work
            ? (["scheme", "tests"] as const)
                .map((k) => workFile(ctx, work, k))
                .filter((f): f is DocFile => f !== null)
                .map((f) => `${FILE_KIND_LABEL[f.kind]}: ${f.fileName}`)
                .join("; ")
            : "",
          work && workFile(ctx, work, "scheme")
            ? {
                kind: "file",
                label: `Файлы основания, загрузил ${workFile(ctx, work, "scheme")!.by}`,
              }
            : null,
        ),
        field("start", "5. Дата начала работ", ruDate(work?.from ?? null), record),
        field("end", "5. Дата окончания работ", ruDate(work?.to ?? null), record),
        field(
          "norms",
          "6. Работы выполнены в соответствии с",
          sheets.length ? `Проектной документацией ${sheets.map((s) => s.cipher).join(", ")}` : "",
          project,
        ),
        field(
          "next",
          "7. Разрешается производство последующих работ",
          kind?.next ?? "",
          kind ? { kind: "kind", label: "Справочник видов работ" } : null,
        ),
      ],
    },
    {
      title: "Дополнительно",
      fields: [
        field("extra", "Дополнительные сведения", "", null),
        field("copies", "Акт составлен в экземплярах", "", null),
      ],
    },
  ];

  // Исправление человека поверх значения из данных: источник становится «исправил»
  return sections.map((s) => ({
    ...s,
    fields: s.fields.map((f) => {
      const o = doc.overrides[f.key];
      return o
        ? {
            ...f,
            value: o.value,
            empty: o.value.trim() === "",
            source: { kind: "manual", label: `Исправил ${o.by}, ${ruDate(o.at.slice(0, 10))}` },
          }
        : f;
    }),
  }));
}

/** Ключи полей, которые можно исправить руками: все, кроме объекта */
export function editableKey(key: string): boolean {
  return key !== "object";
}

// ---------- Пакет ----------

export interface Proposal {
  work: WorkRecord;
  kind: WorkKind | null;
  act: ActType;
  /** Акт по этой работе уже есть: второй не создаётся */
  existing: ExecDoc | null;
  completeness: Completeness;
}

export interface PackageFilter {
  objectId: string;
  from: string | null;
  to: string | null;
  zone: string | null;
}

/**
 * Список актов по работам объекта за период или захватку. Работа без подтверждённого объёма
 * не прячется: она в пакете со строкой «объём не подтверждён», чтобы её не забыли
 */
export function proposePackage(ctx: DocsContext, filter: PackageFilter): Proposal[] {
  return ctx.docs.works
    .filter((w) => w.objectId === filter.objectId)
    .filter((w) => !filter.from || w.to >= filter.from)
    .filter((w) => !filter.to || w.from <= filter.to)
    .filter((w) => !filter.zone || w.zone === filter.zone)
    .sort((a, b) => a.from.localeCompare(b.from) || a.number.localeCompare(b.number))
    .map((work) => {
      const kind = kindOf(ctx, work.kindId);
      return {
        work,
        kind,
        act: kind?.act ?? "aosr",
        existing: ctx.docs.docs.find((d) => d.workId === work.id) ?? null,
        completeness: completenessOf(ctx, work),
      };
    });
}

export function zonesOf(docs: DocsState, objectId: string): string[] {
  return [
    ...new Set(docs.works.filter((w) => w.objectId === objectId && w.zone).map((w) => w.zone!)),
  ];
}

export function nextDocNumber(docs: readonly ExecDoc[], objectId: string, type: ActType): number {
  return (
    docs
      .filter((d) => d.objectId === objectId && d.type === type)
      .reduce((max, d) => Math.max(max, d.number), 0) + 1
  );
}

// ---------- Переходы ----------

export type MoveCheck =
  | { ok: true }
  | {
      ok: false;
      code: "bad-move" | "incomplete" | "reason-required" | "scan-required";
      message: string;
    };

/** Правило перехода документа: на подпись только полный комплект, «подписан» только со сканом */
export function moveCheck(
  doc: ExecDoc,
  to: DocStatus,
  completeness: Completeness,
  input: { reason?: string | null; scan?: string | null },
): MoveCheck {
  if (!canMoveDoc(doc.status, to)) {
    return {
      ok: false,
      code: "bad-move",
      message: `Из статуса «${DOC_STATUS_LABEL[doc.status]}» нельзя перейти в «${DOC_STATUS_LABEL[to]}».`,
    };
  }
  if (to === "draft" && !input.reason?.trim()) {
    return { ok: false, code: "reason-required", message: "Напишите замечание: что исправить." };
  }
  if (to === "signing" && !completeness.complete) {
    return {
      ok: false,
      code: "incomplete",
      message: `Комплект неполный: ${completeness.issues.length} ${plural(completeness.issues.length, "строка", "строки", "строк")} в проверке.`,
    };
  }
  if (to === "signed" && !input.scan?.trim()) {
    return { ok: false, code: "scan-required", message: "Загрузите скан подписанного акта." };
  }
  return { ok: true };
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** Документ после перехода: возврат с замечанием открывает новую редакцию */
export function movedDoc(
  doc: ExecDoc,
  to: DocStatus,
  at: string,
  actor: string,
  input: { reason?: string | null; scan?: string | null },
): ExecDoc {
  const reason = input.reason?.trim() || null;
  return {
    ...doc,
    status: to,
    version: to === "draft" ? doc.version + 1 : doc.version,
    remarks:
      to === "draft"
        ? [...doc.remarks, { at, by: actor, reason: reason!, version: doc.version }]
        : doc.remarks,
    scan: to === "signed" ? input.scan!.trim() : doc.scan,
    signedAt: to === "signed" ? at : doc.signedAt,
    history: [...doc.history, { at, actor, status: to, note: reason }],
  };
}

// ---------- Реестр ----------

function signersOf(ctx: DocsContext, objectId: string): string {
  return participantsOf(ctx, objectId)
    .map((p) => `${p.position}, ${p.person}`)
    .join("; ");
}

export function registryRowOf(ctx: DocsContext, doc: ExecDoc): RegistryRow {
  const work = workOf(ctx, doc.workId);
  const kind = work ? kindOf(ctx, work.kindId) : null;
  return {
    docId: doc.id,
    title: `${DOC_TYPE_LABEL[doc.type]} ${docTitle(doc)}`,
    details: kind && work ? `${kind.name}${work.zone ? `, ${work.zone}` : ""}` : "",
    signedAt: doc.signedAt ? doc.signedAt.slice(0, 10) : null,
    signers: signersOf(ctx, doc.objectId),
  };
}

export function registryVersions(docs: DocsState, objectId: string): RegistryVersion[] {
  return docs.registries
    .filter((r) => r.objectId === objectId)
    .sort((a, b) => b.version - a.version);
}

export type RegistryCheck =
  | { ok: true; version: number; docs: ExecDoc[] }
  | { ok: false; code: "nothing-new"; message: string };

/**
 * Закрыть реестр версией: в версию входят все подписанные документы объекта. Если с прошлой
 * версии новых подписанных нет, новая версия не создаётся: она повторила бы прежнюю
 */
export function registryCheck(docs: DocsState, objectId: string): RegistryCheck {
  const signed = docs.docs.filter(
    (d) => d.objectId === objectId && (d.status === "signed" || d.status === "registry"),
  );
  if (!signed.some((d) => d.status === "signed")) {
    return {
      ok: false,
      code: "nothing-new",
      message: "Новых подписанных документов нет: версия реестра повторила бы прежнюю.",
    };
  }
  const last = registryVersions(docs, objectId)[0];
  return {
    ok: true,
    version: (last?.version ?? 0) + 1,
    docs: signed.sort((a, b) => a.type.localeCompare(b.type) || a.number - b.number),
  };
}

/** Столбцы реестра: как раздел 5 общего журнала «Перечень исполнительной документации» */
export const REGISTRY_HEADERS = [
  "№",
  "Наименование документа",
  "Вид работ и место",
  "Дата подписания",
  "Подписали (должность, ФИО)",
  "Статус",
] as const;

export function registrySheetRows(
  ctx: DocsContext,
  rows: readonly RegistryRow[],
  status: (docId: string) => string,
): (string | number)[][] {
  return rows.map((r, i) => [
    i + 1,
    r.title,
    r.details,
    ruDate(r.signedAt),
    r.signers,
    status(r.docId),
  ]);
}

// ---------- Журнал работ ----------

export interface JournalDraft {
  workId: string;
  dates: string;
  text: string;
  representative: string;
  source: FieldSource;
}

/** Даты работы одной строкой: один день или «с … по …» */
export function workDates(work: Pick<WorkRecord, "from" | "to">): string {
  return work.from === work.to ? ruDate(work.from) : `${ruDate(work.from)} – ${ruDate(work.to)}`;
}

/**
 * Черновики записей раздела 3 журнала: только по работам с подтверждённым объёмом, по которым
 * записи ещё нет. Дневной разбивки объёма в данных нет, поэтому запись идёт на период работы
 */
export function journalDrafts(ctx: DocsContext, objectId: string): JournalDraft[] {
  const builder = participantsOf(ctx, objectId).find((p) => p.side === "builder");
  return ctx.docs.works
    .filter((w) => w.objectId === objectId && w.volumeConfirmedBy)
    .filter((w) => !ctx.docs.journal.some((j) => j.workId === w.id))
    .sort((a, b) => a.from.localeCompare(b.from))
    .map((work) => {
      const kind = kindOf(ctx, work.kindId);
      const materials = work.materials
        .map((m) => {
          const item = itemOf(ctx.supply.items, m.itemId);
          return `${item?.name ?? "позиция не найдена"} ${fmtQty(m.qty)}\u00a0${item?.unit ?? ""}`.trim();
        })
        .join(", ");
      return {
        workId: work.id,
        dates: workDates(work),
        text: `${kind?.name ?? "Вид работ не найден"}${work.zone ? `, ${work.zone}` : ""}: ${fmtQty(work.volume)}\u00a0${kind?.unit ?? ""}${materials ? `. Материалы: ${materials}` : ""}`,
        representative: builder ? `${builder.position}, ${builder.person}` : "",
        source: {
          kind: "record",
          label: `Запись ${work.number}, объём подтвердил ${work.volumeConfirmedBy}`,
        },
      };
    });
}

// ---------- Показатели и сводки ----------

export interface DocView {
  doc: ExecDoc;
  work: WorkRecord | null;
  kind: WorkKind | null;
  title: string;
  objectLabel: string;
  completeness: Completeness;
}

const EMPTY: Completeness = { issues: [], checks: 0, passed: 0, percent: 0, complete: false };

export function docView(ctx: DocsContext, doc: ExecDoc): DocView {
  const work = workOf(ctx, doc.workId);
  return {
    doc,
    work,
    kind: work ? kindOf(ctx, work.kindId) : null,
    title: docTitle(doc),
    objectLabel: objectText(ctx, doc.objectId),
    completeness: work ? completenessOf(ctx, work) : EMPTY,
  };
}

export interface DocsMetrics {
  review: number;
  incomplete: number;
  signing: number;
  signedWeek: number;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Показатели ПТО: «подписано за неделю» — за 7 дней по сегодня включительно */
export function docsMetrics(views: readonly DocView[], today: string): DocsMetrics {
  const weekFrom = addDays(today, -6);
  return {
    review: views.filter((v) => v.doc.status === "review").length,
    incomplete: views.filter((v) => canEditDoc(v.doc.status) && !v.completeness.complete).length,
    signing: views.filter((v) => v.doc.status === "signing").length,
    signedWeek: views.filter(
      (v) =>
        v.doc.signedAt &&
        v.doc.signedAt.slice(0, 10) >= weekFrom &&
        v.doc.signedAt.slice(0, 10) <= today,
    ).length,
  };
}

export interface ObjectReadiness {
  objectId: string;
  objectLabel: string;
  works: number;
  /** Процент выполненных проверок по всем работам объекта, с актом и без */
  percent: number;
  signed: number;
  blockers: (Issue & { workNumber: string })[];
}

/**
 * Готовность ИД по объектам: проверки комплектности по всем работам, а не только по созданным
 * актам. Подписанный акт засчитан полностью: его основания уже подписаны людьми
 */
export function readinessByObject(
  ctx: DocsContext,
  objectIds?: ReadonlySet<string> | null,
): ObjectReadiness[] {
  const ids = [...new Set(ctx.docs.works.map((w) => w.objectId))].filter(
    (id) => !objectIds || objectIds.has(id),
  );
  return ids.map((objectId) => {
    let checks = 0;
    let passed = 0;
    let signed = 0;
    const blockers: ObjectReadiness["blockers"] = [];
    const works = ctx.docs.works.filter((w) => w.objectId === objectId);
    for (const work of works) {
      const c = completenessOf(ctx, work);
      const doc = ctx.docs.docs.find((d) => d.workId === work.id);
      if (doc && !isDraftMark(doc.status)) {
        signed += 1;
        checks += c.checks;
        passed += c.checks;
        continue;
      }
      checks += c.checks;
      passed += c.passed;
      blockers.push(...c.issues.map((i) => ({ ...i, workNumber: work.number })));
    }
    return {
      objectId,
      objectLabel: objectText(ctx, objectId),
      works: works.length,
      percent: checks === 0 ? 100 : Math.floor((passed / checks) * 100),
      signed,
      blockers,
    };
  });
}

/** Что прорабу добавить по своим объектам: строки комплектности с ответственным «Прораб» */
export function siteNeeds(
  ctx: DocsContext,
  objectIds: ReadonlySet<string> | null,
): (Issue & { objectId: string; objectLabel: string; workNumber: string })[] {
  return ctx.docs.works
    .filter((w) => !objectIds || objectIds.has(w.objectId))
    .filter((w) => {
      const doc = ctx.docs.docs.find((d) => d.workId === w.id);
      return !doc || isDraftMark(doc.status);
    })
    .flatMap((work) =>
      completenessOf(ctx, work)
        .issues.filter((i) => i.owner === "Прораб")
        .map((i) => ({
          ...i,
          objectId: work.objectId,
          objectLabel: objectText(ctx, work.objectId),
          workNumber: work.number,
        })),
    );
}

// ---------- Печать и файлы ----------

export interface ActPrint {
  fileName: string;
  fileNameAscii: string;
  heading: string;
  objectLabel: string;
  draft: boolean;
  note: string;
  version: number;
  sections: { title: string; rows: { label: string; value: string }[] }[];
  signers: string[];
}

function asciiCode(code: string): string {
  const map: Record<string, string> = { О: "O", Б: "B", А: "A", С: "S", Р: "R", К: "K" };
  return [...code].map((ch) => map[ch] ?? (/[\w-]/.test(ch) ? ch : "_")).join("");
}

/** Содержимое файла акта: то же, что в предпросмотре, без источников */
export function actPrint(ctx: DocsContext, doc: ExecDoc): ActPrint {
  const object = objectOf(ctx, doc.objectId);
  const code = object?.code ?? "объект";
  const draft = isDraftMark(doc.status);
  const base = `${ACT_SHORT[doc.type]}-${doc.number}_${code}_v${doc.version}${draft ? "_черновик" : ""}`;
  const ascii = `${ACT_ASCII[doc.type]}-${doc.number}_${asciiCode(code)}_v${doc.version}${draft ? "_draft" : ""}`;
  return {
    fileName: `${base}.docx`,
    fileNameAscii: `${ascii}.docx`,
    heading: `${DOC_TYPE_LABEL[doc.type]} №\u00a0${doc.number}`,
    objectLabel: objectText(ctx, doc.objectId),
    draft,
    note: FORM_CHECK_NOTE,
    version: doc.version,
    sections: actSections(ctx, doc).map((s) => ({
      title: s.title,
      rows: s.fields.map((f) => ({ label: f.label, value: f.value })),
    })),
    signers: participantsOf(ctx, doc.objectId).map(
      (p) => `${SIDE_LABEL[p.side]}: ${p.position}, ${p.person}`,
    ),
  };
}

export function registryFileName(
  objectCode: string,
  version: number | null,
): { name: string; ascii: string } {
  const v = version === null ? "текущий" : `v${version}`;
  const va = version === null ? "current" : `v${version}`;
  return {
    name: `Реестр_ИД_${objectCode}_${v}.xlsx`,
    ascii: `Registry_${asciiCode(objectCode)}_${va}.xlsx`,
  };
}
