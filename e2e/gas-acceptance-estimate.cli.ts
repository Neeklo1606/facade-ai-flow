/**
 * Обезличенная ресурсная смета 14 граф для приёмки заказчика (e2e/acceptance-gas.spec.ts).
 * Структура как у сметы КП заказчика: первый лист — пустой шаблон «12 граф», на втором шапка
 * (номер КП, вид документа, дата, наименование работ и объекта над подписью), три раздела
 * с позициями, строки состава, блок «Итоги по разделу», итоги сметы с НДС. В разделе 3
 * есть материалы и строка пневматического испытания (ГЭСН19-01-015) внутри раздела.
 * Адрес, номер и суммы выдуманы: файлов заказчика в репозитории нет.
 *
 * `bun run e2e/gas-acceptance-estimate.cli.ts <файл.xlsx>`. Playwright в Node не грузит
 * exceljs из подключённых симлинком зависимостей, поэтому файл собирает bun.
 */
import ExcelJS from "exceljs";

const [path] = process.argv.slice(2);
const wb = new ExcelJS.Workbook();

type Row = Record<number, string | number>;
const sheet = (name: string) => {
  const ws = wb.addWorksheet(name);
  return (row: number, cols: Row) => {
    for (const [c, v] of Object.entries(cols)) ws.getRow(row).getCell(Number(c) + 1).value = v;
  };
};

const HEAD: [number, Row][] = [
  [
    22,
    {
      0: "№ пп",
      1: "Обоснование",
      2: "Наименование",
      3: "Ед. изм.",
      4: "Кол.",
      6: "Сметная стоимость в текущих (прогнозных) ценах, руб.",
      12: "Т/з осн. раб.",
      13: "Т/з мех.",
    },
  ],
  [23, { 4: "на ед.", 5: "всего", 6: "на ед.", 7: "общая", 8: "В том числе" }],
  [24, { 8: "Осн.З/п", 9: "Эк.Маш.", 10: "З/пМех", 11: "Мат" }],
];

// Лист 1: пустой шаблон, разбор его пропускает сам
const blank = sheet("Ресурсная смета 12 граф");
blank(9, { 3: "ЛОКАЛЬНЫЙ РЕСУРСНЫЙ СМЕТНЫЙ РАСЧЕТ  № " });
blank(13, { 3: "(наименование работ и затрат, наименование объекта)" });
for (const [r, cols] of HEAD) blank(r, cols);

// Лист 2: смета
const put = sheet("Ресурсная смета 14 граф");
put(6, { 5: "777001-Д-26-СМР" });
put(9, { 5: "КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ " });
put(11, { 5: "От __05___      _____10_____ 2026 " });
put(12, { 3: "Перемонтаж дворового газопровода   по ул. Учебная, 7,  кв. 3 в х. Тестовом" });
put(13, { 5: "(наименование работ и затрат, наименование объекта)" });
for (const [r, cols] of HEAD) put(r, cols);

interface Position {
  n: string;
  code: string;
  name: string;
  total: number;
  pay: number;
  mach?: number;
  mat?: number;
  tz: number;
}
interface Section {
  no: number;
  title: string;
  positions: Position[];
  overhead: number;
  profit: number;
}

const SECTIONS: Section[] = [
  {
    no: 1,
    title: "Земляные работы",
    positions: [
      {
        n: "'12",
        code: "ГЭСН01-02-057-02",
        name: "Разработка грунта вручную в траншеях",
        total: 2371.4,
        pay: 2371.4,
        tz: 6.25,
      },
    ],
    overhead: 1517.7,
    profit: 829.99,
  },
  {
    no: 3,
    title: "Монтаж стальных газопроводов",
    positions: [
      {
        n: "'48",
        code: "ГЭСН16-02-003-02",
        name: "Прокладка трубопроводов газоснабжения из стальных труб",
        total: 7845.3,
        pay: 1912.4,
        mach: 214.6,
        mat: 5718.3,
        tz: 40.1,
      },
      {
        n: "'58",
        code: "ГЭСН19-01-015-01",
        name: "Пневматическое испытание наружных надземных газопроводов",
        total: 1106.2,
        pay: 836.5,
        mat: 269.7,
        tz: 12.3,
      },
      {
        n: "'103",
        code: "PRT2.1.9.1",
        name: "Обрезка (переключение) действующего газопровода",
        total: 1487.1,
        pay: 1487.1,
        tz: 44,
      },
    ],
    overhead: 4618.44,
    profit: 2541.96,
  },
  {
    no: 7,
    title: "Субподрядные работы",
    positions: [
      {
        n: "'178",
        code: "УГХ-2-2-39-А",
        name: "Оформление исполнительно-технической документации",
        total: 1655.2,
        pay: 1655.2,
        tz: 3.4,
      },
    ],
    overhead: 1804.17,
    profit: 1092.43,
  },
];

const r2 = (v: number) => Math.round(v * 100) / 100;
const sum = (list: number[]) => r2(list.reduce((a, b) => a + b, 0));

let row = 26;
const all = { direct: 0, pay: 0, mach: 0, mat: 0, tz: 0, overhead: 0, profit: 0 };
for (const s of SECTIONS) {
  put(row++, { 0: `Раздел ${s.no}. ${s.title}` });
  for (const p of s.positions) {
    put(row++, {
      0: p.n,
      1: p.code,
      2: p.name,
      3: "ед.",
      5: 1,
      6: p.total,
      7: p.total,
      8: p.pay,
      ...(p.mach ? { 9: p.mach } : {}),
      ...(p.mat ? { 11: p.mat } : {}),
      12: p.tz,
    });
    put(row++, {
      0: "З",
      2: "Затраты труда рабочих (ср 5)",
      3: "чел.час",
      5: p.tz,
      7: p.pay,
      8: p.pay,
    });
  }
  const direct = sum(s.positions.map((p) => p.total));
  const pay = sum(s.positions.map((p) => p.pay));
  const mach = sum(s.positions.map((p) => p.mach ?? 0));
  const mat = sum(s.positions.map((p) => p.mat ?? 0));
  const tz = r2(s.positions.reduce((a, p) => a + p.tz, 0));
  const total = r2(direct + s.overhead + s.profit);
  put(row++, {
    0: "Итого прямые затраты по разделу в текущих ценах",
    7: direct,
    8: pay,
    ...(mach ? { 9: mach } : {}),
    ...(mat ? { 11: mat } : {}),
    12: tz,
  });
  put(row++, { 0: "Накладные расходы", 7: s.overhead });
  put(row++, { 0: "Сметная прибыль", 7: s.profit });
  put(row++, { 0: `Итоги по разделу ${s.no} ${s.title} :` });
  put(row++, { 0: "  Итого", 7: total, 12: tz });
  put(row++, { 0: "    В том числе:" });
  if (mat) put(row++, { 0: "      Материалы", 7: mat });
  if (mach) put(row++, { 0: "      Машины и механизмы", 7: mach });
  put(row++, { 0: "      ФОТ", 7: pay });
  put(row++, { 0: "      Накладные расходы", 7: s.overhead });
  put(row++, { 0: "      Сметная прибыль", 7: s.profit });
  put(row++, { 0: `  Итого по разделу ${s.no} ${s.title}`, 7: total, 12: tz });
  all.direct += direct;
  all.pay += pay;
  all.mach += mach;
  all.mat += mat;
  all.tz += tz;
  all.overhead += s.overhead;
  all.profit += s.profit;
}

const withoutVat = r2(all.direct + all.overhead + all.profit);
const vat = r2(withoutVat * 0.2);
put(row++, { 0: "ИТОГИ ПО СМЕТЕ:" });
put(row++, {
  0: "Итого прямые затраты по смете в текущих ценах",
  7: r2(all.direct),
  8: r2(all.pay),
  9: r2(all.mach),
  11: r2(all.mat),
  12: r2(all.tz),
});
put(row++, { 0: "Накладные расходы", 7: r2(all.overhead) });
put(row++, { 0: "Сметная прибыль", 7: r2(all.profit) });
put(row++, { 0: "Итоги по смете:" });
put(row++, { 0: "  Итого", 7: withoutVat, 12: r2(all.tz) });
put(row++, { 0: "    В том числе:" });
put(row++, { 0: "      Материалы", 7: r2(all.mat) });
put(row++, { 0: "      Машины и механизмы", 7: r2(all.mach) });
put(row++, { 0: "      ФОТ", 7: r2(all.pay) });
put(row++, { 0: "      Накладные расходы", 7: r2(all.overhead) });
put(row++, { 0: "      Сметная прибыль", 7: r2(all.profit) });
put(row++, { 0: "  НДС 20%", 7: vat });
put(row++, { 0: "  ВСЕГО по смете", 7: r2(withoutVat + vat), 12: r2(all.tz) });
row += 3;
put(row++, { 0: "Составил: ___________________________" });
put(row, { 0: "(должность, подпись, расшифровка)" });

await wb.xlsx.writeFile(path!);
