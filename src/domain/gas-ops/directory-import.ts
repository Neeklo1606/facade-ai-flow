/**
 * Импорт справочников из Excel (ADR-062, F3): бригады, сотрудники и ставки через тот же
 * мастер, что сметы и график. Здесь сетка листа → строки → план «добавится, обновится,
 * пропущено с причиной». Дубли ищутся по ФИО и телефону без учёта регистра, «ё» и пробелов.
 * План считает и экран (предпросмотр), и порт (применение): клиенту порт не верит.
 */
import type { Cell, Grid } from "./estimate-labels";
import { dayOf } from "./schedule-import";

export type DirectoryKind = "brigades" | "employees" | "rates";

export const DIRECTORY_KIND_LABEL: Record<DirectoryKind, string> = {
  brigades: "Бригады",
  employees: "Сотрудники",
  rates: "Ставки",
};

export type DirectoryField = "brigade" | "lead" | "phone" | "name" | "from" | "rate";

export const DIRECTORY_FIELD_LABEL: Record<DirectoryField, string> = {
  brigade: "Бригада",
  lead: "Бригадир",
  phone: "Телефон",
  name: "ФИО",
  from: "Дата начала",
  rate: "Ставка, ₽ в час",
};

/** Поля каждого справочника: обязательные и «если есть» */
export const DIRECTORY_FIELDS: Record<
  DirectoryKind,
  readonly { key: DirectoryField; required: boolean }[]
> = {
  brigades: [
    { key: "brigade", required: true },
    { key: "lead", required: false },
    { key: "phone", required: false },
  ],
  employees: [
    { key: "name", required: true },
    { key: "brigade", required: true },
    { key: "from", required: true },
  ],
  rates: [
    { key: "brigade", required: true },
    { key: "name", required: false },
    { key: "rate", required: true },
    { key: "from", required: true },
  ],
};

/** Шаблоны .xlsx: колонки, которые мастер узнаёт сам, и демо-строки */
export const DIRECTORY_TEMPLATE: Record<DirectoryKind, (string | number)[][]> = {
  brigades: [
    ["Бригада", "Бригадир", "Телефон"],
    ["Бригада 12", "Демо Иван Петрович", "+7 900 000-00-12"],
    ["Бригада 13", "Демо Пётр Сергеевич", "+7 900 000-00-13"],
  ],
  employees: [
    ["ФИО", "Бригада", "Дата начала"],
    ["Демо Алексей Николаевич", "Бригада 1", "03.10.2026"],
    ["Демо Олег Викторович", "Бригада 2", "03.10.2026"],
  ],
  rates: [
    ["Бригада", "ФИО", "Ставка, ₽ в час", "Дата начала"],
    ["Бригада 1", "", 650, "01.10.2026"],
    ["Бригада 1", "Демо Алексей Николаевич", 700, "01.10.2026"],
  ],
};

const HINTS: Record<DirectoryField, RegExp> = {
  brigade: /бригад(а|ы)?$|^бригада|^№ ?бригад/i,
  lead: /бригадир|старш/i,
  phone: /телефон|тел\.?$|моб/i,
  name: /^фио|ф\.и\.о|сотрудник|^имя|работник/i,
  from: /дата|с какого|начал/i,
  rate: /ставк|₽|руб/i,
};

function text(cell: Cell): string {
  if (cell === null || cell === undefined) return "";
  return String(cell).replace(/\s+/g, " ").trim();
}

/** ФИО для сравнения: регистр, «ё», пробелы и точки не важны */
export function normName(name: string): string {
  return name.toLowerCase().replace(/ё/g, "е").replace(/\./g, " ").replace(/\s+/g, " ").trim();
}

/** Телефон для сравнения: 10 последних цифр, «8» и «+7» в начале равны; меньше 10 — null */
export function normPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

/** Строка заголовка: первая из 30, где узнаются хотя бы две колонки справочника */
export function guessDirectoryHeader(
  kind: DirectoryKind,
  grid: Grid,
): { row: number; map: Partial<Record<DirectoryField, number | null>> } | null {
  const fields = DIRECTORY_FIELDS[kind].map((f) => f.key);
  // «Бригадир» узнаётся раньше «Бригады»: иначе колонка бригадира займёт бригаду
  const order = fields.includes("lead")
    ? (["lead", ...fields.filter((f) => f !== "lead")] as DirectoryField[])
    : fields;
  for (let r = 0; r < Math.min(grid.length, 30); r++) {
    const map: Partial<Record<DirectoryField, number | null>> = {};
    (grid[r] ?? []).forEach((cell, col) => {
      const t = text(cell);
      if (!t) return;
      for (const field of order) {
        if (map[field] === undefined && HINTS[field].test(t)) {
          map[field] = col;
          break;
        }
      }
    });
    if (Object.keys(map).length >= 2) {
      return { row: r, map: Object.fromEntries(fields.map((f) => [f, map[f] ?? null])) };
    }
  }
  return null;
}

export interface DirectoryRow {
  /** Строка файла, считая с 1 */
  row: number;
  brigade: string;
  lead: string;
  phone: string;
  name: string;
  from: string | null;
  rate: number | null;
}

export interface Skipped {
  row: number;
  reason: string;
}

function rateOf(cell: Cell): number | null {
  if (typeof cell === "number") return cell;
  const t = text(cell).replace(/[\s₽]/g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Строки листа под заголовком. Пустые строки пропускаются молча, неполные — с причиной */
export function readDirectory(
  kind: DirectoryKind,
  grid: Grid,
  headerRow: number,
  map: Partial<Record<DirectoryField, number | null>>,
): { rows: DirectoryRow[]; skipped: Skipped[] } {
  const rows: DirectoryRow[] = [];
  const skipped: Skipped[] = [];
  const at = (line: Cell[], field: DirectoryField) => {
    const col = map[field];
    return col === null || col === undefined ? undefined : line[col];
  };
  for (let r = headerRow + 1; r < grid.length; r++) {
    const line = grid[r] ?? [];
    if (!line.some((c) => text(c) !== "")) continue;
    const fromCell = at(line, "from");
    const row: DirectoryRow = {
      row: r + 1,
      brigade: text(at(line, "brigade")),
      lead: text(at(line, "lead")),
      phone: text(at(line, "phone")),
      name: text(at(line, "name")),
      from: fromCell === undefined || text(fromCell) === "" ? null : dayOf(fromCell),
      rate: rateOf(at(line, "rate")),
    };
    const missing = DIRECTORY_FIELDS[kind]
      .filter((f) => f.required)
      .find((f) => {
        if (f.key === "from") return row.from === null;
        if (f.key === "rate") return row.rate === null;
        return row[f.key] === "";
      });
    if (missing) {
      const reason =
        missing.key === "from" && fromCell !== undefined && text(fromCell) !== ""
          ? `дата «${text(fromCell)}» не распознана`
          : `нет значения «${DIRECTORY_FIELD_LABEL[missing.key]}»`;
      skipped.push({ row: r + 1, reason });
      continue;
    }
    rows.push(row);
  }
  return { rows, skipped };
}

/* ---------------------------------------------------------------- План */

/** Что справочник уже знает: бригады, состав, ставки */
export interface DirectoryState {
  brigades: { id: string; name: string; phone: string | null; leadName: string | null }[];
  crew: { id: string; brigadeId: string; employeeId: string; name: string; to: string | null }[];
  rates: {
    employeeId: string | null;
    brigadeId: string | null;
    rubPerHour: number;
    from: string;
  }[];
}

export type DirectoryChange =
  | { kind: "brigade-add"; row: number; name: string; lead: string | null; phone: string | null }
  | {
      kind: "brigade-update";
      row: number;
      brigadeId: string;
      lead: string | null;
      phone: string | null;
    }
  | { kind: "member-add"; row: number; brigadeId: string; name: string; from: string }
  | {
      kind: "member-move";
      row: number;
      memberId: string;
      employeeId: string;
      brigadeId: string;
      name: string;
      from: string;
    }
  | {
      kind: "rate-set";
      row: number;
      brigadeId: string;
      employeeId: string | null;
      rubPerHour: number;
      from: string;
      update: boolean;
    };

export interface DirectoryPlan {
  added: DirectoryChange[];
  updated: DirectoryChange[];
  skipped: Skipped[];
}

/** «Бригада 1», «бригада  1», «1» в колонке «Бригада» — одна бригада */
function findBrigade(state: DirectoryState, name: string) {
  const n = normName(name);
  return (
    state.brigades.find((b) => normName(b.name) === n) ??
    (/^\d+$/.test(n) ? state.brigades.find((b) => normName(b.name) === `бригада ${n}`) : undefined)
  );
}

/** План импорта: что добавится, что обновится и что пропущено с причиной */
export function planDirectoryImport(
  kind: DirectoryKind,
  rows: readonly DirectoryRow[],
  state: DirectoryState,
  skippedOnRead: readonly Skipped[] = [],
): DirectoryPlan {
  const plan: DirectoryPlan = { added: [], updated: [], skipped: [...skippedOnRead] };
  const seen = new Map<string, number>();
  const repeat = (key: string, row: number): boolean => {
    const first = seen.get(key);
    if (first !== undefined) {
      plan.skipped.push({ row, reason: `повтор строки ${first}` });
      return true;
    }
    seen.set(key, row);
    return false;
  };

  for (const r of rows) {
    if (kind === "brigades") {
      if (repeat(`b:${normName(r.brigade)}`, r.row)) continue;
      const phone = r.phone ? normPhone(r.phone) : null;
      if (r.phone && !phone) {
        plan.skipped.push({ row: r.row, reason: `телефон «${r.phone}» короче 10 цифр` });
        continue;
      }
      if (phone && repeat(`p:${phone}`, r.row)) continue;
      const existing = findBrigade(state, r.brigade);
      const owner = phone
        ? state.brigades.find((b) => b.phone && normPhone(b.phone) === phone)
        : undefined;
      if (owner && owner.id !== existing?.id) {
        plan.skipped.push({ row: r.row, reason: `телефон уже у бригады «${owner.name}»` });
        continue;
      }
      const lead = r.lead || null;
      const shownPhone = r.phone || null;
      if (!existing) {
        plan.added.push({
          kind: "brigade-add",
          row: r.row,
          name: r.brigade,
          lead,
          phone: shownPhone,
        });
        continue;
      }
      const leadChanged = lead !== null && normName(lead) !== normName(existing.leadName ?? "");
      const phoneChanged =
        shownPhone !== null && phone !== (existing.phone ? normPhone(existing.phone) : null);
      if (!leadChanged && !phoneChanged) {
        plan.skipped.push({ row: r.row, reason: "бригада уже есть, без изменений" });
        continue;
      }
      plan.updated.push({
        kind: "brigade-update",
        row: r.row,
        brigadeId: existing.id,
        lead: leadChanged ? lead : null,
        phone: phoneChanged ? shownPhone : null,
      });
      continue;
    }

    const brigade = findBrigade(state, r.brigade);
    if (!brigade) {
      plan.skipped.push({ row: r.row, reason: `нет бригады «${r.brigade}» в справочнике` });
      continue;
    }

    if (kind === "employees") {
      if (repeat(`n:${normName(r.name)}`, r.row)) continue;
      const current = state.crew.filter(
        (m) => m.to === null && normName(m.name) === normName(r.name),
      );
      if (current.some((m) => m.brigadeId === brigade.id)) {
        plan.skipped.push({ row: r.row, reason: `уже в составе «${brigade.name}»` });
        continue;
      }
      const other = current[0];
      if (other) {
        plan.updated.push({
          kind: "member-move",
          row: r.row,
          memberId: other.id,
          employeeId: other.employeeId,
          brigadeId: brigade.id,
          name: r.name,
          from: r.from!,
        });
        continue;
      }
      plan.added.push({
        kind: "member-add",
        row: r.row,
        brigadeId: brigade.id,
        name: r.name,
        from: r.from!,
      });
      continue;
    }

    // Ставки: на бригаду или на человека её состава
    const rub = Math.round(r.rate!);
    if (rub <= 0) {
      plan.skipped.push({ row: r.row, reason: "ставка должна быть больше нуля" });
      continue;
    }
    let employeeId: string | null = null;
    if (r.name) {
      const member = state.crew.find(
        (m) => m.brigadeId === brigade.id && normName(m.name) === normName(r.name),
      );
      if (!member) {
        plan.skipped.push({ row: r.row, reason: `«${r.name}» нет в составе «${brigade.name}»` });
        continue;
      }
      employeeId = member.employeeId;
    }
    if (repeat(`r:${employeeId ?? brigade.id}:${r.from}`, r.row)) continue;
    const same = state.rates.find(
      (x) =>
        x.from === r.from &&
        x.employeeId === employeeId &&
        (employeeId !== null || x.brigadeId === brigade.id),
    );
    if (same?.rubPerHour === rub) {
      plan.skipped.push({ row: r.row, reason: "такая ставка уже есть" });
      continue;
    }
    (same ? plan.updated : plan.added).push({
      kind: "rate-set",
      row: r.row,
      brigadeId: brigade.id,
      employeeId,
      rubPerHour: rub,
      from: r.from!,
      update: !!same,
    });
  }
  plan.skipped.sort((a, b) => a.row - b.row);
  return plan;
}

/** «Добавится 3, обновится 1, пропущено 2» */
export function planSummary(plan: DirectoryPlan): string {
  return `Добавится ${plan.added.length}, обновится ${plan.updated.length}, пропущено ${plan.skipped.length}`;
}
