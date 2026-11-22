/**
 * Папка смет на сервисе (ADR-077): файл → разбор → объект → разделы. Чистые правила:
 * - стоимость работ раздела = итог раздела минус материалы (правило Оксаны);
 * - опрессовка: раздел целиком или строки внутри раздела с долей НР и СП;
 * - дубль — тот же хеш файла, новая версия — другой файл того же объекта;
 * - объект без дублей: совпадение номера сметы или адреса — «Прикрепить», похожий —
 *   «Возможно, это объект», нет — «Создать новый». Решает человек.
 *
 * Деньги — копейки целыми, округление один раз в конце.
 */
import { addressKey, addressLine, addressWords, numberKey } from "./estimate-header";
import type {
  EstimateAddress,
  EstimateHeader,
  EstimateSection,
  ParsedEstimate,
  PressureLine,
} from "./estimate-labels";
import { TOLERANCE_KOPECKS } from "./estimate-labels";

/* ---------------------------------------------------------------- Файлы */

export type EstimateFileStatus = "parsed" | "needs-review" | "unreadable";

export const FILE_STATUS_LABEL: Record<EstimateFileStatus | "duplicate", string> = {
  parsed: "Распознана",
  "needs-review": "Нужна проверка",
  unreadable: "Не распознана",
  duplicate: "Уже загружена",
};

/** Исходный файл сметы на сервисе: байты в хранилище тома, здесь — опись */
export interface EstimateFile {
  id: string;
  /** SHA-256 содержимого, hex: одинаковый хеш — тот же файл */
  sha256: string;
  name: string;
  size: number;
  uploadedBy: string;
  uploadedAt: string;
  /** Путь в хранилище сервера; null — демо, байты остались в браузере */
  storagePath: string | null;
  status: EstimateFileStatus;
  /** Причина «Нужна проверка» или «Не распознана» словами */
  reason: string | null;
  /** Версия сметы из этого файла; null — файл не разобран */
  versionId: string | null;
  /** Сколько раз файл присылали повторно после первой загрузки */
  repeats: number;
}

/** Предел размера: больше — почти наверняка не смета */
export const MAX_ESTIMATE_FILE_BYTES = 20 * 1024 * 1024;

/** Сигнатура файла: xlsx — zip «PK», xls — OLE D0 CF 11 E0 */
export function excelKind(head: Uint8Array): "xlsx" | "xls" | null {
  if (head[0] === 0x50 && head[1] === 0x4b) return "xlsx";
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) return "xls";
  return null;
}

/** Статус файла по разбору: причина — первое замечание или пустая шапка */
export function fileStatusOf(parsed: ParsedEstimate): {
  status: EstimateFileStatus;
  reason: string | null;
} {
  if (parsed.status === "unknown-format" || !parsed.format) {
    return {
      status: "unreadable",
      reason: parsed.issues[0]?.message ?? "Не нашли признаков сметы",
    };
  }
  const header = parsed.header;
  const reasons = parsed.issues.map((i) => i.message);
  if (header && header.object.value === null && header.works.value === null) {
    reasons.push("Не нашли наименование объекта в шапке");
  }
  if (parsed.sections.length === 0) reasons.push("В смете не нашли разделов");
  return reasons.length === 0
    ? { status: "parsed", reason: null }
    : { status: "needs-review", reason: reasons[0]! };
}

/** Тот же файл уже загружен: по хешу, а не по имени */
export function duplicateOf(files: readonly EstimateFile[], sha256: string): EstimateFile | null {
  return files.find((f) => f.sha256 === sha256) ?? null;
}

/* ---------------------------------------------------------------- Разделы */

export type PressureMode = "payroll" | "direct";

export const PRESSURE_MODE_LABEL: Record<PressureMode, string> = {
  payroll: "НР и СП по доле ФОТ строки в ФОТ раздела",
  direct: "НР и СП по доле прямых затрат строки в прямых затратах раздела",
};

/** Опрессовка раздела: сумма с НР и СП, материалы, способ расчёта, строки источника */
export interface PressureView {
  kind: "section" | "lines";
  totalKopecks: number;
  materialsKopecks: number;
  /** Стоимость работ опрессовки: сумма минус материалы */
  workKopecks: number;
  method: string;
  /** Посчитано системой, а не взято из файла: требует подтверждения */
  needsConfirm: boolean;
  rows: number[];
  lines: PressureLine[];
}

export interface SectionView {
  key: string;
  number: string | null;
  title: string;
  totalKopecks: number;
  totalRow: number;
  materialsKopecks: number | null;
  materialsRow: number | null;
  materialsNote: string | null;
  /** Итог минус материалы; null — материалов нет в файле, стоимость работ не считается */
  workKopecks: number | null;
  laborHours: number | null;
  laborRow: number | null;
  machinesKopecks: number | null;
  payrollKopecks: number | null;
  overheadKopecks: number | null;
  profitKopecks: number | null;
  pressure: PressureView | null;
  /** СМР раздела без опрессовки: работы минус работы опрессовки */
  smrKopecks: number | null;
  /** «Перевозка» из итогов раздела: входит в работы по правилу «итог минус материалы» */
  transportKopecks: number | null;
  transportRow: number | null;
  /** Что в стоимости работ требует решения человека; null — нечего */
  workNote: string | null;
}

/** Ключ раздела: номер, иначе название — по нему разделы сравниваются между версиями */
export function sectionKey(s: Pick<EstimateSection, "number" | "title">): string {
  return s.number ? `n${s.number}` : `t${s.title.toLowerCase().replace(/\s+/g, " ").trim()}`;
}

function linesPressure(section: EstimateSection, mode: PressureMode): PressureView | null {
  const lines = section.pressureLines ?? [];
  if (lines.length === 0) return null;
  const parts = section.breakdown?.parts;
  const nr = parts?.overhead.kopecks ?? 0;
  const sp = parts?.profit.kopecks ?? 0;
  const basePay = parts?.payroll.kopecks ?? 0;
  const baseDirect = parts?.direct.kopecks ?? 0;
  let total = 0;
  let computed = false;
  for (const line of lines) {
    if (line.totalKopecks !== null) {
      total += line.totalKopecks;
      continue;
    }
    computed = true;
    const share =
      mode === "payroll"
        ? basePay > 0
          ? line.payrollKopecks / basePay
          : 0
        : baseDirect > 0
          ? line.directKopecks / baseDirect
          : 0;
    total += line.directKopecks + (nr + sp) * share;
  }
  const totalKopecks = Math.round(total);
  const materialsKopecks = lines.reduce((a, l) => a + l.materialsKopecks, 0);
  return {
    kind: "lines",
    totalKopecks,
    materialsKopecks,
    workKopecks: totalKopecks - materialsKopecks,
    method: computed
      ? `прямые затраты строк плюс ${PRESSURE_MODE_LABEL[mode]}`
      : "«Всего по позиции» из файла",
    needsConfirm: computed,
    rows: lines.map((l) => l.row),
    lines,
  };
}

/** Раздел к показу: стоимость работ без материалов, опрессовка отдельно */
export function sectionView(section: EstimateSection, mode: PressureMode = "payroll"): SectionView {
  const parts = section.breakdown?.parts;
  const materials = parts?.materials;
  const materialsKopecks = materials?.kopecks ?? null;
  const work = materialsKopecks === null ? null : section.kopecks - materialsKopecks;
  let pressure: PressureView | null = null;
  if (section.breakdown?.pressureSection) {
    pressure = {
      kind: "section",
      totalKopecks: section.kopecks,
      materialsKopecks: materialsKopecks ?? 0,
      workKopecks: work ?? section.kopecks,
      method: "раздел испытаний целиком",
      needsConfirm: materialsKopecks === null,
      rows: [section.row],
      lines: [],
    };
  } else {
    pressure = linesPressure(section, mode);
  }
  return {
    key: sectionKey(section),
    number: section.number ?? null,
    title: section.title,
    totalKopecks: section.kopecks,
    totalRow: section.row,
    materialsKopecks,
    materialsRow: materials?.row ?? null,
    materialsNote:
      materials?.note ?? (section.breakdown ? null : "разбор до ADR-077: разбивки нет"),
    workKopecks: work,
    laborHours: section.breakdown?.laborHours?.value ?? null,
    laborRow: section.breakdown?.laborHours?.row ?? null,
    machinesKopecks: parts?.machines.kopecks ?? null,
    payrollKopecks: parts?.payroll.kopecks ?? null,
    overheadKopecks: parts?.overhead.kopecks ?? null,
    profitKopecks: parts?.profit.kopecks ?? null,
    pressure,
    smrKopecks:
      work === null ? null : pressure?.kind === "section" ? 0 : work - (pressure?.workKopecks ?? 0),
    transportKopecks: section.breakdown?.transport?.kopecks ?? null,
    transportRow: section.breakdown?.transport?.row ?? null,
    workNote: section.breakdown?.transport
      ? `В работы раздела входит перевозка, стр. ${section.breakdown.transport.row}: вычитать ли её, как материалы, решает руководитель`
      : null,
  };
}

/** Сходимость: сумма разделов против итога без НДС */
export function convergence(parsed: Pick<ParsedEstimate, "sections" | "totals">): {
  ok: boolean;
  sumKopecks: number;
  withoutVatKopecks: number | null;
  diffKopecks: number | null;
} {
  const sum = parsed.sections.reduce((a, s) => a + s.kopecks, 0);
  const base = parsed.totals.withoutVat?.kopecks ?? null;
  const diff = base === null ? null : sum - base;
  return {
    ok: diff !== null && Math.abs(diff) <= TOLERANCE_KOPECKS,
    sumKopecks: sum,
    withoutVatKopecks: base,
    diffKopecks: diff,
  };
}

/* ---------------------------------------------------------------- Объект */

/** Что объект несёт для поиска дублей */
export interface MatchableObject {
  id: string;
  label: string;
  code: string;
  address?: EstimateAddress | null | undefined;
  estimateNumber?: string | null | undefined;
}

export type ObjectMatch =
  | { kind: "attach"; objectId: string; by: "number" | "address" }
  | { kind: "maybe"; objectId: string; score: number }
  | { kind: "new" };

/** Найти объект сметы. Совпадение номера сметы или адреса до квартиры — «Прикрепить» */
export function matchObject(
  header: EstimateHeader | undefined,
  objects: readonly MatchableObject[],
): ObjectMatch {
  if (!header) return { kind: "new" };
  const num = numberKey(header.number.value);
  if (num) {
    const byNumber = objects.find(
      (o) => numberKey(o.estimateNumber) === num || numberKey(o.code) === num,
    );
    if (byNumber) return { kind: "attach", objectId: byNumber.id, by: "number" };
  }
  const address = header.address.value;
  const key = addressKey(address);
  if (key) {
    const byAddress = objects.find((o) => addressKey(o.address) === key);
    if (byAddress) return { kind: "attach", objectId: byAddress.id, by: "address" };
  }
  // Похожий: слова улицы и дом из адреса сметы встречаются в подписи объекта
  if (address?.street) {
    const want = addressWords(`${address.street} ${address.house ?? ""}`);
    let best: { id: string; score: number } | null = null;
    for (const o of objects) {
      const have = addressWords(`${o.label} ${o.address ? addressLine(o.address) : ""}`);
      const hit = [...want].filter((w) => have.has(w)).length;
      const score = want.size ? hit / want.size : 0;
      if (score >= 0.6 && (!best || score > best.score)) best = { id: o.id, score };
    }
    if (best) return { kind: "maybe", objectId: best.id, score: best.score };
  }
  return { kind: "new" };
}

/** Предложение карточки объекта из шапки: человек проверяет и правит перед созданием */
export interface ObjectDraft {
  label: string;
  code: string;
  settlement: string | null;
  workType: string | null;
  address: EstimateAddress | null;
  estimateNumber: string | null;
}

export function objectDraft(header: EstimateHeader | undefined, fallbackName: string): ObjectDraft {
  const address = header?.address.value ?? null;
  const number = header?.number.value ?? null;
  return {
    label: address ? addressLine(address) : (header?.object.value ?? fallbackName),
    code: number ?? "",
    settlement: address?.settlement ?? null,
    workType: header?.workKind.value ?? null,
    address,
    estimateNumber: number,
  };
}

/** Объект с тем же адресом или номером уже есть: второй не создаётся */
export function objectTaken(
  draft: Pick<ObjectDraft, "address" | "estimateNumber" | "code">,
  objects: readonly MatchableObject[],
): MatchableObject | null {
  const key = addressKey(draft.address);
  const num = numberKey(draft.estimateNumber);
  const code = numberKey(draft.code);
  return (
    objects.find(
      (o) =>
        (key !== null && addressKey(o.address) === key) ||
        (num !== null && numberKey(o.estimateNumber) === num) ||
        (code !== null && numberKey(o.code) === code),
    ) ?? null
  );
}

/* ---------------------------------------------------------------- Версии */

/** Разделы, которые изменились между версиями: номер или название, по порядку файла */
export function changedSections(
  before: readonly EstimateSection[],
  after: readonly EstimateSection[],
): string[] {
  const old = new Map(before.map((s) => [sectionKey(s), s]));
  const changed: string[] = [];
  const seen = new Set<string>();
  for (const s of after) {
    const key = sectionKey(s);
    seen.add(key);
    const prev = old.get(key);
    const same =
      prev &&
      prev.kopecks === s.kopecks &&
      (prev.breakdown?.parts.materials.kopecks ?? null) ===
        (s.breakdown?.parts.materials.kopecks ?? null) &&
      (prev.breakdown?.laborHours?.value ?? null) === (s.breakdown?.laborHours?.value ?? null);
    if (!same) changed.push(s.number ?? s.title);
  }
  for (const s of before) if (!seen.has(sectionKey(s))) changed.push(s.number ?? s.title);
  return changed;
}

/** «изменились разделы 3 и 7» */
export function changedPhrase(list: readonly string[]): string {
  if (list.length === 0) return "разделы не изменились";
  const names = list.map((x) => (/^\d/.test(x) ? x : `«${x}»`));
  const joined =
    names.length === 1
      ? names[0]!
      : `${names.slice(0, -1).join(", ")} и ${names[names.length - 1]}`;
  return `${names.length === 1 ? "изменился раздел" : "изменились разделы"} ${joined}`;
}

/** Итог загрузки одного файла: статус для строки списка */
export type IntakeOutcome =
  | { kind: "duplicate"; fileId: string; versionId: string | null; version: number | null }
  | {
      kind: "added";
      fileId: string;
      versionId: string | null;
      version: number | null;
      status: EstimateFileStatus;
      reason: string | null;
      match: ObjectMatch;
      /** Новая версия известного объекта: что изменилось */
      changed: string[] | null;
    };

export function outcomeText(o: IntakeOutcome): string {
  if (o.kind === "duplicate") {
    return o.version ? `Уже загружена, версия ${o.version}` : "Уже загружена";
  }
  const head = FILE_STATUS_LABEL[o.status];
  if (o.status === "unreadable") return `${head}: ${o.reason ?? "формат не распознан"}`;
  const tail =
    o.changed && o.version && o.version > 1
      ? `. Новая версия ${o.version}, ${changedPhrase(o.changed)}`
      : "";
  return `${head}${o.reason ? `: ${o.reason}` : ""}${tail}`;
}

/* ---------------------------------------------------------------- Разделы объекта */

/** Раздел объекта: из прикреплённой версии сметы, ключ стабилен между версиями (для B) */
export interface ObjectSection {
  /** `${objectId}:${sectionKey}` */
  id: string;
  objectId: string;
  versionId: string;
  key: string;
  number: string | null;
  title: string;
  totalKopecks: number;
  materialsKopecks: number | null;
  workKopecks: number | null;
  laborHours: number | null;
  pressureKopecks: number | null;
  /** Раздел убран в новой версии сметы: строка остаётся для истории начислений */
  removed: boolean;
}

export function objectSectionsOf(
  objectId: string,
  versionId: string,
  sections: readonly EstimateSection[],
  previous: readonly ObjectSection[],
  mode: PressureMode = "payroll",
): ObjectSection[] {
  const next = sections.map((s): ObjectSection => {
    const v = sectionView(s, mode);
    return {
      id: `${objectId}:${v.key}`,
      objectId,
      versionId,
      key: v.key,
      number: v.number,
      title: v.title,
      totalKopecks: v.totalKopecks,
      materialsKopecks: v.materialsKopecks,
      workKopecks: v.workKopecks,
      laborHours: v.laborHours,
      pressureKopecks: v.pressure?.workKopecks ?? null,
      removed: false,
    };
  });
  const keys = new Set(next.map((s) => s.key));
  const gone = previous
    .filter((p) => p.objectId === objectId && !keys.has(p.key))
    .map((p) => ({ ...p, removed: true }));
  return [...next, ...gone];
}

/* ---------------------------------------------------------------- Исходный файл мастера */

/** Часть снимка, которую трогает сохранение исходного файла */
export interface KeepFileState {
  estimateFiles?: EstimateFile[];
  estimateVersions: { id: string; fileId?: string | null; parseStatus: string }[];
}

/**
 * Исходный файл версии из мастера «Загрузить смету» (ADR-086): мастер разбирает файл во вкладке,
 * а на рабочем контуре байты ещё и ложатся в хранилище тома. Опись файла связывается с версией.
 * Тот же файл второй раз не описывается: версия ссылается на прежнюю опись. Версия, у которой
 * файл уже есть, не меняется. Чистая функция: null — версии нет
 */
export function keepSourceFile<S extends KeepFileState>(
  snapshot: S,
  input: {
    versionId: string;
    fileId: string;
    sha256: string;
    name: string;
    size: number;
    storagePath: string;
    actorId: string;
    at: string;
  },
): { snapshot: S; fileId: string } | null {
  const version = snapshot.estimateVersions.find((v) => v.id === input.versionId);
  if (!version) return null;
  if (version.fileId) return { snapshot, fileId: version.fileId };
  const files = snapshot.estimateFiles ?? [];
  const twin = duplicateOf(files, input.sha256);
  const fileId = twin?.id ?? input.fileId;
  const status: EstimateFileStatus =
    version.parseStatus === "unknown-format"
      ? "unreadable"
      : version.parseStatus === "parsed"
        ? "parsed"
        : "needs-review";
  const nextFiles: EstimateFile[] = twin
    ? files.map((f) =>
        f.id === twin.id
          ? { ...f, storagePath: f.storagePath ?? input.storagePath, repeats: f.repeats + 1 }
          : f,
      )
    : [
        {
          id: fileId,
          sha256: input.sha256,
          name: input.name,
          size: input.size,
          uploadedBy: input.actorId,
          uploadedAt: input.at,
          storagePath: input.storagePath,
          status,
          reason: null,
          versionId: version.id,
          repeats: 0,
        },
        ...files,
      ];
  return {
    fileId,
    snapshot: {
      ...snapshot,
      estimateFiles: nextFiles,
      estimateVersions: snapshot.estimateVersions.map((v) =>
        v.id === version.id ? { ...v, fileId } : v,
      ),
    },
  };
}
