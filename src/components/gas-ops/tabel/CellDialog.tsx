/**
 * Окно ячейки «Табеля» (ADR-061, 11; раздел 4.5): исходные записи, из которых сложилась
 * ячейка, «Открыть запись» и для менеджера правка начала, окончания, перерыва и состава
 * с обязательной причиной. Это то же исправление порта, что в «Проверке»: история пишется.
 * Закрытая неделя не правится — вместо формы «Переоткрыть неделю».
 */
import { Link } from "@tanstack/react-router";
import { Pencil } from "lucide-react";
import { useState } from "react";
import {
  ENTRY_STATUS_LABEL,
  fmtHours,
  fmtRub,
  formatClock,
  headcountOf,
  useGasActions,
  useGasActor,
  useGasEntry,
} from "@/api/gas-ops";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { REASONS, reasonText } from "../review/reasons";
import { toast } from "@/lib/toast";

export function CellDialog({
  title,
  entryIds,
  locked,
  onClose,
}: {
  title: string;
  entryIds: string[];
  locked: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-h-[90dvh] max-w-[560px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {entryIds.length
              ? `Ячейка сложилась из ${entryIds.length} ${entryIds.length === 1 ? "записи" : "записей"}.`
              : "Записей нет."}
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-3" aria-label="Записи ячейки">
          {entryIds.map((id) => (
            <EntryItem key={id} id={id} locked={locked} />
          ))}
        </ul>
        {locked ? (
          <p className="text-meta text-text-2">
            Неделя закрыта: правка недоступна.{" "}
            <Link to="/gas/week" className="text-meta-strong text-orange focus-ring">
              Переоткрыть неделю
            </Link>
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function EntryItem({ id, locked }: { id: string; locked: boolean }) {
  const view = useGasEntry(id);
  const actor = useGasActor();
  const [editing, setEditing] = useState(false);
  if (!view) return null;
  const { entry } = view;
  const people = headcountOf(entry);
  // Правит менеджер (и администратор): руководитель закрывает неделю, но записи не исправляет
  const canEdit = !locked && (actor.role === "manager" || actor.isAdmin);
  return (
    <li className="rounded-control border border-line p-3" data-cell-entry={entry.number}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-body-strong">
          {entry.number}
          <span className="ms-2 text-meta font-normal text-text-3">
            {ENTRY_STATUS_LABEL[entry.status]}
          </span>
        </p>
        <Link
          to="/gas/entries"
          search={{ q: entry.number }}
          className="inline-flex min-h-control-sm items-center text-meta-strong text-orange focus-ring"
        >
          Открыть запись
        </Link>
      </div>
      <p className="mt-1 text-meta text-text-2 tnum">
        {view.brigade?.name ?? "Бригада"} · {view.object?.label ?? "Объект"}
      </p>
      <p className="text-meta text-text-2 tnum">
        {entry.startMinutes === null || entry.endMinutes === null
          ? "без рамки смены"
          : `${formatClock(entry.startMinutes)}–${formatClock(entry.endMinutes)}`}
        {` · перерыв ${entry.breakMinutes} мин · ${entry.minutes} мин = ${fmtHours(view.hours)}`}
        {` · ${people === null ? "состав не указан" : `${people} чел.`}`}
        {actor.canSeeMoney && entry.amountRub !== null ? ` · ${fmtRub(entry.amountRub)}` : ""}
      </p>
      {canEdit && !editing ? (
        <Button variant="outline" className="mt-2" onClick={() => setEditing(true)}>
          <Pencil aria-hidden />
          Исправить
        </Button>
      ) : null}
      {canEdit && editing ? <EditForm id={entry.id} onDone={() => setEditing(false)} /> : null}
    </li>
  );
}

function clock(minutes: number | null): string {
  return minutes === null ? "" : formatClock(minutes);
}

function EditForm({ id, onDone }: { id: string; onDone: () => void }) {
  const view = useGasEntry(id)!;
  const actions = useGasActions();
  const { entry } = view;
  const framed = entry.startMinutes !== null;
  const [start, setStart] = useState(clock(entry.startMinutes));
  const [end, setEnd] = useState(clock(entry.endMinutes));
  const [breaks, setBreaks] = useState(String(entry.breakMinutes));
  const [people, setPeople] = useState(entry.headcount == null ? "" : String(entry.headcount));
  const [chip, setChip] = useState<string | null>(null);
  const [own, setOwn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const comment = reasonText(chip, own);
  const field =
    "mt-1 h-control w-full rounded-control border border-line-2 bg-surface px-3 text-body tnum focus-ring";

  const save = async () => {
    setBusy(true);
    setError(null);
    const count = people.trim() === "" ? null : Number(people);
    const result = await actions.updateEntry({
      id,
      ...(framed ? { start, end, breakMinutes: breaks } : {}),
      ...(count !== (entry.headcount ?? null) ? { headcount: count } : {}),
      comment,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    toast.success("Исправлено", {
      description: `${entry.number}: изменение и причина записаны в историю записи.`,
    });
    onDone();
  };

  return (
    <form
      className="mt-3 flex flex-col gap-3"
      aria-label={`Исправить ${entry.number}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (comment && !busy) void save();
      }}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {framed ? (
          <>
            <label className="text-meta text-text-2">
              Начало
              <input value={start} onChange={(e) => setStart(e.target.value)} className={field} />
            </label>
            <label className="text-meta text-text-2">
              Окончание
              <input value={end} onChange={(e) => setEnd(e.target.value)} className={field} />
            </label>
            <label className="text-meta text-text-2">
              Перерыв, мин
              <input
                value={breaks}
                inputMode="numeric"
                onChange={(e) => setBreaks(e.target.value)}
                className={field}
              />
            </label>
          </>
        ) : null}
        <label className="text-meta text-text-2">
          Людей
          <input
            value={people}
            inputMode="numeric"
            placeholder="не указан"
            onChange={(e) => setPeople(e.target.value.replace(/[^\d]/g, ""))}
            className={field}
          />
        </label>
      </div>
      {framed ? null : (
        <p className="text-meta text-text-3">
          У строки отчёта заказчика нет начала и окончания: правится только состав.
        </p>
      )}
      <div role="group" aria-label="Причина исправления" className="flex flex-wrap gap-2">
        {REASONS.correct.map((reason) => (
          <button
            key={reason}
            type="button"
            aria-pressed={chip === reason}
            onClick={() => setChip(chip === reason ? null : reason)}
            className={`inline-flex min-h-segment items-center rounded-full px-3 text-body-strong focus-ring ${
              chip === reason ? "bg-pill text-pill-text" : "bg-surface-2 text-text"
            }`}
          >
            {reason}
          </button>
        ))}
      </div>
      <label className="text-meta text-text-2">
        Своя причина
        <input value={own} onChange={(e) => setOwn(e.target.value)} className={field} />
      </label>
      {error ? (
        <p role="alert" className="text-body text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={!comment || busy}>
          Сохранить исправление
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          Отмена
        </Button>
      </div>
    </form>
  );
}
