/**
 * Демо-папка смет (ADR-072): две сметы-образца ГРАНД-Сметы, собранные в браузере. Имена
 * файлов называют объекты справочника вкладки, чтобы сработала подсказка объекта. Числа
 * синтетические, не заказчика. Интерфейс подписывает: «Демо: Яндекс Диск не подключён».
 */
import type { FolderFile } from "@/domain/gas-ops/estimate-folder";
import type { EstimateFolderPort } from "@/ports/estimate-folder";

type Cell = string | number | null;

/** Сетка ГРАНД-Сметы с итогами формата А: те же строки, что у e2e-сметы */
function grandGrid(sections: [string, number][], materials: number): Cell[][] {
  const grid: Cell[][] = [];
  const put = (row: number, cols: Record<number, Cell>) => {
    while (grid.length < row) grid.push([]);
    const line = grid[row - 1]!;
    for (const [c, v] of Object.entries(cols)) {
      while (line.length <= Number(c)) line.push(null);
      line[Number(c)] = v;
    }
  };
  put(10, { 6: "ГРАНД-Смета, версия 2026.2" });
  put(43, { 10: "всего с учетом коэффициентов", 15: "всего в текущем уровне цен" });
  let row = 450;
  let sum = 0;
  sections.forEach(([title, value], i) => {
    put(row, { 2: `Всего по разделу ${i + 1} ${title}`, 15: value });
    sum += value;
    row += 20;
  });
  const all = Math.round(sum * 100) / 100;
  const vat = Math.round(all * 22) / 100;
  put(row + 4, { 2: "Итоги по смете:" });
  put(row + 6, { 2: " Материалы", 15: materials });
  put(row + 10, { 2: "Всего", 15: all });
  put(row + 12, { 2: " НДС 22%", 15: vat });
  put(row + 13, { 2: "ВСЕГО по смете", 15: Math.round((all + vat) * 100) / 100 });
  put(row + 15, { 2: " Затраты труда рабочих", 10: "62,5" });
  return grid;
}

const SAMPLES: { sections: [string, number][]; materials: number }[] = [
  {
    sections: [
      ["Монтаж стальных газопроводов", 184_300.4],
      ["Испытания газопроводов", 21_700.6],
    ],
    materials: 38_250.15,
  },
  {
    sections: [
      ["Прокладка полиэтиленового газопровода", 96_480.0],
      ["Врезка и пуск газа", 12_960.5],
    ],
    materials: 17_900.0,
  },
];

export function createEstimateFolderDemo(
  objects: () => { code: string; label: string }[],
  /** Когда «положены» файлы: день демо-недели, чтобы сверка с версиями была честной */
  modified: () => string,
): EstimateFolderPort {
  const files = (): (FolderFile & { sample: number })[] =>
    objects()
      .slice(0, SAMPLES.length)
      .map((o, i) => {
        const name = `Смета ${o.code} ${o.label}.xlsx`.replace(/[\\/:*?"<>|]+/g, " ");
        return {
          name,
          path: `demo:/Сметы/${name}`,
          size: 48_000 + i * 3_000,
          modified: modified(),
          sample: i,
        };
      });
  return {
    async list() {
      return {
        ok: true,
        status: {
          connected: false,
          demo: true,
          reason: "Демо: Яндекс Диск не подключён, папка-образец",
        },
        files: files().map(({ sample: _, ...file }) => file),
      };
    },
    async download(path) {
      const file = files().find((f) => f.path === path);
      if (!file) return { ok: false, reason: "Файла нет в папке" };
      try {
        const XLSX = await import("xlsx");
        const sample = SAMPLES[file.sample]!;
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.aoa_to_sheet(grandGrid(sample.sections, sample.materials)),
          "Смета",
        );
        const data = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
        return { ok: true, data };
      } catch {
        return { ok: false, reason: "Модуль чтения Excel не загрузился. Проверьте связь" };
      }
    },
  };
}
