/**
 * Демо-адаптер газового направления (ADR-043): порт поверх состояния вкладки.
 *
 * Правила проверяет адаптер, а не экран: ошибки ТЗ, п. 5.7 (некорректное время, дубль,
 * пересечение, нет объекта) и обязательный комментарий при правке приходят оттуда же,
 * откуда их будет отдавать сервер. Экран только показывает текст ошибки.
 */
import {
  effectiveMinutes,
  findDuplicates,
  findOverlaps,
  flagsOf,
  MINUTES_ERROR_TEXT,
} from "@/domain/gas-ops/calc";
import {
  allocateByMinutes,
  canConfirmVersion,
  nextVersion,
  recalcObject,
  ruleFor,
  ruleFormula,
  workCostRub,
  type CostRule,
  type EstimateVersion,
} from "@/domain/gas-ops/work-cost";
import { setBrigadeStatus } from "@/domain/gas-ops/schedule";
import {
  AUTO_ACTOR,
  REVIEW_MODE_LABEL,
  accuracyOf,
  finalCheckList,
  modeAvailability,
  routeEntry,
  type FinalCheck,
} from "@/domain/gas-ops/review-policy";
import { reportEntries } from "@/domain/gas-ops/report";
import {
  ENTRY_STATUS_LABEL,
  type AuditLog,
  type EntryStatus,
  type Estimate,
  type Review,
  type TimeEntry,
} from "@/domain/gas-ops/model";
import { allowedObjectIdsFor } from "@/domain/gas-ops/view";
import {
  defaultHeadcount,
  frameOfPeople,
  personRows,
  type CrewMember,
  type Rate,
} from "@/domain/gas-ops/crew";
import { fieldFor } from "@/domain/gas-ops/field";
import {
  blockingReasons,
  closeReasons,
  coverage,
  expectations,
  freezeWeek,
  isDayLocked,
  periodState,
  type PeriodVersion,
} from "@/domain/gas-ops/week";
import {
  GasOpsError,
  type CreateEntryInput,
  type GasOpsPort,
  type GasOpsSnapshot,
  type ReportIssue,
  type ReviewInput,
  type UpdateEntryInput,
} from "@/ports/gas-ops";
import { getSnapshot, resetState, update } from "./state";

const done = <T>(value: T) => Promise.resolve(value);

/*
 * Поля решения проверки, по которым его можно отменить: решение помнит, что было до него.
 * Подписи человеческие, потому что те же изменения показывает история записи.
 */
const STATUS_FIELD = "Статус";
const AMOUNT_FIELD = "Сумма начисления";
const COMMENT_FIELD = "Комментарий";

function statusOfLabel(label: string): EntryStatus | null {
  const found = (Object.keys(ENTRY_STATUS_LABEL) as EntryStatus[]).find(
    (key) => ENTRY_STATUS_LABEL[key] === label,
  );
  return found ?? null;
}

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
  const allowed = actor ? allowedObjectIdsFor(snapshot, actor) : "all";
  if (allowed !== "all" && !allowed.has(draft.objectId)) {
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

/**
 * Доля стоимости объекта для записи (ADR-053, 3): подтверждённая стоимость распределяется
 * по минутам всех неотклонённых записей объекта. Нет подтверждённой стоимости — null.
 */
function shareOf(snapshot: GasOpsSnapshot, draft: TimeEntry): number | null {
  const estimate = snapshot.estimates.find(
    (e) => e.objectId === draft.objectId && e.status === "confirmed",
  );
  if (!estimate) return null;
  const own = [
    ...snapshot.entries.filter(
      (e) => e.objectId === draft.objectId && e.status !== "rejected" && e.id !== draft.id,
    ),
    draft,
  ];
  return (
    allocateByMinutes(
      estimate.amountRub,
      own.map((e) => ({ id: e.id, minutes: e.minutes })),
    ).get(draft.id) ?? null
  );
}

/**
 * Отправленная запись в режиме проверки (ADR-053, 5): «auto» подтверждает её сразу от имени
 * системы, и тогда её найдёт итоговая проверка перед отчётом.
 */
function routed(snapshot: GasOpsSnapshot, draft: TimeEntry): TimeEntry {
  if (draft.status !== "pending") return draft;
  const objectDays = new Set(
    snapshot.entries.filter((e) => e.objectId === draft.objectId).map((e) => e.day),
  ).size;
  // Признаки считаются с долей стоимости объекта: без неё любая новая запись была бы «без суммы»
  const candidate = { ...draft, amountRub: draft.amountRub ?? shareOf(snapshot, draft) };
  const flags = flagsOf({
    entry: candidate,
    all: [...snapshot.entries.filter((e) => e.id !== draft.id), candidate],
    hasEstimate: snapshot.estimates.some(
      (e) => e.objectId === draft.objectId && e.status === "confirmed",
    ),
    objectDays,
  });
  if (routeEntry(snapshot.reviewSettings.mode, flags) === "queue") return draft;
  return {
    ...draft,
    status: "confirmed",
    amountRub: candidate.amountRub,
    reviewedBy: AUTO_ACTOR,
    reviewedAt: nowOf(snapshot),
  };
}

/**
 * Новая стоимость объекта: пересчёт неподтверждённых записей и пометка сданных отчётов.
 * Подтверждённые записи и выданные отчёты молча не меняются.
 */
function applyCost(
  s: GasOpsSnapshot,
  objectId: string,
  amountRub: number,
  reason: string,
): { snapshot: GasOpsSnapshot; changed: number; stale: number } {
  const recalc = recalcObject(s.entries, objectId, amountRub);
  let stale = 0;
  const reportIssues = s.reportIssues.map((r) => {
    if (r.stale || !r.objectIds.includes(objectId)) return r;
    stale++;
    return { ...r, stale: true, staleReason: reason };
  });
  return {
    snapshot: { ...s, entries: recalc.entries, reportIssues },
    changed: recalc.changed.length,
    stale,
  };
}

function mustVersion(snapshot: GasOpsSnapshot, id: string): EstimateVersion {
  const v = snapshot.estimateVersions.find((x) => x.id === id);
  if (!v) throw new GasOpsError("not-found", "Смета не найдена. Обновите экран.");
  return v;
}

function mustManager(snapshot: GasOpsSnapshot, message: string): void {
  const actor = snapshot.users.find((u) => u.id === snapshot.actorId);
  if (!actor || actor.role === "foreman" || actor.role === "director") {
    throw new GasOpsError("not-allowed", message);
  }
}

/** Закрытая неделя не меняется (инвариант 1.4, 3): правка, решение и новая запись отклоняются */
function mustBeOpen(snapshot: GasOpsSnapshot, ...days: string[]): void {
  if (days.some((day) => isDayLocked(snapshot.periods, day))) {
    throw new GasOpsError(
      "period-closed",
      "Неделя закрыта. Изменения возможны только после переоткрытия с причиной.",
    );
  }
}

/** Закрывает и переоткрывает неделю руководитель или администратор */
function mustDirector(snapshot: GasOpsSnapshot, message: string): void {
  const actor = snapshot.users.find((u) => u.id === snapshot.actorId);
  if (!actor || (actor.role !== "director" && actor.role !== "admin")) {
    throw new GasOpsError("not-allowed", message);
  }
}

/** Причины недели по текущему снимку: те же, что видит экран «Неделя» */
export function weekReasons(snapshot: GasOpsSnapshot) {
  const expected = expectations({
    days: snapshot.week.days,
    brigades: snapshot.brigades,
    objects: snapshot.objects,
    schedule: snapshot.schedule,
    assignments: snapshot.assignments,
  });
  const { missing } = coverage(expected, snapshot.entries);
  return closeReasons({
    days: snapshot.week.days,
    entries: snapshot.entries,
    estimates: snapshot.estimates,
    objects: snapshot.objects,
    brigades: snapshot.brigades,
    crew: snapshot.crew,
    finalChecks: snapshot.finalChecks,
    missing,
  });
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
      // Повтор отправки с тем же ключом: та же запись, дубля нет (инвариант 1.4, 4)
      const key = input.clientKey?.trim() || null;
      const repeated = key ? snapshot.entries.find((e) => e.clientKey === key) : undefined;
      if (repeated) return done(repeated);
      mustBeOpen(snapshot, input.day);

      const people = input.people?.length ? personRows(input.people) : null;
      if (people && !people.ok) {
        throw new GasOpsError("bad-time", `Строка ${people.index + 1}: ${people.message}`);
      }
      const frame = people?.ok ? frameOfPeople(people.people) : null;
      const minutes = frame
        ? ({ ok: true, ...frame } as const)
        : effectiveMinutes({
            start: input.start,
            end: input.end,
            breakMinutes: input.breakMinutes,
          });
      if (!minutes.ok) throw new GasOpsError("bad-time", MINUTES_ERROR_TEXT[minutes.error]);
      if (input.headcount !== undefined && input.headcount !== null && input.headcount < 1) {
        throw new GasOpsError("bad-time", "В записи должен быть хотя бы один человек.");
      }
      const actorRole = snapshot.users.find((u) => u.id === snapshot.actorId)?.role;

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
        headcount: people?.ok
          ? people.people.length
          : input.headcount === undefined
            ? defaultHeadcount(snapshot.crew, input.brigadeId, input.day)
            : input.headcount,
        people: people?.ok ? people.people : null,
        clientKey: key,
        channel: input.channel ?? (actorRole === "foreman" ? "web" : "manager"),
        note: input.note?.trim() || null,
      };
      validate(snapshot, draft);
      const placed = routed(snapshot, draft);

      const next = update((s) => ({
        ...s,
        entries: [...s.entries, placed],
        audit: [
          audit(s, {
            actor: s.actorId,
            action:
              placed.reviewedBy === AUTO_ACTOR
                ? "entry.auto-confirm"
                : input.submit
                  ? "entry.submit"
                  : "entry.draft",
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
      mustBeOpen(snapshot, entry.day, input.day ?? entry.day);

      /*
       * Бригадир правит только до проверки (ТЗ, п. 4; ADR-044, F4): черновик, запись, которая
       * ещё ждёт проверки, и запись, возвращённую на уточнение. После решения правит менеджер.
       */
      if (
        actor?.role === "foreman" &&
        entry.status !== "draft" &&
        entry.status !== "pending" &&
        entry.status !== "clarify"
      ) {
        throw new GasOpsError(
          "already-reviewed",
          "Запись уже проверена. Исправления вносит менеджер.",
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
        headcount: input.headcount === undefined ? (entry.headcount ?? null) : input.headcount,
        // Правка рамки или состава отменяет строки людей: дальше запись считается целиком
        people:
          input.start !== undefined || input.end !== undefined || input.headcount !== undefined
            ? null
            : (entry.people ?? null),
      };
      if ((draft.headcount ?? null) !== (entry.headcount ?? null))
        changes.push({
          field: "Состав",
          from: entry.headcount == null ? "не указан" : `${entry.headcount} чел.`,
          to: draft.headcount == null ? "не указан" : `${draft.headcount} чел.`,
        });
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
      mustBeOpen(snapshot, entry.day);
      if (entry.status === "confirmed") {
        throw new GasOpsError("already-reviewed", "Запись уже подтверждена.");
      }
      const draft: TimeEntry = { ...entry, status: "pending", comment: null };
      validate(snapshot, draft);
      const placed = routed(snapshot, draft);
      const auto = placed.reviewedBy === AUTO_ACTOR;
      const next = update((s) => ({
        ...s,
        entries: s.entries.map((e) => (e.id === id ? placed : e)),
        audit: [
          audit(s, {
            actor: s.actorId,
            action: auto ? "entry.auto-confirm" : "entry.submit",
            entityId: id,
            detail: auto
              ? `${entry.number} подтверждена автоматически: режим «${REVIEW_MODE_LABEL[s.reviewSettings.mode]}»`
              : `${entry.number} отправлена на проверку`,
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
      mustBeOpen(snapshot, entry.day);
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
      // Сумма — доля подтверждённой стоимости объекта по минутам (ADR-053, 3), а не вся смета
      const amountRub =
        status === "confirmed" ? (entry.amountRub ?? shareOf(snapshot, entry)) : entry.amountRub;

      const draft: TimeEntry = {
        ...entry,
        status,
        amountRub,
        reviewedBy: snapshot.actorId,
        reviewedAt: nowOf(snapshot),
        comment: input.comment?.trim() ?? null,
      };
      const changes: Review["changes"] = [
        {
          field: STATUS_FIELD,
          from: ENTRY_STATUS_LABEL[entry.status],
          to: ENTRY_STATUS_LABEL[status],
        },
      ];
      if (amountRub !== entry.amountRub)
        changes.push({
          field: AMOUNT_FIELD,
          from: entry.amountRub === null ? "нет" : String(entry.amountRub),
          to: amountRub === null ? "нет" : String(amountRub),
        });
      if (entry.comment && entry.comment !== draft.comment)
        changes.push({ field: COMMENT_FIELD, from: entry.comment, to: draft.comment ?? "" });
      const review: Review = {
        id: newId("rev"),
        entryId: entry.id,
        action: input.action,
        actor: snapshot.actorId,
        at: nowOf(snapshot),
        comment: input.comment?.trim() ?? null,
        changes,
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

    undoReview: (id) => {
      const snapshot = getSnapshot();
      const entry = mustFind(snapshot, id);
      const actor = snapshot.users.find((u) => u.id === snapshot.actorId);
      if (actor?.role === "foreman") {
        throw new GasOpsError("not-allowed", "Проверку ведёт менеджер.");
      }
      mustBeOpen(snapshot, entry.day);
      // Решения лежат от нового к старому: первое по записи и есть последнее
      const last = snapshot.reviews.find((r) => r.entryId === id);
      const statusChange = last?.changes.find((c) => c.field === STATUS_FIELD);
      const before = statusChange ? statusOfLabel(statusChange.from) : null;
      const after = statusChange ? statusOfLabel(statusChange.to) : null;
      if (!last || last.action === "correct" || !before || after !== entry.status) {
        throw new GasOpsError("nothing-to-undo", "Отменять нечего: запись уже изменилась.");
      }

      const amountChange = last.changes.find((c) => c.field === AMOUNT_FIELD);
      const commentChange = last.changes.find((c) => c.field === COMMENT_FIELD);
      const earlier = snapshot.reviews.find((r) => r.entryId === id && r.id !== last.id);
      const restored: TimeEntry = {
        ...entry,
        status: before,
        amountRub: amountChange
          ? amountChange.from === "нет"
            ? null
            : Number(amountChange.from)
          : entry.amountRub,
        reviewedBy: earlier?.actor ?? null,
        reviewedAt: earlier?.at ?? null,
        comment: commentChange ? commentChange.from : null,
      };

      const next = update((s) => ({
        ...s,
        entries: s.entries.map((e) => (e.id === id ? restored : e)),
        reviews: s.reviews.filter((r) => r.id !== last.id),
        audit: [
          audit(s, {
            actor: s.actorId,
            action: "entry.undo",
            entityId: id,
            detail: `${entry.number}: отменено «${ENTRY_STATUS_LABEL[entry.status]}», снова «${ENTRY_STATUS_LABEL[before]}»`,
          }),
          ...s.audit,
        ],
      }));
      return done(next.entries.find((e) => e.id === id)!);
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
      const next = update((s) => {
        const applied = applyCost(
          {
            ...s,
            estimates: [...s.estimates.filter((e) => e.objectId !== input.objectId), estimate],
          },
          input.objectId,
          estimate.amountRub,
          `Стоимость объекта введена вручную: ${estimate.amountRub} ₽`,
        );
        return {
          ...applied.snapshot,
          audit: [
            audit(s, {
              actor: s.actorId,
              action: "estimate.confirm",
              entityId: estimate.id,
              detail: `${object.label}: ${estimate.amountRub} ₽, версия ${estimate.version}, вручную`,
            }),
            ...s.audit,
          ],
        };
      });
      return done(next.estimates.find((e) => e.id === estimate.id)!);
    },

    addEstimateVersion: (input) => {
      const snapshot = getSnapshot();
      mustManager(snapshot, "Сметы загружает менеджер или сметчик.");
      const { parsed } = input;
      const version: EstimateVersion = {
        id: newId("esv"),
        objectId: input.objectId,
        version: nextVersion(input.objectId, snapshot.estimateVersions),
        fileName: input.fileName,
        sheet: parsed.sheet,
        uploadedAt: nowOf(snapshot),
        uploadedBy: snapshot.actorId,
        format: parsed.format,
        parseStatus: parsed.status,
        totals: parsed.totals,
        vatRate: parsed.vatRate,
        laborHours: parsed.laborHours,
        sections: parsed.sections,
        issues: parsed.issues,
        issuesReviewedBy: null,
        confirmedBy: null,
        confirmedAt: null,
      };
      update((s) => ({
        ...s,
        estimateVersions: [version, ...s.estimateVersions],
        audit: [
          audit(s, {
            actor: s.actorId,
            action: "estimate.upload",
            entityId: version.id,
            // Имя файла в журнал не пишется: в именах смет адреса объектов
            detail: `Смета загружена, версия ${version.version}, замечаний ${parsed.issues.length}`,
          }),
          ...s.audit,
        ],
      }));
      return done(version);
    },

    linkEstimateVersion: (input) => {
      const snapshot = getSnapshot();
      mustManager(snapshot, "Привязку подтверждает менеджер или сметчик.");
      const v = mustVersion(snapshot, input.id);
      if (v.confirmedAt) throw new GasOpsError("already-reviewed", "Версия уже подтверждена.");
      const object = snapshot.objects.find((o) => o.id === input.objectId);
      if (!object) throw new GasOpsError("no-object", "Объект не найден.");
      const linked: EstimateVersion = {
        ...v,
        objectId: object.id,
        version: nextVersion(
          object.id,
          snapshot.estimateVersions.filter((x) => x.id !== v.id),
        ),
      };
      const next = update((s) => ({
        ...s,
        estimateVersions: s.estimateVersions.map((x) => (x.id === v.id ? linked : x)),
        audit: [
          audit(s, {
            actor: s.actorId,
            action: "estimate.link",
            entityId: v.id,
            detail: `Смета привязана к объекту ${object.code}, версия ${linked.version}`,
          }),
          ...s.audit,
        ],
      }));
      return done(mustVersion(next, v.id));
    },

    reviewEstimateIssues: (id) => {
      const snapshot = getSnapshot();
      mustManager(snapshot, "Замечания проверяет сметчик или менеджер.");
      const v = mustVersion(snapshot, id);
      const next = update((s) => ({
        ...s,
        estimateVersions: s.estimateVersions.map((x) =>
          x.id === id ? { ...x, issuesReviewedBy: s.actorId } : x,
        ),
        audit: [
          audit(s, {
            actor: s.actorId,
            action: "estimate.issues-reviewed",
            entityId: id,
            detail: `Замечания разбора проверены: ${v.issues.length}`,
          }),
          ...s.audit,
        ],
      }));
      return done(mustVersion(next, id));
    },

    confirmEstimateVersion: (id) => {
      const snapshot = getSnapshot();
      mustManager(snapshot, "Смету подтверждает менеджер или сметчик.");
      const v = mustVersion(snapshot, id);
      const ready = canConfirmVersion(v);
      if (!ready.ok) throw new GasOpsError("estimate-not-ready", ready.reason);
      const objectId = v.objectId!;
      const rule = ruleFor(objectId, snapshot.costRules);
      const amountRub = workCostRub(v, rule);
      if (amountRub === null) {
        throw new GasOpsError(
          "estimate-not-ready",
          `В смете нет строк для правила «${ruleFormula(rule.terms)}». Введите сумму вручную.`,
        );
      }
      const at = nowOf(snapshot);
      const existing = snapshot.estimates.find((e) => e.objectId === objectId);
      const estimate: Estimate = {
        id: existing?.id ?? newId("est"),
        objectId,
        version: v.version,
        amountRub,
        status: "confirmed",
        origin: "estimate",
        confirmedBy: snapshot.actorId,
        confirmedAt: at,
        note: `${ruleFormula(rule.terms)}${rule.status === "needs-agreement" ? " (правило требует согласования)" : ""}`,
        source: "mock",
      };
      let changed = 0;
      let stale = 0;
      const next = update((s) => {
        const withVersion: GasOpsSnapshot = {
          ...s,
          estimateVersions: s.estimateVersions.map((x) =>
            x.id === id ? { ...x, confirmedBy: s.actorId, confirmedAt: at } : x,
          ),
          estimates: [...s.estimates.filter((e) => e.objectId !== objectId), estimate],
        };
        const applied = applyCost(
          withVersion,
          objectId,
          amountRub,
          `Подтверждена смета версии ${v.version}: ${amountRub} ₽`,
        );
        changed = applied.changed;
        stale = applied.stale;
        return {
          ...applied.snapshot,
          audit: [
            audit(s, {
              actor: s.actorId,
              action: "estimate.confirm",
              entityId: estimate.id,
              detail: `Смета версии ${v.version}: ${amountRub} ₽ по правилу «${ruleFormula(rule.terms)}», пересчитано записей ${applied.changed}`,
            }),
            ...s.audit,
          ],
        };
      });
      return done({
        version: mustVersion(next, id),
        estimate: next.estimates.find((e) => e.id === estimate.id)!,
        changedEntries: changed,
        staleReports: stale,
      });
    },

    confirmCostRule: (input) => {
      const snapshot = getSnapshot();
      mustManager(snapshot, "Правило подтверждает сметчик или менеджер.");
      const rule: CostRule = {
        id: input.objectId ? `rule-${input.objectId}` : "rule-company",
        objectId: input.objectId,
        terms: input.terms,
        status: "confirmed",
        confirmedBy: snapshot.actorId,
        confirmedAt: nowOf(snapshot),
      };
      const next = update((s) => ({
        ...s,
        costRules: [...s.costRules.filter((r) => r.objectId !== input.objectId), rule],
        audit: [
          audit(s, {
            actor: s.actorId,
            action: "cost-rule.confirm",
            entityId: rule.id,
            detail: `${input.objectId ? "Для объекта" : "Для компании"}: ${ruleFormula(rule.terms)}`,
          }),
          ...s.audit,
        ],
      }));
      return done(next.costRules.find((r) => r.id === rule.id)!);
    },

    applySchedule: (input) => {
      const snapshot = getSnapshot();
      mustManager(snapshot, "График загружает менеджер.");
      const previous = snapshot.schedule;
      update((s) => ({
        ...s,
        schedule: {
          rows: input.rows,
          fileName: input.fileName,
          appliedAt: nowOf(s),
          appliedBy: s.actorId,
        },
        audit: [
          audit(s, {
            actor: s.actorId,
            action: "schedule.apply",
            entityId: "schedule",
            detail: `График недели применён: строк ${input.rows.length}`,
          }),
          ...s.audit,
        ],
      }));
      return done(previous);
    },

    restoreSchedule: (previous) => {
      update((s) => ({
        ...s,
        schedule: previous,
        audit: [
          audit(s, {
            actor: s.actorId,
            action: "schedule.undo",
            entityId: "schedule",
            detail: "Применение графика отменено",
          }),
          ...s.audit,
        ],
      }));
      return done(undefined);
    },

    setBrigadeWeek: (input) => {
      const snapshot = getSnapshot();
      mustManager(snapshot, "Отметки бригад ставит менеджер.");
      const brigade = snapshot.brigades.find((b) => b.id === input.brigadeId);
      if (!brigade) throw new GasOpsError("not-found", "Бригада не найдена.");
      const next = update((s) => ({
        ...s,
        brigadeAvailability: setBrigadeStatus(s.brigadeAvailability, input),
        audit: [
          audit(s, {
            actor: s.actorId,
            action: "brigade.week",
            entityId: brigade.id,
            detail: `${brigade.code}: ${input.status === "working" ? "работает" : "в отпуске"} на неделе с ${input.weekFrom}`,
          }),
          ...s.audit,
        ],
      }));
      return done(next.brigadeAvailability);
    },

    setReviewSettings: (input) => {
      const snapshot = getSnapshot();
      mustManager(snapshot, "Режим проверки меняет менеджер или администратор.");
      const threshold = Math.min(100, Math.max(50, Math.round(input.thresholdPercent)));
      const available = modeAvailability(input.mode, accuracyOf(snapshot.reviews), threshold);
      if (!available.ok) throw new GasOpsError("mode-unavailable", available.reason);
      const next = update((s) => ({
        ...s,
        reviewSettings: {
          mode: input.mode,
          thresholdPercent: threshold,
          changedBy: s.actorId,
          changedAt: nowOf(s),
        },
        audit: [
          audit(s, {
            actor: s.actorId,
            action: "review.mode",
            entityId: "review-settings",
            detail: `Режим «${REVIEW_MODE_LABEL[input.mode]}», порог ${threshold}%`,
          }),
          ...s.audit,
        ],
      }));
      return done(next.reviewSettings);
    },

    finalCheck: () => {
      const snapshot = getSnapshot();
      mustManager(snapshot, "Итоговую проверку проводит менеджер.");
      const list = finalCheckList(snapshot.entries, snapshot.finalChecks, snapshot.week.days);
      const check: FinalCheck = {
        id: newId("fch"),
        week: snapshot.week.from,
        at: nowOf(snapshot),
        by: snapshot.actorId,
        entryIds: list.map((e) => e.id),
      };
      update((s) => ({
        ...s,
        finalChecks: [check, ...s.finalChecks],
        audit: [
          audit(s, {
            actor: s.actorId,
            action: "report.final-check",
            entityId: check.id,
            detail: `Итоговая проверка: подтверждено записей без ручного решения ${list.length}`,
          }),
          ...s.audit,
        ],
      }));
      return done(check);
    },

    issueReport: () => {
      const snapshot = getSnapshot();
      mustManager(snapshot, "Отчёт сдаёт менеджер.");
      const left = finalCheckList(snapshot.entries, snapshot.finalChecks, snapshot.week.days);
      if (left.length > 0) {
        throw new GasOpsError(
          "final-check-required",
          `Перед сдачей нужна итоговая проверка: ${left.length} записей без ручного подтверждения.`,
        );
      }
      const week = new Set(snapshot.week.days);
      const included = reportEntries(snapshot.entries, "confirmed").filter((e) => week.has(e.day));
      const issue: ReportIssue = {
        id: newId("rep"),
        weekFrom: snapshot.week.from,
        issuedAt: nowOf(snapshot),
        issuedBy: snapshot.actorId,
        totalRub: included.reduce((a, e) => a + (e.amountRub ?? 0), 0),
        objectIds: [...new Set(included.map((e) => e.objectId))],
        stale: false,
        staleReason: null,
      };
      update((s) => ({
        ...s,
        reportIssues: [issue, ...s.reportIssues],
        audit: [
          audit(s, {
            actor: s.actorId,
            action: "report.issue",
            entityId: issue.id,
            detail: `Отчёт недели сдан: ${issue.totalRub} ₽, объектов ${issue.objectIds.length}`,
          }),
          ...s.audit,
        ],
      }));
      return done(issue);
    },

    fieldSnapshot: (brigadeId) => done(fieldFor(getSnapshot(), brigadeId)),

    answerClarify: (input) => {
      const snapshot = getSnapshot();
      const entry = mustFind(snapshot, input.id);
      const actor = snapshot.users.find((u) => u.id === snapshot.actorId);
      if (actor?.role === "foreman" && actor.brigadeId !== entry.brigadeId) {
        throw new GasOpsError("not-allowed", "Это запись другой бригады.");
      }
      mustBeOpen(snapshot, entry.day);
      if (entry.status !== "clarify") {
        throw new GasOpsError("already-reviewed", "Вопроса по записи уже нет. Обновите экран.");
      }
      const text = input.text.trim();
      if (!text) throw new GasOpsError("comment-required", "Напишите ответ менеджеру.");
      const draft: TimeEntry = { ...entry, status: "pending", note: text };
      const review: Review = {
        id: newId("rev"),
        entryId: entry.id,
        action: "answer",
        actor: snapshot.actorId,
        at: nowOf(snapshot),
        comment: text,
        changes: [
          {
            field: STATUS_FIELD,
            from: ENTRY_STATUS_LABEL.clarify,
            to: ENTRY_STATUS_LABEL.pending,
          },
        ],
      };
      const next = update((s) => ({
        ...s,
        entries: s.entries.map((e) => (e.id === entry.id ? draft : e)),
        reviews: [review, ...s.reviews],
        audit: [
          audit(s, {
            actor: s.actorId,
            action: "entry.answer",
            entityId: entry.id,
            detail: `${entry.number}: ${text}`,
          }),
          ...s.audit,
        ],
      }));
      return done(next.entries.find((e) => e.id === entry.id)!);
    },

    closeWeek: (input) => {
      const snapshot = getSnapshot();
      mustDirector(snapshot, "Неделю закрывает руководитель.");
      const state = periodState(snapshot.periods, snapshot.week.from);
      if (state.closed) {
        throw new GasOpsError(
          "period-closed",
          `Неделя уже закрыта, версия v${state.closed.version}.`,
        );
      }
      const reasons = weekReasons(snapshot);
      const left = blockingReasons(reasons, input.accepted);
      if (left.length > 0) {
        throw new GasOpsError(
          "close-blocked",
          `До закрытия осталось причин: ${left.length}. Первая: ${left[0]!.text}.`,
        );
      }
      const keys = new Set(reasons.map((r) => r.key));
      const version: PeriodVersion = {
        id: newId("per"),
        weekFrom: snapshot.week.from,
        weekTo: snapshot.week.to,
        version: state.nextVersion,
        closedAt: nowOf(snapshot),
        closedBy: snapshot.actorId,
        ...freezeWeek(snapshot.entries, snapshot.week.days),
        accepted: input.accepted
          .filter((a) => keys.has(a.key))
          .map((a) => ({ key: a.key, reason: a.reason.trim() })),
        reopenedAt: null,
        reopenedBy: null,
        reopenReason: null,
      };
      update((s) => ({
        ...s,
        periods: [...s.periods, version],
        audit: [
          audit(s, {
            actor: s.actorId,
            action: "period.close",
            entityId: version.id,
            detail: `Неделя ${version.weekFrom} закрыта, версия v${version.version}: ${version.totals.accruedRub} ₽, записей ${version.totals.count}`,
          }),
          ...s.audit,
        ],
      }));
      return done(version);
    },

    reopenWeek: (input) => {
      const snapshot = getSnapshot();
      mustDirector(snapshot, "Неделю переоткрывает руководитель.");
      const reason = input.reason.trim();
      if (!reason) throw new GasOpsError("comment-required", "Укажите причину переоткрытия.");
      const closed = periodState(snapshot.periods, snapshot.week.from).closed;
      if (!closed) throw new GasOpsError("not-found", "Неделя не закрыта.");
      const reopened: PeriodVersion = {
        ...closed,
        reopenedAt: nowOf(snapshot),
        reopenedBy: snapshot.actorId,
        reopenReason: reason,
      };
      update((s) => ({
        ...s,
        periods: s.periods.map((p) => (p.id === closed.id ? reopened : p)),
        audit: [
          audit(s, {
            actor: s.actorId,
            action: "period.reopen",
            entityId: closed.id,
            detail: `Неделя ${closed.weekFrom} переоткрыта, v${closed.version} сохранена: ${reason}`,
          }),
          ...s.audit,
        ],
      }));
      return done(reopened);
    },

    setRate: (input) => {
      const snapshot = getSnapshot();
      mustDirector(snapshot, "Ставки задаёт руководитель или администратор.");
      if (!Number.isFinite(input.rubPerHour) || input.rubPerHour <= 0) {
        throw new GasOpsError("bad-time", "Ставка должна быть больше нуля.");
      }
      // Новая ставка закрывает прежнюю того же адресата накануне своей даты
      const dayBefore = new Date(`${input.from}T00:00:00Z`);
      dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
      const until = dayBefore.toISOString().slice(0, 10);
      const rate: Rate = {
        id: newId("rate"),
        employeeId: input.employeeId,
        brigadeId: input.employeeId ? null : input.brigadeId,
        rubPerHour: Math.round(input.rubPerHour),
        from: input.from,
        to: null,
        source: "mock",
      };
      const same = (r: Rate) =>
        r.employeeId === rate.employeeId &&
        (rate.employeeId !== null || r.brigadeId === rate.brigadeId);
      update((s) => ({
        ...s,
        rates: [
          ...s.rates.map((r) =>
            same(r) && r.to === null && r.from < input.from ? { ...r, to: until } : r,
          ),
          rate,
        ],
        audit: [
          audit(s, {
            actor: s.actorId,
            action: "rate.set",
            entityId: rate.id,
            detail: `Ставка ${rate.rubPerHour} ₽/ч с ${rate.from}`,
          }),
          ...s.audit,
        ],
      }));
      return done(rate);
    },

    addCrewMember: (input) => {
      const snapshot = getSnapshot();
      mustManager(snapshot, "Состав бригады меняет менеджер или администратор.");
      const name = input.name.trim();
      if (!name) throw new GasOpsError("comment-required", "Укажите имя.");
      const member: CrewMember = {
        id: newId("crw"),
        brigadeId: input.brigadeId,
        employeeId: newId("emp"),
        name,
        role: "worker",
        from: input.from,
        to: null,
        source: "mock",
      };
      update((s) => ({
        ...s,
        crew: [...s.crew, member],
        audit: [
          audit(s, {
            actor: s.actorId,
            action: "crew.add",
            entityId: member.id,
            detail: `${name} в составе с ${input.from}`,
          }),
          ...s.audit,
        ],
      }));
      return done(member);
    },

    endCrewMember: (input) => {
      const snapshot = getSnapshot();
      mustManager(snapshot, "Состав бригады меняет менеджер или администратор.");
      const member = snapshot.crew.find((m) => m.id === input.id);
      if (!member) throw new GasOpsError("not-found", "Человек не найден в составе.");
      if (member.from && input.to < member.from) {
        throw new GasOpsError("bad-time", "Дата выхода раньше даты входа в состав.");
      }
      const ended: CrewMember = { ...member, to: input.to };
      update((s) => ({
        ...s,
        crew: s.crew.map((m) => (m.id === member.id ? ended : m)),
        audit: [
          audit(s, {
            actor: s.actorId,
            action: "crew.end",
            entityId: member.id,
            detail: `${member.name} в составе по ${input.to}`,
          }),
          ...s.audit,
        ],
      }));
      return done(ended);
    },

    reset: () => done(resetState()),
  };
}

export const gasOps = createGasOpsDemo();
