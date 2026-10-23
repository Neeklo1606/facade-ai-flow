import { describe, expect, test } from "bun:test";
import { parseTimeMessage, type ParseObject } from "@/domain/gas-ops/parse-time-message";

/**
 * Разбор фразы бригадира (ADR-049, 01_SPEC 8). Объекты: разрешённые бригаде, два похожих
 * («Луговой» и «Луговое») для проверки неоднозначности.
 */
const TODAY = "2026-10-03";
const OBJECTS: ParseObject[] = [
  { id: "o12", label: "ст. Демо-Северная, ул. Демо, 12 - котел", code: "ОБ-012" },
  { id: "o200", label: "ст. Демо-Северная, ул. Демо, 200 - котел", code: "ОБ-200" },
  { id: "o7", label: "г. Демо-Приречный, ул. Демо, 7 - котел, насос", code: "ОБ-007" },
  { id: "o5", label: "х. Демо-Луговой, ул. Демо, 5 - ввод", code: "ОБ-005" },
  { id: "o9", label: "п. Демо-Луговое, ул. Демо, 9 - ввод", code: "ОБ-009" },
];
const h = (hh: number, mm = 0) => hh * 60 + mm;
const parse = (text: string) => parseTimeMessage(text, OBJECTS, TODAY);

describe("parseTimeMessage: полные фразы", () => {
  test("фраза показа: объект словами, «с восьми до половины шестого», перерыв час", () => {
    const r = parse("Демо-Северная двенадцать, с восьми до половины шестого, перерыв час");
    expect(r.objectId).toBe("o12");
    expect(r.start).toBe(h(8));
    expect(r.end).toBe(h(17, 30));
    expect(r.breakMin).toBe(60);
    expect(r.day).toBeNull();
    expect(r.quotes.object).toBe("демо-северная двенадцать");
    expect(r.quotes.end).toBe("до половины шестого");
    expect(r.quotes.break).toBe("перерыв час");
  });

  test("цифры через двоеточие и «сегодня»", () => {
    const r = parse("Сегодня Северная 200 с 12:00 до 14:30 без перерыва");
    expect(r).toMatchObject({
      objectId: "o200",
      day: TODAY,
      start: h(12),
      end: h(14, 30),
      breakMin: 0,
    });
  });

  test("время через точку и дефис", () => {
    const r = parse("Приречный 7, 8.00-17.30, обед 30");
    expect(r).toMatchObject({ objectId: "o7", start: h(8), end: h(17, 30), breakMin: 30 });
  });

  test("время без разделителя", () => {
    const r = parse("северная 200 с 820 до 1640");
    expect(r).toMatchObject({ start: h(8, 20), end: h(16, 40) });
  });

  test("«вчера» и «перерыв полчаса»", () => {
    const r = parse("вчера Приречный семь с девяти до шести перерыв полчаса");
    expect(r).toMatchObject({
      objectId: "o7",
      day: "2026-10-02",
      start: h(9),
      end: h(18),
      breakMin: 30,
    });
  });

  test("«позавчера»", () => {
    expect(parse("позавчера Северная 12 с 8 до 17").day).toBe("2026-10-01");
  });

  test("дата цифрами", () => {
    const r = parse("02.10 Северная 200 с 8 до 12");
    expect(r).toMatchObject({ day: "2026-10-02", start: h(8), end: h(12) });
  });

  test("дата словами", () => {
    expect(parse("первого октября северная 12 с 8 до 16").day).toBe("2026-10-01");
    expect(parse("30 сентября северная 12 с 8 до 16").day).toBe("2026-09-30");
  });

  test("«без пятнадцати девять» и «четверть шестого»", () => {
    const r = parse("северная 12 с без пятнадцати девять до четверть шестого");
    expect(r.start).toBe(h(8, 45));
    expect(r.end).toBe(h(17, 15));
  });

  test("«восемь тридцать» словами", () => {
    const r = parse("северная 200 с восемь тридцать до семнадцати");
    expect(r).toMatchObject({ start: h(8, 30), end: h(17) });
  });

  test("перерыв «сорок минут» и «полтора часа»", () => {
    expect(parse("северная 12 с 8 до 17 перерыв сорок минут").breakMin).toBe(40);
    expect(parse("северная 12 с 8 до 18 обед полтора часа").breakMin).toBe(90);
    expect(parse("северная 12 с 8 до 18 перерыв 1 час").breakMin).toBe(60);
  });

  test("фраза показа ОБ-200: «двести», «с двенадцати до половины третьего»", () => {
    const r = parse(
      "Сегодня, Демо-Северная двести, с двенадцати до половины третьего, без перерыва",
    );
    expect(r).toMatchObject({
      objectId: "o200",
      day: TODAY,
      start: h(12),
      end: h(14, 30),
      breakMin: 0,
    });
  });

  test("номер дома из трёх слов", () => {
    const objects: ParseObject[] = [
      { id: "o212", label: "ст. Демо-Северная, ул. Демо, 212 - котел" },
    ];
    expect(parseTimeMessage("северная двести двенадцать с 8 до 9", objects, TODAY).objectId).toBe(
      "o212",
    );
  });

  test("объект по коду", () => {
    expect(parse("ОБ-200 с 8 до 12").objectId).toBe("o200");
  });
});

describe("parseTimeMessage: неполные и спорные", () => {
  test("без перерыва во фразе: перерыв не угадывается", () => {
    const r = parse("северная 12 с 8 до 17");
    expect(r.breakMin).toBeNull();
    expect(r.quotes.break).toBeUndefined();
  });

  test("без дня: день не угадывается", () => {
    expect(parse("северная 12 с 8 до 17").day).toBeNull();
  });

  test("без объекта: объект не угадывается", () => {
    const r = parse("с 8 до 17 перерыв час");
    expect(r.objectId).toBeNull();
    expect(r.reasons.object).toBeUndefined();
    expect(r.start).toBe(h(8));
  });

  test("ошибка в адресе: «Северня», «Приреченый»", () => {
    expect(parse("Северня 12 с 8 до 17").objectId).toBe("o12");
    expect(parse("Приреченый 7 с 8 до 17").objectId).toBe("o7");
  });

  test("два похожих объекта без номера: уточните объект", () => {
    const r = parse("Луговой с 8 до 17");
    expect(r.objectId).toBeNull();
    expect(r.reasons.object).toBe("уточните объект");
  });

  test("похожий пункт, но номер дома выбирает один объект", () => {
    expect(parse("Луговое 9 с 8 до 17").objectId).toBe("o9");
  });

  test("один пункт, два дома, номер не назван: уточните объект", () => {
    expect(parse("Северная с 8 до 17").reasons.object).toBe("уточните объект");
  });

  test("окончание раньше начала: окончание не принимается", () => {
    const r = parse("северная 12 с 17 до 8");
    expect(r.start).toBe(h(17));
    expect(r.end).toBeNull();
    expect(r.reasons.end).toBe("окончание раньше начала");
  });

  test("объект не из разрешённых не находится", () => {
    expect(parse("Демо-Каменка 3 с 8 до 17").objectId).toBeNull();
  });

  test("пустая фраза: всё пусто", () => {
    expect(parse("")).toMatchObject({
      objectId: null,
      day: null,
      start: null,
      end: null,
      breakMin: null,
    });
  });

  test("время без интервала не принимается за начало", () => {
    const r = parse("северная 12 перерыв час");
    expect(r.start).toBeNull();
    expect(r.objectId).toBe("o12");
  });
});
