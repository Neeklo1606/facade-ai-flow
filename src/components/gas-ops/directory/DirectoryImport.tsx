/**
 * Импорт справочников из Excel (ADR-062, F3): бригады, сотрудники, ставки через общий мастер.
 * Предпросмотр «добавится N, обновится M, пропущено K» с причинами по строкам файла считает
 * тот же план, что применит порт. Файл читается в браузере и на сервер не уходит.
 */
import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notify } from "@/components/ui/kit/toast";
import {
  DIRECTORY_FIELDS,
  DIRECTORY_FIELD_LABEL,
  DIRECTORY_KIND_LABEL,
  DIRECTORY_TEMPLATE,
  useGasDirectoryImport,
  type DirectoryKind,
  type ImportCheck,
} from "@/api/gas-estimates";
import { toast } from "@/lib/toast";
import { ImportWizard, type WizardState } from "../import/ImportWizard";

const DESCRIPTION: Record<DirectoryKind, string> = {
  brigades: "Название, бригадир и телефон. Повторы ищутся по названию и телефону",
  employees: "ФИО, бригада и дата начала. Повторы ищутся по ФИО",
  rates: "Бригада, ФИО (если ставка на человека), ставка в час и дата начала",
};

const TEMPLATE_FILE: Record<DirectoryKind, string> = {
  brigades: "Шаблон_бригад.xlsx",
  employees: "Шаблон_сотрудников.xlsx",
  rates: "Шаблон_ставок.xlsx",
};

/** Строки файла и план по ним: и для предпросмотра, и для применения */
function readPlan(
  kind: DirectoryKind,
  state: WizardState,
  directory: ReturnType<typeof useGasDirectoryImport>["state"],
) {
  const grid = state.sheets[state.sheetIndex]?.grid ?? [];
  const read = state.tools.readDirectory(kind, grid, state.headerRow, state.map);
  return {
    read,
    plan: state.tools.planDirectoryImport(kind, read.rows, directory, read.skipped),
  };
}

export function DirectoryImport({ kind }: { kind: DirectoryKind }) {
  const [open, setOpen] = useState(false);
  const { state: directory, importDirectory } = useGasDirectoryImport();
  const title = `${DIRECTORY_KIND_LABEL[kind]} из Excel`;
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <FileSpreadsheet aria-hidden />
        {title}
      </Button>
      <ImportWizard
        open={open}
        onOpenChange={setOpen}
        id={`directory-import-${kind}`}
        title={title}
        description={DESCRIPTION[kind]}
        fileTestId={`directory-file-${kind}`}
        fields={DIRECTORY_FIELDS[kind].map((f) => ({
          key: f.key,
          label: DIRECTORY_FIELD_LABEL[f.key],
          required: f.required,
        }))}
        template={{ fileName: TEMPLATE_FILE[kind], rows: DIRECTORY_TEMPLATE[kind] }}
        detect={(tools, grid) => {
          const guess = tools.guessDirectoryHeader(kind, grid);
          return {
            headerRow: guess?.row ?? 0,
            map: Object.fromEntries(
              DIRECTORY_FIELDS[kind].map((f) => [f.key, guess?.map[f.key] ?? null]),
            ),
          };
        }}
        evaluate={(state) => {
          const { read, plan } = readPlan(kind, state, directory);
          const changes = plan.added.length + plan.updated.length;
          const check: ImportCheck =
            changes === 0
              ? {
                  level: "error",
                  title: read.rows.length
                    ? "Нечего добавить: все строки уже в справочнике или с ошибками"
                    : "Строк не нашли: проверьте строку заголовка и колонки",
                  details: [],
                }
              : {
                  level: plan.skipped.length ? "warn" : "ok",
                  title: state.tools.planSummary(plan),
                  details: [],
                };
          return {
            check,
            canApply: changes > 0,
            preview: (
              <>
                <ul className="grid grid-cols-3 gap-2 text-center" aria-label="Что изменится">
                  {(
                    [
                      ["Добавится", plan.added.length],
                      ["Обновится", plan.updated.length],
                      ["Пропущено", plan.skipped.length],
                    ] as const
                  ).map(([text, n]) => (
                    <li key={text} className="rounded-control bg-panel-2 p-2">
                      <span className="block text-title tnum">{n}</span>
                      <span className="block text-meta text-text-3">{text}</span>
                    </li>
                  ))}
                </ul>
                {plan.skipped.length ? (
                  <ul
                    className="mt-2 flex flex-col gap-1 text-meta text-text-2"
                    aria-label="Пропущенные строки"
                    data-testid="directory-skipped"
                  >
                    {plan.skipped.slice(0, 20).map((s) => (
                      <li key={`${s.row}-${s.reason}`}>
                        <span className="tnum">Строка {s.row}:</span> {s.reason}
                      </li>
                    ))}
                    {plan.skipped.length > 20 ? (
                      <li className="text-text-3">И ещё {plan.skipped.length - 20}</li>
                    ) : null}
                  </ul>
                ) : null}
              </>
            ),
          };
        }}
        onApply={async (state) => {
          const { read } = readPlan(kind, state, directory);
          const result = await importDirectory({ kind, rows: read.rows, skipped: read.skipped });
          if (!result.ok) {
            toast.error(result.message);
            return false;
          }
          const { added, updated, skipped } = result.value;
          notify(
            `${DIRECTORY_KIND_LABEL[kind]}: добавлено ${added}, обновлено ${updated}, пропущено ${skipped.length}`,
          );
          return true;
        }}
      />
    </>
  );
}
