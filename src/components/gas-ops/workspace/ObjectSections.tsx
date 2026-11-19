/**
 * Разделы объекта в карточке (ADR-078): стоимость работ, начислено, остаток, доля, бригады
 * и история доли. Менеджер назначает раздел бригаде на период: раздел 3 бригаде 2, раздел 5
 * бригаде 4. Бригадир видит в форме только назначенные ему разделы.
 */
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  PROGRESS_KIND_LABEL,
  fmtShare,
  sectionLabel,
  useAssignOptions,
  useBrigadeName,
  useObjectSections,
  useSectionActions,
  useSectionAssignments,
  type SectionLedger,
} from "@/api/gas-section-accrual";
import { fmtRub, useGasActor } from "@/api/gas-ops";
import { Button } from "@/components/ui/button";
import { AdaptiveSheet } from "@/components/gas-ops/AdaptiveSheet";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const fmtDay = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;

export function ObjectSections({ objectId }: { objectId: string }) {
  const sections = useObjectSections(objectId);
  const actor = useGasActor();
  const manage = actor.role === "manager" || actor.isAdmin;
  const [assignTo, setAssignTo] = useState<SectionLedger | null>(null);
  if (sections.length === 0)
    return (
      <section data-testid="object-sections">
        <h3 className="text-meta-strong text-text-2">Разделы сметы</h3>
        <p className="mt-1 text-body text-text-2">
          Разделов нет: прикрепите смету к объекту на экране «Сметы».
        </p>
      </section>
    );
  const total = sections.reduce(
    (a, s) => ({
      work: a.work + (s.workRub ?? 0),
      accrued: a.accrued + s.accruedRub,
      left: a.left + (s.remainingRub ?? 0),
    }),
    { work: 0, accrued: 0, left: 0 },
  );
  return (
    <section data-testid="object-sections">
      <h3 className="text-meta-strong text-text-2">Разделы сметы</h3>
      <p className="mt-1 text-meta text-text-2 tnum">
        Работы {fmtRub(total.work)} · начислено {fmtRub(total.accrued)} · остаток{" "}
        {fmtRub(total.left)}
      </p>
      <ul className="mt-2 flex flex-col gap-2">
        {sections.map((s) => (
          <SectionRow
            key={s.key}
            objectId={objectId}
            section={s}
            manage={manage}
            onAssign={() => setAssignTo(s)}
          />
        ))}
      </ul>
      {assignTo ? (
        <AssignSection objectId={objectId} section={assignTo} onClose={() => setAssignTo(null)} />
      ) : null}
    </section>
  );
}

function SectionRow({
  objectId,
  section: s,
  manage,
  onAssign,
}: {
  objectId: string;
  section: SectionLedger;
  manage: boolean;
  onAssign: () => void;
}) {
  const [open, setOpen] = useState(false);
  const assignments = useSectionAssignments(objectId).filter((a) => a.sectionKey === s.key);
  const brigade = useBrigadeName();
  const actions = useSectionActions();
  const norm =
    s.laborHours === null
      ? "норматива нет"
      : `${(s.personMinutes / 60).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} из ${s.laborHours.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} чел.-ч`;
  return (
    <li className="rounded-card border border-line bg-surface p-3" data-testid="section-row">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-body-strong">{sectionLabel(s)}</p>
          <p className="mt-0.5 text-meta text-text-2 tnum">
            Доля {fmtShare(s.bp)} · {norm}
            {s.pressure ? " · есть опрессовка" : ""}
          </p>
        </div>
        <p className="shrink-0 text-right text-body tnum">
          <span className="block">{s.workRub === null ? "нет в смете" : fmtRub(s.workRub)}</span>
          <span className="block text-meta text-text-2">начислено {fmtRub(s.accruedRub)}</span>
          {s.remainingRub === null ? null : (
            <span className="block text-meta text-text-2" data-testid="section-remaining">
              остаток {fmtRub(s.remainingRub)}
            </span>
          )}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {assignments.length === 0 ? (
          <span className="text-meta text-warn">Бригада не назначена</span>
        ) : (
          assignments.map((a) => (
            <span
              key={a.id}
              className="inline-flex min-h-11 items-center gap-1 rounded-full border border-line ps-3 text-meta"
            >
              {brigade(a.brigadeId)} · с {fmtDay(a.from)}
              {a.to ? ` по ${fmtDay(a.to)}` : ""}
              {manage ? (
                <button
                  type="button"
                  aria-label={`Снять назначение: ${brigade(a.brigadeId)}`}
                  onClick={() =>
                    void actions
                      .unassign(a.id)
                      .then((r) =>
                        r.ok ? toast.success("Назначение снято") : toast.error(r.message),
                      )
                  }
                  className="grid size-11 place-items-center rounded-full text-text-2 focus-ring is-hover:bg-surface-2"
                >
                  ×
                </button>
              ) : null}
            </span>
          ))
        )}
        {manage ? (
          <Button variant="secondary" size="sm" onClick={onAssign}>
            Назначить бригаду
          </Button>
        ) : null}
      </div>
      {s.history.length ? (
        <div className="mt-2">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="inline-flex min-h-11 items-center gap-1 text-meta text-text-2 focus-ring"
          >
            История доли: {s.history.length}
            <ChevronDown
              className={cn("size-4 transition-fast", open && "rotate-180")}
              aria-hidden
            />
          </button>
          {open ? (
            <ol className="mt-1 flex flex-col gap-1 text-meta text-text-2 tnum">
              {s.history.map((p) => (
                <li key={p.id}>
                  {fmtDay(p.at.slice(0, 10))}: {fmtShare(p.fromBp)} → {fmtShare(p.toBp)},{" "}
                  {PROGRESS_KIND_LABEL[p.kind]}, начислено {fmtRub(p.accruedRub)}
                  {p.reason ? `, причина: ${p.reason}` : ""}
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function AssignSection({
  objectId,
  section,
  onClose,
}: {
  objectId: string;
  section: SectionLedger;
  onClose: () => void;
}) {
  const options = useAssignOptions();
  const actions = useSectionActions();
  const [brigadeId, setBrigadeId] = useState("");
  const [from, setFrom] = useState(options.weekFrom);
  const [to, setTo] = useState(options.weekTo);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (busy) return;
    setBusy(true);
    const result = await actions.assign({
      objectId,
      sectionKey: section.key,
      brigadeId,
      from,
      to: to || null,
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success("Раздел назначен. Бригадир увидит его в форме времени");
    onClose();
  };
  return (
    <AdaptiveSheet
      open
      onOpenChange={(next) => (next ? undefined : onClose())}
      id="assign-section"
      title="Назначить раздел бригаде"
      description={sectionLabel(section)}
      actions={
        <Button disabled={!brigadeId || !from || busy} onClick={() => void save()}>
          Назначить
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-meta">
          Бригада
          <select
            className="h-12 max-w-full rounded-control border border-line bg-surface px-3 text-body"
            value={brigadeId}
            onChange={(e) => setBrigadeId(e.target.value)}
          >
            <option value="">Выберите бригаду</option>
            {options.brigades.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-meta">
            С
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-12 rounded-control border border-line bg-surface px-3 text-body"
            />
          </label>
          <label className="flex flex-col gap-1 text-meta">
            По, пусто: до отмены
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-12 rounded-control border border-line bg-surface px-3 text-body"
            />
          </label>
        </div>
      </div>
    </AdaptiveSheet>
  );
}
