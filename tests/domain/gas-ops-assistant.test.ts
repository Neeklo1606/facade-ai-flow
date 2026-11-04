import { describe, expect, test } from "bun:test";
import { buildSeed } from "@/data/mock/gas-ops-seed";
import { answer, classify, suggestions, type AssistantContext } from "@/domain/gas-ops/assistant";
import type { TimeEntry } from "@/domain/gas-ops/model";
import { remindersAt, unsent, type ReminderInput } from "@/domain/gas-ops/reminders";
import type { GasData } from "@/domain/gas-ops/view";
import { closeReasons, coverage, expectations } from "@/domain/gas-ops/week";

/**
 * Помощник и напоминания (ADR-061, 13; разделы 4.8 и 5 документа табеля). Помощник отвечает
 * по данным недели теми же функциями, что «Неделя»; напоминания — кому что на момент T.
 */

const seed = (): GasData => ({ ...buildSeed(), actorId: "u-manager" });

/** Причины закрытия той же сборкой, что `useGasWeekView` */
function contextOf(data: GasData, role: AssistantContext["role"] = "manager"): AssistantContext {
  const expected = expectations({
    days: data.week.days,
    brigades: data.brigades,
    objects: data.objects,
    schedule: data.schedule,
    assignments: data.assignments,
  });
  const reasons = closeReasons({
    days: data.week.days,
    entries: data.entries,
    estimates: data.estimates,
    objects: data.objects,
    brigades: data.brigades,
    crew: data.crew ?? [],
    finalChecks: [],
    missing: coverage(expected, data.entries).missing,
  });
  return { role, data, reasons };
}

describe("помощник: распознавание вопросов раздела 4.8", () => {
  test("пять подсказанных вопросов распознаются, свободный — нет", () => {
    expect(classify("Что мешает закрыть неделю?")).toBe("close-week");
    expect(classify("Записи с пересечением за неделю")).toBe("overlaps");
    expect(classify("У каких бригад не указан состав?")).toBe("no-crew");
    expect(classify("Сколько часов у бригады 3 на Вишнёвой 6?")).toBe("brigade-hours");
    expect(classify("Почему у записи ГЗ-00100 нет суммы?")).toBe("no-sum");
    expect(classify("Какая погода завтра?")).toBeNull();
  });

  test("подсказки подставлены из данных недели и сами распознаются", () => {
    const data = seed();
    const list = suggestions(data);
    expect(list.length).toBe(5);
    for (const q of list) {
      expect(classify(q), q).not.toBeNull();
      // Подсказка ведёт к ответу, а не к «не нашёл»
      expect(answer(q, contextOf(data)).text.join(" "), q).not.toMatch(
        /Не нашёл|Под адрес подходит/,
      );
    }
  });
});

describe("помощник: ответы по данным недели", () => {
  test("«Что мешает закрыть неделю» — те же причины, что «Неделя», со ссылками", () => {
    const data = seed();
    const ctx = contextOf(data);
    const reply = answer("Что мешает закрыть неделю?", ctx);
    expect(reply.intent).toBe("close-week");
    expect(reply.text[0]).toBe(`Закрыть неделю мешает причин: ${ctx.reasons.length}.`);
    expect(reply.items[0]!.text).toBe("Не проверено записей: 6");
    expect(reply.items[0]!.to).toMatch(/^\/gas\/entries\?q=/);
    expect(reply.source).toBe("По данным недели 28.09–03.10");
    expect(reply.draft).toBeNull();
  });

  test("пересечения: ссылки на записи и черновик возврата только кнопкой человека", () => {
    const data = seed();
    const reply = answer("Записи с пересечением за неделю", contextOf(data));
    expect(reply.items).toHaveLength(1);
    expect(reply.items[0]!.text).toContain("ГЗ-00097");
    expect(reply.items[0]!.text).toContain("ГЗ-00098");
    expect(reply.draft?.kind).toBe("clarify");
    expect(reply.draft?.label).toBe("Вернуть 2 записи на уточнение");
    // Черновик не меняет данные: обе записи остаются на проверке
    for (const id of reply.draft!.entryIds)
      expect(data.entries.find((e) => e.id === id)?.status).toBe("pending");
  });

  test("без пересечений черновика нет", () => {
    const data = seed();
    data.entries = data.entries.filter((e) => e.number !== "ГЗ-00098");
    const reply = answer("Записи с пересечением за неделю", contextOf(data));
    expect(reply.text).toEqual(["Пересечений времени за неделю нет."]);
    expect(reply.draft).toBeNull();
  });

  test("состав: бригада без состава на сегодня называется, неизвестное не ноль", () => {
    const data = seed();
    data.crew = (data.crew ?? []).filter((m) => m.brigadeId !== "brg-5");
    const reply = answer("У каких бригад не указан состав?", contextOf(data));
    expect(reply.text[0]).toBe("Без состава на 03.10: 1 бригада.");
    expect(reply.items.map((i) => i.text)).toContain("Бригада 5");
  });

  test("часы бригады на объекте: подтверждённое отдельно от неподтверждённого", () => {
    const data = seed();
    const code = data.objects.find((o) => o.id === "obj-m2")!.code;
    const reply = answer(`Сколько часов у бригады 4 на ${code}?`, contextOf(data));
    const entries = data.entries.filter(
      (e) => e.brigadeId === "brg-4" && e.objectId === "obj-m2" && e.status !== "rejected",
    );
    expect(entries.length).toBeGreaterThan(0);
    expect(reply.intent).toBe("brigade-hours");
    expect(reply.items).toHaveLength(entries.length);
    expect(reply.text[1]).toContain("в итог недели они не входят");
  });

  test("часы по адресу с другим падежом: «на Вишнёвой 6» находит «ул. Вишнёвая, 6»", () => {
    const data = seed();
    const object = data.objects.find((o) => o.id === "obj-m2")!;
    data.objects = data.objects.map((o) =>
      o.id === object.id ? { ...o, label: "ст. Демо-Северная, ул. Вишнёвая, 6 - котел" } : o,
    );
    const reply = answer("Сколько часов у бригады 4 на Вишнёвой 6?", contextOf(data));
    expect(reply.text[0]).toContain("Бригада 4 на ст. Демо-Северная, ул. Вишнёвая, 6");
    expect(reply.text[0]).toMatch(/подтверждено \d+,\d{2} ч/);
  });

  test("нет суммы: причина и формула; бригадиру сумм не показывают", () => {
    const data = seed();
    const reply = answer("Почему у записи ГЗ-00011 нет суммы?", contextOf(data));
    expect(reply.text[0]).toBe(
      "У записи ГЗ-00011 нет суммы: нет подтверждённой стоимости объекта.",
    );
    expect(reply.items.at(-1)).toEqual({
      text: "Открыть ГЗ-00011",
      to: "/gas/entries?q=%D0%93%D0%97-00011",
    });
    const foreman = answer("Почему у записи ГЗ-00011 нет суммы?", contextOf(data, "foreman"));
    expect(foreman.text).toEqual(["Суммы вашей роли не показываются."]);
  });

  test("свободный вопрос без модели: список того, на что помощник отвечает", () => {
    const data = seed();
    const reply = answer("Какая погода завтра?", contextOf(data));
    expect(reply.intent).toBeNull();
    expect(reply.items.map((i) => i.text)).toEqual(suggestions(data));
  });
});

/* ---------------------------------------------------------------- Напоминания */

function reminderInput(data: GasData, at: string): ReminderInput {
  return {
    at,
    time: "18:00",
    expected: expectations({
      days: data.week.days,
      brigades: data.brigades,
      objects: data.objects,
      schedule: data.schedule,
      assignments: data.assignments,
    }),
    entries: data.entries,
    users: data.users,
    brigades: data.brigades,
    objects: data.objects,
  };
}

describe("напоминания: кому что напомнить на момент T", () => {
  test("до времени напоминания ничего не уходит", () => {
    expect(remindersAt(reminderInput(seed(), "2026-10-03T17:59"))).toEqual([]);
  });

  test("после 18:00 бригадиру без записи по графику — напоминание с объектами", () => {
    const data = seed();
    const list = remindersAt(reminderInput(data, "2026-10-03T18:00"));
    const missing = list.find((r) => r.kind === "missing");
    // У Бригады 1 на сегодня ОБ-200 и obj-m1; по obj-m1 есть черновик, по ОБ-200 записи нет
    expect(missing?.userId).toBe("u-foreman-1");
    expect(missing?.key).toBe("2026-10-03|missing|u-foreman-1");
    const m200 = data.objects.find((o) => o.id === "obj-m200")!.label;
    expect(missing?.text).toBe(
      `Нет записи времени за 03.10: ${m200}. Внесите время, пока помните.`,
    );
  });

  test("запись бригады закрывает напоминание, отклонённая — нет", () => {
    const data = seed();
    const base: TimeEntry = { ...data.entries.find((e) => e.number === "ГЗ-00095")! };
    data.entries = [
      ...data.entries,
      { ...base, id: "x", number: "ГЗ-09999", objectId: "obj-m200", status: "pending" },
    ];
    expect(
      remindersAt(reminderInput(data, "2026-10-03T18:30")).some((r) => r.kind === "missing"),
    ).toBe(false);
    data.entries = data.entries.map((e) => (e.id === "x" ? { ...e, status: "rejected" } : e));
    expect(
      remindersAt(reminderInput(data, "2026-10-03T18:30")).some((r) => r.kind === "missing"),
    ).toBe(true);
  });

  test("запись на уточнении — бригадиру вопрос; бригады без бригадира — в сводке менеджера", () => {
    const data = seed();
    data.entries = data.entries.map((e) =>
      e.number === "ГЗ-00095" ? { ...e, status: "clarify" } : e,
    );
    const list = remindersAt(reminderInput(data, "2026-10-03T19:00"));
    expect(list.find((r) => r.kind === "clarify")?.text).toBe(
      "Менеджер ждёт ответа по записи ГЗ-00095.",
    );
    const summary = list.find((r) => r.kind === "summary");
    expect(summary?.userId).toBe("u-manager");
    expect(summary?.text).toContain("без бригадира в системе, напоминание не ушло: ");
    expect(summary?.text).toContain("ждут проверки: 6");
    // Длинный список сокращается: три названия и «и ещё N»
    expect(summary?.text).toMatch(
      /нет записи у бригад: 9 \(Бригада 1, Бригада 3, Бригада 4 и ещё 6\)/,
    );
  });

  test("повторная проверка в тот же день не шлёт то же сообщение", () => {
    const data = seed();
    // Сводка менеджеру уходит в 19:00 (1.7): после неё за день нового нет
    const first = remindersAt(reminderInput(data, "2026-10-03T19:00"));
    const sent = new Set(first.map((r) => r.key));
    expect(unsent(remindersAt(reminderInput(data, "2026-10-03T21:00")), sent)).toEqual([]);
  });

  test("сроки (финальный промт, 1.7): вопрос сразу, напоминание в 18:00, сводка в 19:00", () => {
    const data = seed();
    data.entries = data.entries.map((e) =>
      e.number === "ГЗ-00095" ? { ...e, status: "clarify" } : e,
    );
    const kinds = (at: string) => [
      ...new Set(remindersAt(reminderInput(data, at)).map((r) => r.kind)),
    ];
    expect(kinds("2026-10-03T09:00")).toEqual(["clarify"]);
    expect(kinds("2026-10-03T18:00").sort()).toEqual(["clarify", "missing"]);
    expect(kinds("2026-10-03T19:00").sort()).toEqual(["clarify", "missing", "summary"]);
    // Своё время сводки
    const late = { ...reminderInput(data, "2026-10-03T19:30"), summaryTime: "20:00" };
    expect(remindersAt(late).some((r) => r.kind === "summary")).toBe(false);
  });

  test("неверное время напоминания ничего не отправляет", () => {
    const input = { ...reminderInput(seed(), "2026-10-03T23:00"), time: "25:00" };
    expect(remindersAt(input)).toEqual([]);
  });
});
