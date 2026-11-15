/**
 * Папка смет на облачном диске (ADR-072). Сметчик один раз кладёт файлы в папку, система
 * видит, какие из них ещё не загружены, и забирает их одним нажатием: каждый файл проходит
 * тот же разбор, что и загрузка руками, и становится версией сметы «ждёт подтверждения».
 * Стоимость по-прежнему подтверждает человек (правило 1): папка только избавляет от поиска
 * файла и ручной загрузки.
 *
 * Здесь только правила: какой файл смета, что с ним уже было, что забирать. Чтение папки —
 * порт `src/ports/estimate-folder.ts`.
 */

export interface FolderFile {
  /** Имя файла: по нему файл узнаётся среди загруженных версий */
  name: string;
  /** Путь на диске: им файл скачивается */
  path: string;
  size: number;
  /** Когда файл изменён на диске, местное время без пояса или ISO */
  modified: string;
}

export type FolderFileState =
  /** В системе нет версии с этим именем: заберётся следующим нажатием */
  | { kind: "new" }
  /** Уже загружен, на диске не менялся после загрузки */
  | { kind: "loaded"; version: number }
  /** Загружен, но файл на диске новее: можно забрать новой версией */
  | { kind: "changed"; version: number }
  /** Не смета Excel или слишком большой: не забирается, причина рядом */
  | { kind: "skipped"; reason: string };

export interface FolderRow {
  file: FolderFile;
  state: FolderFileState;
}

/** Предел размера файла сметы: больше — почти наверняка не смета, а выгрузка с вложениями */
export const MAX_ESTIMATE_BYTES = 20 * 1024 * 1024;

const EXCEL = /\.(xlsx|xls)$/i;

/** Смета ли это по имени: Excel, не временный файл Office «~$…», не скрытый «.…» */
export function isEstimateName(name: string): boolean {
  return EXCEL.test(name) && !name.startsWith("~$") && !name.startsWith(".");
}

/** Время к сравнимому виду: «2026-11-15T10:00:00+03:00» и «2026-11-15T10:00:00» — до секунд */
function stamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Что с каждым файлом папки. Сверка по имени файла с последней версией этого имени: смета
 * объекта обычно лежит под одним именем, и сметчик заменяет файл, а не копит новые
 */
export function folderRows(
  files: readonly FolderFile[],
  versions: readonly { fileName: string; version: number; uploadedAt: string }[],
): FolderRow[] {
  const latest = new Map<string, { version: number; uploadedAt: string }>();
  for (const v of versions) {
    const key = v.fileName.trim().toLowerCase();
    const known = latest.get(key);
    if (!known || stamp(v.uploadedAt) > stamp(known.uploadedAt)) latest.set(key, v);
  }
  return files
    .filter((file) => !file.name.startsWith("~$") && !file.name.startsWith("."))
    .map((file): FolderRow => {
      if (!isEstimateName(file.name)) {
        return { file, state: { kind: "skipped", reason: "не файл Excel" } };
      }
      if (file.size > MAX_ESTIMATE_BYTES) {
        return { file, state: { kind: "skipped", reason: "больше 20 МБ" } };
      }
      const known = latest.get(file.name.trim().toLowerCase());
      if (!known) return { file, state: { kind: "new" } };
      return stamp(file.modified) > stamp(known.uploadedAt)
        ? { file, state: { kind: "changed", version: known.version } }
        : { file, state: { kind: "loaded", version: known.version } };
    })
    .sort(
      (a, b) =>
        ORDER[a.state.kind] - ORDER[b.state.kind] || a.file.name.localeCompare(b.file.name, "ru"),
    );
}

const ORDER: Record<FolderFileState["kind"], number> = {
  new: 0,
  changed: 1,
  loaded: 2,
  skipped: 3,
};

/** Что заберёт кнопка «Забрать»: новые и изменённые */
export function toFetch(rows: readonly FolderRow[]): FolderRow[] {
  return rows.filter((r) => r.state.kind === "new" || r.state.kind === "changed");
}

/** Строка состояния под заголовком папки: одна фраза без «скоро» */
export function folderSummary(rows: readonly FolderRow[]): string {
  const count = (kind: FolderFileState["kind"]) => rows.filter((r) => r.state.kind === kind).length;
  const fresh = count("new");
  const changed = count("changed");
  const loaded = count("loaded");
  if (!rows.length) return "Папка пуста: положите туда файлы смет Excel";
  const parts: string[] = [];
  if (fresh) parts.push(`новых ${fresh}`);
  if (changed) parts.push(`изменились ${changed}`);
  if (loaded) parts.push(`загружено ${loaded}`);
  const skipped = count("skipped");
  if (skipped) parts.push(`не сметы ${skipped}`);
  return parts.join(", ");
}

/**
 * Путь внутри папки: файл скачивается только из настроенной папки и её подпапок. Защита
 * сервера от «../» и чужих путей: адрес приходит из браузера
 */
export function insideFolder(folder: string, path: string): boolean {
  const base = folder.replace(/\/+$/, "");
  if (!path.startsWith(`${base}/`)) return false;
  const rest = path.slice(base.length + 1);
  return (
    rest.length > 0 && !rest.split("/").some((part) => part === ".." || part === "." || part === "")
  );
}
