/**
 * Разбор фразы бригадира о времени (ADR-049, 01_SPEC 8): правилами, без модели.
 *
 * «Демо-Северная двенадцать, с восьми до половины шестого, перерыв час» →
 * объект, день, начало, окончание, перерыв. У каждого найденного значения фраза-источник.
 * Чего во фразе нет или что неоднозначно, остаётся null с причиной: следующий шаг бота
 * спрашивает это кнопками, а не угадывает.
 *
 * Объект ищется только среди разрешённых бригаде (правило ADR-044): по названию населённого
 * пункта с ошибкой в одну-две буквы и номеру дома. Два одинаково подходящих объекта:
 * null и причина «уточните объект».
 */

export interface ParseObject {
  id: string;
  /** «ст. Демо-Северная, ул. Демо, 200 - котел» */
  label: string;
  /** «ОБ-200» */
  code?: string;
}

export interface ParsedTime {
  objectId: string | null;
  /** ISO-дата дня работы */
  day: string | null;
  /** Минуты от полуночи */
  start: number | null;
  end: number | null;
  breakMin: number | null;
  /** Откуда взято каждое значение: кусок исходной фразы */
  quotes: Partial<Record<"object" | "day" | "start" | "end" | "break", string>>;
  /** Почему значение не найдено, если причина есть: «уточните объект» */
  reasons: Partial<Record<"object" | "end", string>>;
}

/* ------------------------------------------------------------------ Числа словами */

const UNITS: Record<string, number> = {
  ноль: 0,
  один: 1,
  одна: 1,
  одного: 1,
  одной: 1,
  час: 1,
  два: 2,
  две: 2,
  двух: 2,
  три: 3,
  трех: 3,
  четыре: 4,
  четырех: 4,
  пять: 5,
  пяти: 5,
  шесть: 6,
  шести: 6,
  семь: 7,
  семи: 7,
  восемь: 8,
  восьми: 8,
  девять: 9,
  девяти: 9,
  десять: 10,
  десяти: 10,
  одиннадцать: 11,
  одиннадцати: 11,
  двенадцать: 12,
  двенадцати: 12,
  тринадцать: 13,
  тринадцати: 13,
  четырнадцать: 14,
  четырнадцати: 14,
  пятнадцать: 15,
  пятнадцати: 15,
  шестнадцать: 16,
  шестнадцати: 16,
  семнадцать: 17,
  семнадцати: 17,
  восемнадцать: 18,
  восемнадцати: 18,
  девятнадцать: 19,
  девятнадцати: 19,
  двадцать: 20,
  двадцати: 20,
  тридцать: 30,
  тридцати: 30,
  сорок: 40,
  сорока: 40,
  пятьдесят: 50,
  пятидесяти: 50,
  шестьдесят: 60,
  семьдесят: 70,
  восемьдесят: 80,
  девяносто: 90,
  сто: 100,
  двести: 200,
  триста: 300,
  четыреста: 400,
  пятьсот: 500,
};

/** «Половина шестого», «четверть девятого»: час в родительном падеже порядкового */
const ORDINAL_GEN: Record<string, number> = {
  первого: 1,
  второго: 2,
  третьего: 3,
  четвертого: 4,
  пятого: 5,
  шестого: 6,
  седьмого: 7,
  восьмого: 8,
  девятого: 9,
  десятого: 10,
  одиннадцатого: 11,
  двенадцатого: 12,
};

const MONTHS: Record<string, number> = {
  января: 1,
  февраля: 2,
  марта: 3,
  апреля: 4,
  мая: 5,
  июня: 6,
  июля: 7,
  августа: 8,
  сентября: 9,
  октября: 10,
  ноября: 11,
  декабря: 12,
};

const normalize = (text: string) =>
  text.toLowerCase().replace(/ё/g, "е").replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();

/**
 * Число из слов или цифр: «двадцать пять», «30», «двести двенадцать». Слова складываются,
 * пока каждое следующее меньше разряда предыдущего: сотни, десятки, единицы
 */
function numberOf(words: string[]): { value: number; used: number } | null {
  const first = words[0];
  if (!first) return null;
  if (/^\d+$/.test(first)) return { value: Number(first), used: 1 };
  const a = UNITS[first];
  if (a === undefined) return null;
  let value = a;
  let used = 1;
  // Разряд, после которого ещё может идти слово: сотни ждут десятки, десятки ждут единицы
  let place = a >= 100 ? 100 : a >= 20 && a % 10 === 0 ? 10 : 1;
  while (place > 1 && words[used] !== undefined) {
    const next = UNITS[words[used]!];
    if (next === undefined || next === 0 || next >= place) break;
    value += next;
    used += 1;
    place = next >= 20 && next % 10 === 0 ? 10 : 1;
  }
  return { value, used };
}

/* ------------------------------------------------------------------ Время */

/**
 * Время из начала списка слов: «8», «8:20», «8.20», «820», «восемь», «восемь тридцать»,
 * «половины шестого», «без пятнадцати девять», «четверть девятого»
 */
function clockOf(words: string[]): { minutes: number; used: number } | null {
  const [w0, w1] = words;
  if (!w0) return null;
  const digits = w0.match(/^(\d{1,2})(?:[:.](\d{2}))?$/);
  if (digits) {
    const h = Number(digits[1]);
    const m = digits[2] ? Number(digits[2]) : 0;
    if (h <= 23 && m < 60) return { minutes: h * 60 + m, used: 1 };
  }
  const glued = w0.match(/^(\d{1,2})(\d{2})$/);
  if (glued && Number(glued[1]) <= 23 && Number(glued[2]) < 60)
    return { minutes: Number(glued[1]) * 60 + Number(glued[2]), used: 1 };
  if ((w0 === "половина" || w0 === "половины" || w0 === "пол") && w1 && ORDINAL_GEN[w1])
    return { minutes: (ORDINAL_GEN[w1] - 1) * 60 + 30, used: 2 };
  if (w0.startsWith("пол") && ORDINAL_GEN[w0.slice(3)])
    return { minutes: (ORDINAL_GEN[w0.slice(3)]! - 1) * 60 + 30, used: 1 };
  if ((w0 === "четверть" || w0 === "четверти") && w1 && ORDINAL_GEN[w1])
    return { minutes: (ORDINAL_GEN[w1] - 1) * 60 + 15, used: 2 };
  if (w0 === "без" && w1) {
    const off = w1 === "четверти" ? { value: 15, used: 1 } : numberOf(words.slice(1));
    const rest = off ? words.slice(1 + off.used) : [];
    const hour = rest[0] !== undefined ? numberOf(rest) : null;
    if (off && hour && off.value < 60 && hour.value >= 1 && hour.value <= 24)
      return { minutes: (hour.value - 1) * 60 + (60 - off.value), used: 1 + off.used + hour.used };
  }
  const hour = numberOf(words);
  if (hour && hour.value <= 23) {
    const tail = words.slice(hour.used);
    const minute =
      tail[0] === "ноль" && tail[1] !== undefined
        ? numberOf(tail.slice(1))
        : tail[0] !== undefined && !/^(час|часа|часов|минут)/.test(tail[0])
          ? numberOf(tail)
          : null;
    if (minute && minute.value < 60 && minute.value >= 5) {
      const used = hour.used + (tail[0] === "ноль" ? 1 : 0) + minute.used;
      return { minutes: hour.value * 60 + minute.value, used };
    }
    return { minutes: hour.value * 60, used: hour.used };
  }
  return null;
}

/** «перерыв час», «обед 30», «перерыв полчаса», «без перерыва», «перерыв 40 минут» */
function breakOf(text: string): { minutes: number; quote: string } | null {
  const none = text.match(/без (перерыва|обеда)/);
  if (none) return { minutes: 0, quote: none[0] };
  const match = text.match(/(перерыв|обед)[а-я]*\s+((?:[а-я0-9]+\s?){1,3})/);
  if (!match) return null;
  const words = match[2]!.trim().split(" ");
  const quote = match[0].trim();
  if (words[0] === "полчаса") return { minutes: 30, quote: `${match[1]} полчаса` };
  if (words[0] === "полтора" || words[0] === "полторы") return { minutes: 90, quote };
  if (words[0] === "час") return { minutes: 60, quote: `${match[1]} час` };
  const n = numberOf(words);
  if (!n) return null;
  const unit = words[n.used] ?? "";
  if (/^час/.test(unit)) return { minutes: n.value * 60, quote };
  return { minutes: n.value, quote };
}

/* ------------------------------------------------------------------ День */

function shiftDay(iso: string, delta: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function dayOf(text: string, today: string): { day: string; quote: string } | null {
  if (/позавчера/.test(text)) return { day: shiftDay(today, -2), quote: "позавчера" };
  if (/вчера/.test(text)) return { day: shiftDay(today, -1), quote: "вчера" };
  if (/сегодня/.test(text)) return { day: today, quote: "сегодня" };
  const year = today.slice(0, 4);
  const numeric = text.match(/(?<![\d:.])(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?(?![\d:])/);
  if (numeric) {
    const [, d, m] = numeric;
    // «8.20» это время, а не дата: месяц не больше 12, а после даты нет «до»
    const before = text.slice(0, numeric.index);
    const after = text.slice(numeric.index);
    // «8.20» и «9.10» в интервале это время, а не дата: рядом «с», «до», «по» или дефис
    const inInterval = /(с|со|до|по|-)\s*$/.test(before) || /^\d{1,2}\.\d{2}\s*(-|до)/.test(after);
    if (Number(m) <= 12 && Number(d) <= 31 && !inInterval)
      return {
        day: `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        quote: numeric[0],
      };
  }
  const named = text.match(
    /(\d{1,2}|[а-я]+)\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)/,
  );
  if (named) {
    const d = /^\d+$/.test(named[1]!) ? Number(named[1]) : (ORDINAL_DAY[named[1]!] ?? null);
    if (d)
      return {
        day: `${year}-${String(MONTHS[named[2]!]).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        quote: named[0],
      };
  }
  return null;
}

const ORDINAL_DAY: Record<string, number> = {
  первого: 1,
  второго: 2,
  третьего: 3,
  четвертого: 4,
  пятого: 5,
  шестого: 6,
  седьмого: 7,
  восьмого: 8,
  девятого: 9,
  десятого: 10,
};

/* ------------------------------------------------------------------ Объект */

/** Расстояние Левенштейна: ошибка в адресе в одну-две буквы не мешает найти объект */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length]!;
}

/** Части адреса объекта: слова населённого пункта и номер дома */
function addressOf(label: string): { names: string[]; house: number | null } {
  const plain = normalize(label);
  const [place = ""] = plain.split(",");
  // Номер дома: первое число после населённого пункта («ул. Демо, 12 - котел»)
  const street = plain.slice(place.length);
  const names = place
    .replace(/^(ст|х|г|п|с|пос|сt|снт)\.?\s+/, "")
    .split(/[\s-]+/)
    .filter((word) => word.length >= 3 && word !== "демо");
  const house = street.match(/(\d+)/);
  return { names, house: house ? Number(house[1]) : null };
}

function objectOf(
  words: string[],
  objects: readonly ParseObject[],
): { id: string | null; quote?: string; reason?: string } {
  const scored = objects.map((object) => {
    const { names, house } = addressOf(object.label);
    let nameHit = 0;
    let quote = "";
    let after = -1;
    words.forEach((word, index) => {
      for (const name of names) {
        const limit = name.length >= 7 ? 2 : 1;
        if (word.length >= 3 && distance(word.replace(/^демо-?/, ""), name) <= limit) {
          nameHit += 1;
          quote = word;
          after = index;
        }
      }
    });
    // Номер дома сразу после названия: «Северная двенадцать», «Северная 12», «дом 12»
    let houseHit = false;
    if (house !== null) {
      const tail = after >= 0 ? words.slice(after + 1) : [];
      const n = numberOf(tail);
      if (n && n.value === house) {
        houseHit = true;
        quote = `${quote} ${tail.slice(0, n.used).join(" ")}`.trim();
      }
    }
    const code = object.code ? normalize(object.code) : null;
    const codeWord = code
      ? words.find((w) => w === code || w === code.replace("об-", ""))
      : undefined;
    const score = codeWord ? 3 : (nameHit ? 1 : 0) + (houseHit ? 1 : 0);
    // Источник всегда кусок самой фразы: «демо-северная 200», а не код из справочника
    return { object, score, quote: quote || codeWord || "" };
  });
  const best = Math.max(0, ...scored.map((s) => s.score));
  if (best === 0) return { id: null };
  const top = scored.filter((s) => s.score === best);
  if (top.length > 1) return { id: null, reason: "уточните объект" };
  return { id: top[0]!.object.id, quote: top[0]!.quote };
}

/* ------------------------------------------------------------------ Разбор */

export function parseTimeMessage(
  text: string,
  allowedObjects: readonly ParseObject[],
  today: string,
): ParsedTime {
  const result: ParsedTime = {
    objectId: null,
    day: null,
    start: null,
    end: null,
    breakMin: null,
    quotes: {},
    reasons: {},
  };
  let rest = normalize(text);

  const pause = breakOf(rest);
  if (pause) {
    result.breakMin = pause.minutes;
    result.quotes.break = pause.quote;
    rest = rest.replace(pause.quote, " ");
  }

  const day = dayOf(rest, today);
  if (day) {
    result.day = day.day;
    result.quotes.day = day.quote;
    rest = rest.replace(day.quote, " ");
  }

  // «с X до Y» и «X-Y»: интервал, затем остаток фразы ищется как адрес
  const words = rest
    .replace(/[,;!?]/g, " ")
    .replace(/(\d)\s*-\s*(\d)/g, "$1 до $2")
    .split(/\s+/)
    .filter(Boolean);
  const used = new Set<number>();
  for (let i = 0; i < words.length; i++) {
    // Интервал начинается с «с …» или прямо со времени, за которым идёт «до»
    const from = words[i] === "с" || words[i] === "со" ? i + 1 : -1;
    const startAt = from >= 0 ? from : i;
    const start = clockOf(words.slice(startAt));
    if (!start) continue;
    if (from < 0 && words[startAt + start.used] !== "до") continue;
    const toAt = startAt + start.used;
    if (words[toAt] !== "до" && words[toAt] !== "по") continue;
    const end = clockOf(words.slice(toAt + 1));
    if (!end) continue;
    let endMin = end.minutes;
    // «с восьми до половины шестого»: окончание в 12-часовом счёте, а начало утром
    // Только для начала до полудня включительно: «с 17 до 8» в 24-часовом счёте это ошибка
    if (
      start.minutes <= 12 * 60 &&
      endMin <= start.minutes &&
      endMin + 12 * 60 > start.minutes &&
      endMin < 12 * 60
    )
      endMin += 12 * 60;
    result.start = start.minutes;
    result.quotes.start = words.slice(from >= 0 ? i : startAt, toAt).join(" ");
    if (endMin > start.minutes) {
      result.end = endMin;
      result.quotes.end = words.slice(toAt, toAt + 1 + end.used).join(" ");
    } else {
      result.reasons.end = "окончание раньше начала";
    }
    for (let k = i; k < toAt + 1 + end.used; k++) used.add(k);
    break;
  }

  const left = words.filter((_, index) => !used.has(index));
  const object = objectOf(left, allowedObjects);
  result.objectId = object.id;
  if (object.quote) result.quotes.object = object.quote;
  if (object.reason) result.reasons.object = object.reason;
  return result;
}
