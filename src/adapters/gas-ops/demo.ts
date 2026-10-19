/**
 * Демо-адаптер газового направления (ADR-042): порт поверх состояния вкладки.
 *
 * Правила проверяет адаптер, а не экран: ошибки ТЗ, п. 5.7 (некорректное время, дубль,
 * пересечение, нет объекта) и обязательный комментарий при правке приходят оттуда же,
 * откуда их будет отдавать сервер. Экран только показывает текст ошибки.
 */
import {
  effectiveMinutes,
  findDuplicates,
  findOverlaps,
  MINUTES_ERROR_TEXT,
} from "@/domain/gas-ops/calc";
import type { AuditLog, Estimate, Review, TimeEntry } from "@/domain/gas-ops/model";
import {
  GasOpsError,
  type CreateEntryInput,
  type GasOpsPort,
  type GasOpsSnapshot,
  type ReviewInput,
  type UpdateEntryInput,
} from "@/ports/gas-ops";
import { getSnapshot, resetState, update } from "./state";

const done = <T>(value: T) => Promise.resolve(value);

function nextNumber(snapshot: GasOpsSnapshot): string {
  const max = snapshot.entries.reduce((a, e) => {
    const n = Number(e.number.replace(/\D/g, ""));
    return Number.isFinite(n) ? Math.max(a, n) : a;
  }, 0);
  return `ГЗ-${String(max + 1).padStart(5, "0")}`;
}

function newId(prefix: string): string {
  // Время плюс случайная часть: в демонстрации этого достаточно, на сервере будет uuid
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Сейчас по часам направления, а не по часам устройства: демонстрация живёт в своей неделе */
function nowOf(snapshot: GasOpsSnapshot): string {
  const device = new Date();
  const time = `${String(device.getHours()).padStart(2, "0")}:${String(device.getMinutes()).padStart(2, "0")}`;
  return `${snapshot.today}T${time}:00`;
}

function audit(snapshot: GasOpsSnapshot, entry: Omit<AuditLog, "id" | "at">): AuditLog {
  return { id: newId("aud"), at: nowOf(snapshot), ...entry };
}

function mustFind(snapshot: GasOpsSnapshot, id: string): TimeEntry {
  const entry = snapshot.entries.find((e) => e.id === id);
  if (!entry) throw new GasOpsError("not-found", "Запись не найдена. Обновите экран.");
  return entry;
}

/** Правила, общие для создания и правки: объект, время, дубль, пересечение */
function validate(
  snapshot: GasOpsSnapshot,
  draft: TimeEntry,
  options: { allowDuplicate?: boolean } = {},
): void {
  const object = snapshot.objects.find((o) => o.id === draft.objectId);
  if (!object) {
    throw new GasOpsError("no-object", "Объект не выбран или больше не доступен.");
  }

  const actor = snapshot.users.find((u) => u.id === snapshot.actorId);
  if (
    actor?.role === "foreman" &&
    actor.allowedObjectIds !== "all" &&
    !actor.allowedObjectIds.includes(draft.objectId)
  ) {
    throw new GasOpsError(
      "not-allowed",
      "Этот объект не закреплён за вашей бригадой. Обратитесь к менеджеру.",
    );
  }

  const others = snapshot.entries.filter((e) => e.id !== draft.id);

  if (!options.allowDuplicate) {
    const duplicates = findDuplicates([...others, draft]);
    if (duplicates.some((list) => list.some((e) => e.id === draft.id))) {
      throw new GasOpsError(
        "duplicate",
        "По этому объекту за этот день запись уже есть. Исправьте существующую запись.",
      );
    }
  }

  const overlaps = findOverlaps([...others, draft]);
  const own = overlaps.find((o) => o.a.id === draft.id || o.b.id === draft.id);
  if (own) {
    const other = own.a.id === draft.id ? own.b : own.a;
    const label = snapshot.objects.find((o) => o.id === other.objectId)?.label ?? "другой объект";
    throw new GasOpsError(
      "overlap",
      `Время пересекается с записью ${other.number} (${label}) на ${own.minutes} мин.`,
    );
  }
}

export function createGasOpsDemo(): GasOpsPort {
  return {
    snapshot: () => done(getSnapshot()),

    signIn: (userId) =>
      done(
        update((s) => {
          const user = s.users.find((u) => u.id === userId);
          if (!user) throw new GasOpsError("not-found", "Такой роли нет.");
          return { ...s, actorId: user.id };
        }),
      ),

    createEntry: (input: CreateEntryInput) => {
      const snapshot = getSnapshot();
      const minutes = effectiveMinutes({
        start: input.start,
        end: input.end,
        breakMinutes: input.breakMinutes,
      });
      if (!minutes.ok) throw new GasOpsError("bad-time", MINUTES_ERROR_TEXT[minutes.error]);

      const draft: TimeEntry = {
        id: newId("en"),
        number: nextNumber(snapshot),
        day: input.day,
        brigadeId: input.brigadeId,
        employeeId: input.employeeId,
        objectId: input.objectId,
        startMinutes: minutes.startMinutes,
        endMinutes: minutes.endMinutes,
        breakMinutes: minutes.breakMinutes,
        minutes: minutes.minutes,
        amountRub: null,
        status: input.submit ? "pending" : "draft",
        createdBy: snapshot.actorId,
        createdAt: nowOf(snapshot),
        reviewedBy: null,
        reviewedAt: null,
        comment: null,
        source: "mock",
      };
      validate(snapshot, draft);

      const next = update((s) => ({
        ...s,
        entries: [...s.entries, draft],
        audit: [
          audit(s, {
            actor: s.actorId,
            action: input.submit ? "entry.submit" : "entry.draft",
            entityId: draft.id,
            detail: `${draft.number}: ${draft.minutes} мин, ${
              s.objects.find((o) => o.id === draft.objectId)?.label ?? draft.objectId
            }`,
          }),
          ...s.audit,
        ],
      }));
      return done(next.entries.find((e) => e.id === draft.id)!);
    },

    updateEntry: (input: UpdateEntryInput) => {
      const snapshot = getSnapshot();
      const entry = mustFind(snapshot, input.id);
      const actor = snapshot.users.find((u) => u.id === snapshot.actorId);

      // Бригадир правит только до проверки (ТЗ, п. 4): после подтверждения правит менеджер
      if (actor?.role === "foreman" && entry.status !== "draft" && entry.status !== "clarify") {
        throw new GasOpsError(
          "already-reviewed",
          "Запись уже на проверке. Исправления вносит менеджер.",
        );
      }
      // Правка проверяющим идёт в журнал, поэтому причина обязательна
      if (actor?.role !== "foreman" && !input.comment?.trim()) {
        throw new GasOpsError("comment-required", "Укажите, что и почему исправлено.");
      }

      const start = input.start ?? entry.startMinutes;
      const end = input.end ?? entry.endMinutes;
      const breaks = input.breakMinutes ?? entry.breakMinutes;
      if (start === null || end === null) {
        throw new GasOpsError(
          "bad-time",
          "У записи из выгрузки нет начала и окончания смены: правьте минуты в журнале.",
        );
      }
      const minutes = effectiveMinutes({ start, end, breakMinutes: breaks });
      if (!minutes.ok) throw new GasOpsError("bad-time", MINUTES_ERROR_TEXT[minutes.error]);

      const changes: Review["changes"] = [];
      const draft: TimeEntry = {
        ...entry,
        day: input.day ?? entry.day,
        objectId: input.objectId ?? entry.objectId,
        startMinutes: minutes.startMinutes,
        endMinutes: minutes.endMinutes,
        breakMinutes: minutes.breakMinutes,
        minutes: minutes.minutes,
      };
      if (draft.minutes !== entry.minutes)
        changes.push({ field: "Минуты", from: String(entry.minutes), to: String(draft.minutes) });
      if (draft.objectId !== entry.objectId)
        changes.push({
          field: "Объект",
          from: snapshot.objects.find((o) => o.id === entry.objectId)?.label ?? entry.objectId,
          to: snapshot.objects.find((o) => o.id === draft.objectId)?.label ?? draft.objectId,
        });
      if (draft.day !== entry.day) changes.push({ field: "Дата", from: entry.day, to: draft.day });

      validate(snapshot, draft);

      const review: Review | null =
        actor?.role === "foreman"
          ? null
          : {
              id: newId("rev"),
              entryId: entry.id,
              action: "correct",
              actor: snapshot.actorId,
              at: nowOf(snapshot),
              comment: input.comment?.trim() ?? null,
              changes,
            };

      const next = update((s) => ({
        ...s,
        entries: s.entries.map((e) => (e.id === draft.id ? draft : e)),
        reviews: review ? [review, ...s.reviews] : s.reviews,
        audit: [
          audit(s, {
            actor: s.actorId,
            action: "entry.correct",
            entityId: draft.id,
            detail:
              changes.map((c) => `${c.field}: ${c.from} → ${c.to}`).join("; ") || "без изменений",
          }),
          ...s.audit,
        ],
      }));
      return done(next.entries.find((e) => e.id === draft.id)!);
    },

    submitEntry: (id) => {
      const snapshot = getSnapshot();
      const entry = mustFind(snapshot, id);
      if (entry.status === "confirmed") {
        throw new GasOpsError("already-reviewed", "Запись уже подтверждена.");
      }
      const draft: TimeEntry = { ...entry, status: "pending", comment: null };
      validate(snapshot, draft);
      const next = update((s) => ({
        ...s,
        entries: s.entries.map((e) => (e.id === id ? draft : e)),
        audit: [
          audit(s, {
            actor: s.actorId,
            action: "entry.submit",
            entityId: id,
            detail: `${entry.number} отправлена на проверку`,
          }),
          ...s.audit,
        ],
      }));
      return done(next.entries.find((e) => e.id === id)!);
    },

    review: (input: ReviewInput) => {
      const snapshot = getSnapshot();
      const entry = mustFind(snapshot, input.id);
      const actor = snapshot.users.find((u) => u.id === snapshot.actorId);
      if (actor?.role === "foreman") {
        throw new GasOpsError("not-allowed", "Проверку ведёт менеджер.");
      }
      if (input.action !== "confirm" && !input.comment?.trim()) {
        throw new GasOpsError(
          "comment-required",
          input.action === "reject" ? "Укажите причину отклонения." : "Напишите, что уточнить.",
        );
      }

      const status =
        input.action === "confirm"
          ? "confirmed"
          : input.action === "reject"
            ? "rejected"
            : "clarify";
      // Подтверждённая сумма берётся из подтверждённого начисления объекта, а не из полной сметы
      const estimate = snapshot.estimates.find(
        (e) => e.objectId === entry.objectId && e.status === "confirmed",
      );
      const amountRub =
        status === "confirmed" ? (entry.amountRub ?? estimate?.amountRub ?? null) : entry.amountRub;

      const draft: TimeEntry = {
        ...entry,
        status,
        amountRub,
        reviewedBy: snapshot.actorId,
        reviewedAt: nowOf(snapshot),
        comment: input.comment?.trim() ?? null,
      };
      const review: Review = {
        id: newId("rev"),
        entryId: entry.id,
        action: input.action,
        actor: snapshot.actorId,
        at: nowOf(snapshot),
        comment: input.comment?.trim() ?? null,
        changes:
          amountRub !== entry.amountRub
            ? [
                {
                  field: "Сумма начисления",
                  from: entry.amountRub === null ? "нет" : String(entry.amountRub),
                  to: amountRub === null ? "нет" : String(amountRub),
                },
              ]
            : [],
      };

      const next = update((s) => ({
        ...s,
        entries: s.entries.map((e) => (e.id === draft.id ? draft : e)),
        reviews: [review, ...s.reviews],
        audit: [
          audit(s, {
            actor: s.actorId,
            action: `entry.${input.action}`,
            entityId: draft.id,
            detail: `${entry.number}: ${input.comment?.trim() ?? "без комментария"}`,
          }),
          ...s.audit,
        ],
      }));
      return done(next.entries.find((e) => e.id === draft.id)!);
    },

    setEstimate: (input) => {
      const snapshot = getSnapshot();
      const actor = snapshot.users.find((u) => u.id === snapshot.actorId);
      if (actor?.role === "foreman") {
        throw new GasOpsError("not-allowed", "Суммы вносит менеджер, бригадир их не видит.");
      }
      const object = snapshot.objects.find((o) => o.id === input.objectId);
      if (!object) throw new GasOpsError("no-object", "Объект не найден.");

      const existing = snapshot.estimates.find((e) => e.objectId === input.objectId);
      const estimate: Estimate = {
        id: existing?.id ?? newId("est"),
        objectId: input.objectId,
        version: (existing?.version ?? 0) + 1,
        amountRub: Math.round(input.amountRub),
        status: "confirmed",
        origin: "manual",
        confirmedBy: snapshot.actorId,
        confirmedAt: nowOf(snapshot),
        note: input.note ?? "Ручной ввод суммы по объекту без сметы",
        source: "mock",
      };
      const next = update((s) => ({
        ...s,
        estimates: [...s.estimates.filter((e) => e.objectId !== input.objectId), estimate],
        audit: [
          audit(s, {
            actor: s.actorId,
            action: "estimate.confirm",
            entityId: estimate.id,
            detail: `${object.label}: ${estimate.amountRub} ₽, версия ${estimate.version}`,
          }),
          ...s.audit,
        ],
      }));
      return done(next.estimates.find((e) => e.id === estimate.id)!);
    },

    reset: () => done(resetState()),
  };
}

export const gasOps = createGasOpsDemo();
