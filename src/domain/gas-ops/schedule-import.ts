/**
 * Чтение файла недельного графика (ADR-053, 4): заголовок, колонки, строки и предпросмотр
 * «добавится / изменится / уйдёт». Грузится только после выбора файла графика.
 */
import type { Cell, Grid } from "./estimate-labels";
import {
  REQUIRED_FIELDS,
  SCHEDULE_FIELD_LABEL,
  type ColumnMap,
  type ScheduleDiff,
  type ScheduleField,
  type ScheduleParse,
  type ScheduleRow,
} from "./schedule";

const HINTS: Record<ScheduleField, RegExp> = {
  object: /объект|адрес|наименование/i,
  code: /номер|код|№/i,
  brigade: /бригад/i,
  day: /дата|день/i,
};

function text(cell: Cell): string {
  if (typeof cell === "number") return String(cell);
  return typeof cell === "string" ? cell.replace(/\s+/g, " ").trim() : "";
}

/** Строка заголовка: первая строка, где нашлось хотя бы два поля по подсказкам */
export function guessHeader(grid: Grid): { row: number; map: ColumnMap } | null {
  for (let r = 0; r < Math.min(grid.length, 30); r++) {
    const row = grid[r] ?? [];
    const map: ColumnMap = { object: null, code: null, brigade: null, day: null };
    row.forEach((cell, col) => {
      const t = text(cell);
      if (!t) return;
      for (const field of Object.keys(HINTS) as ScheduleField[]) {
        if (map[field] === null && HINTS[field].test(t)) {
          map[field] = col;
          break;
        }
      }
    });
    if (Object.values(map).filter((v) => v !== null).length >= 2) return { row: r, map };
  }
  return null;
}

/**
 * День из ячейки: дата Excel (число дней от 1899-12-30), «27.10.2026», «2026-10-27».
 * Результат — ISO-дата. Непонятное значение — null, строка уходит в замечания.
 */
export function dayOf(cell: Cell): string | null {
  if (typeof cell === "number" && cell > 20_000 && cell < 80_000) {
    const ms = Date.UTC(1899, 11, 30) + Math.round(cell) * 86_400_000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  const t = text(cell);
  const ru = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(t);
  if (ru) return `${ru[3]}-${ru[2]!.padStart(2, "0")}-${ru[1]!.padStart(2, "0")}`;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

/** Прочитать строки графика по сопоставлению колонок */
export function readSchedule(grid: Grid, headerRow: number, map: ColumnMap): ScheduleParse {
  const rows: ScheduleRow[] = [];
  const skipped: ScheduleParse["skipped"] = [];
  const missing = REQUIRED_FIELDS.filter((f) => map[f] === null);
  if (missing.length > 0) {
    return {
      rows,
      skipped: [
        {
          row: headerRow + 1,
          reason: `Не выбрана колонка: ${missing.map((f) => SCHEDULE_FIELD_LABEL[f]).join(", ")}`,
        },
      ],
    };
  }
  for (let r = headerRow + 1; r < grid.length; r++) {
    const cells = grid[r] ?? [];
    const objectLabel = text(cells[map.object!]);
    const brigade = text(cells[map.brigade!]);
    const rawDay = cells[map.day!];
    if (!objectLabel && !brigade && !text(rawDay)) continue;
    const day = dayOf(rawDay);
    if (!objectLabel || !brigade || !day) {
      skipped.push({
        row: r + 1,
        reason: !objectLabel ? "нет объекта" : !brigade ? "нет бригады" : "день не распознан",
      });
      continue;
    }
    const code = map.code !== null ? text(cells[map.code]) || null : null;
    rows.push({
      key: `${(code ?? objectLabel).toLowerCase()}|${brigade.toLowerCase()}|${day}`,
      objectLabel,
      code,
      brigade,
      day,
      row: r + 1,
    });
  }
  return { rows, skipped };
}

/**
 * Предпросмотр применения: что добавится, изменится и уйдёт. «Изменилась» — у объекта
 * в тот же день сменилась бригада; всё остальное либо новое, либо ушло.
 */
export function diffSchedule(current: ScheduleRow[], next: ScheduleRow[]): ScheduleDiff {
  const curKeys = new Set(current.map((r) => r.key));
  const nextKeys = new Set(next.map((r) => r.key));
  const placeKey = (r: ScheduleRow) => `${(r.code ?? r.objectLabel).toLowerCase()}|${r.day}`;
  const goneByPlace = new Map<string, ScheduleRow[]>();
  for (const r of current) {
    if (nextKeys.has(r.key)) continue;
    goneByPlace.set(placeKey(r), [...(goneByPlace.get(placeKey(r)) ?? []), r]);
  }
  const added: ScheduleRow[] = [];
  const changed: ScheduleDiff["changed"] = [];
  for (const r of next) {
    if (curKeys.has(r.key)) continue;
    const gone = goneByPlace.get(placeKey(r));
    if (gone && gone.length > 0) {
      changed.push({ from: gone.shift()!, to: r });
    } else {
      added.push(r);
    }
  }
  const removed = [...goneByPlace.values()].flat();
  const unchanged = next.filter((r) => curKeys.has(r.key)).length;
  return { added, changed, removed, unchanged };
}
