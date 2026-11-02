import { useState } from "react";
import { CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notify } from "@/components/ui/kit/toast";
import {
  REQUIRED_FIELDS,
  SCHEDULE_FIELD_LABEL,
  SCHEDULE_TEMPLATE,
  useGasEstimateActions,
  useGasSchedule,
  type ColumnMap,
  type ScheduleField,
} from "@/api/gas-estimates";
import { toast } from "@/lib/toast";
import { ImportWizard, type WizardState } from "../import/ImportWizard";

/**
 * Импорт недельного графика объектов (ADR-053, 4; мастер ADR-061, 12). График заказчика
 * меняется почти каждый день: файл, лист и строка заголовка, «что в каких колонках»
 * с примером значения, «добавится / изменится / уйдёт» и «Всё верно — применить» с отменой.
 */
const FIELDS: ScheduleField[] = ["object", "code", "brigade", "day"];

const mapOf = (state: WizardState): ColumnMap => ({
  object: state.map["object"] ?? null,
  code: state.map["code"] ?? null,
  brigade: state.map["brigade"] ?? null,
  day: state.map["day"] ?? null,
});

export function ScheduleImport({
  label = "Загрузить график недели",
  variant = "secondary",
}: {
  label?: string;
  variant?: "primary" | "secondary";
}) {
  const { schedule } = useGasSchedule();
  const actions = useGasEstimateActions();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <CalendarRange aria-hidden />
        {label}
      </Button>
      <ImportWizard
        open={open}
        onOpenChange={setOpen}
        id="schedule-import"
        title="График объектов на неделю"
        description="Excel-файл заказчика: объект, бригада и день"
        fileTestId="schedule-file"
        fields={FIELDS.map((key) => ({
          key,
          label: SCHEDULE_FIELD_LABEL[key],
          required: REQUIRED_FIELDS.includes(key),
        }))}
        template={{ fileName: "Шаблон_графика.xlsx", rows: SCHEDULE_TEMPLATE }}
        detect={(tools, grid) => {
          const guess = tools.guessHeader(grid);
          return {
            headerRow: guess?.row ?? 0,
            map: guess?.map ?? { object: null, code: null, brigade: null, day: null },
          };
        }}
        evaluate={(state) => {
          const grid = state.sheets[state.sheetIndex]?.grid ?? [];
          const parsed = state.tools.readSchedule(grid, state.headerRow, mapOf(state));
          const diff = state.tools.diffSchedule(schedule?.rows ?? [], parsed.rows);
          return {
            check: state.tools.scheduleCheck(parsed),
            canApply: parsed.rows.length > 0,
            preview: (
              <>
                <ul className="grid grid-cols-3 gap-2 text-center" aria-label="Что изменится">
                  {(
                    [
                      ["Добавится", diff.added.length],
                      ["Изменится", diff.changed.length],
                      ["Уйдёт", diff.removed.length],
                    ] as const
                  ).map(([text, n]) => (
                    <li key={text} className="rounded-control bg-panel-2 p-2">
                      <span className="block text-title tnum">{n}</span>
                      <span className="block text-meta text-text-3">{text}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-meta text-text-3">
                  Без изменений: {diff.unchanged}. Строк в файле: {parsed.rows.length}.
                </p>
                {diff.changed.slice(0, 3).map((c) => (
                  <p key={c.to.key} className="text-meta text-text-2">
                    {c.to.objectLabel}, {c.to.day.slice(8, 10)}.{c.to.day.slice(5, 7)}:{" "}
                    {c.from.brigade} → {c.to.brigade}
                  </p>
                ))}
                <p className="mt-2 text-meta text-text-3">
                  {schedule
                    ? `Сейчас действует график от ${schedule.appliedAt.replace("T", " ").slice(5, 16)}, строк ${schedule.rows.length}.`
                    : "График ещё не загружали: бот берёт назначения демо."}
                </p>
              </>
            ),
          };
        }}
        onApply={async (state) => {
          const grid = state.sheets[state.sheetIndex]?.grid ?? [];
          const parsed = state.tools.readSchedule(grid, state.headerRow, mapOf(state));
          const result = await actions.applySchedule({
            rows: parsed.rows,
            fileName: state.fileName,
          });
          if (!result.ok) {
            toast.error(result.message);
            return false;
          }
          const previous = result.value;
          notify(`График применён: строк ${parsed.rows.length}`, {
            undo: () => void actions.restoreSchedule(previous),
          });
          return true;
        }}
      />
    </>
  );
}
