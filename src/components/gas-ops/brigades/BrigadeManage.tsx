/**
 * Управление бригадой в её карточке (ADR-089): изменить, удалить, объекты бригады и
 * привязка к объекту галочками по разделам сметы. Окна по центру, как в 1С.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Link2, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/kit/field";
import { CenterDialog } from "@/components/gas-ops/CenterDialog";
import { DeleteConfirm } from "@/components/gas-ops/cleanup/DeleteConfirm";
import { useGasDirectory } from "@/api/gas-ops";
import {
  useBindableObjects,
  useBrigadeActions,
  useBrigadeEntryCount,
  useBrigadeObjects,
} from "@/api/gas-brigades";
import { SECTION_ROLE_LABEL, useSectionActions } from "@/api/gas-section-accrual";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const fmtDay = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;

interface BrigadeInfo {
  id: string;
  name: string;
  code: string;
  groupId: string;
  phone: string | null;
}

/* ---------------------------------------------------------------- Изменить */

export function BrigadeEdit({ brigade }: { brigade: BrigadeInfo }) {
  const directory = useGasDirectory();
  const actions = useBrigadeActions();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(brigade.name);
  const [groupId, setGroupId] = useState(brigade.groupId);
  const [phone, setPhone] = useState(brigade.phone ?? "");
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const nameError = name.trim() ? null : "Укажите название";

  const start = () => {
    setName(brigade.name);
    setGroupId(brigade.groupId);
    setPhone(brigade.phone ?? "");
    setTried(false);
    setOpen(true);
  };

  const save = async () => {
    setTried(true);
    if (nameError) return;
    setBusy(true);
    const result = await actions.update({
      id: brigade.id,
      name,
      groupId,
      phone: phone.trim() || null,
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success("Бригада сохранена");
    setOpen(false);
  };

  return (
    <>
      <Button variant="secondary" onClick={start} data-testid="brigade-edit">
        <Pencil aria-hidden />
        Изменить
      </Button>
      <CenterDialog
        open={open}
        onOpenChange={setOpen}
        testId="brigade-edit-dialog"
        title={`Бригада ${brigade.code}`}
        description="Название, подразделение и телефон бригадира"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={() => void save()}
              data-testid="brigade-edit-save"
            >
              Сохранить
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-block">
          <Field
            label="Название"
            value={name}
            onChange={setName}
            error={nameError}
            showError={tried}
            data-testid="brigade-edit-name"
          />
          <label className="flex flex-col gap-1">
            <span className="text-meta text-text-2">Подразделение</span>
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="h-btn w-full rounded-control border border-field-line bg-panel-2 px-3 text-body"
            >
              {directory.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="Телефон бригадира"
            value={phone}
            onChange={setPhone}
            inputMode="tel"
            placeholder="+7 900 000-00-00"
          />
          <p className="text-meta text-text-3">
            Код {brigade.code} не меняется: по нему бригада находится в графике и записях.
          </p>
        </div>
      </CenterDialog>
    </>
  );
}

/* ---------------------------------------------------------------- Удалить */

export function BrigadeDelete({
  brigade,
  onDeleted,
}: {
  brigade: BrigadeInfo;
  onDeleted: () => void;
}) {
  const entries = useBrigadeEntryCount(brigade.id);
  const actions = useBrigadeActions();
  if (entries > 0)
    return (
      <p className="text-meta text-text-3" data-testid="brigade-delete-blocked">
        Удалить нельзя: у бригады {entries} записей времени. Они нужны табелю и отчётам.
      </p>
    );
  return (
    <DeleteConfirm
      testId="brigade-delete-dialog"
      trigger={
        <Button variant="destructive" className="self-start" data-testid="brigade-delete">
          <Trash2 aria-hidden />
          Удалить бригаду
        </Button>
      }
      title={`Удалить бригаду «${brigade.name}»?`}
      description={
        <>
          <p>Удалятся состав, ставки, отпуск и назначения бригады на разделы.</p>
          <p>Записей времени у бригады нет. Вернуть удалённое нельзя.</p>
        </>
      }
      confirmLabel="Удалить бригаду"
      onConfirm={async () => {
        const result = await actions.remove(brigade.id);
        if (!result.ok) {
          toast.error(result.message);
          return false;
        }
        toast.success("Бригада удалена");
        onDeleted();
        return true;
      }}
    />
  );
}

/* ---------------------------------------------------------------- Объекты бригады */

export function BrigadeObjects({ brigadeId, manage }: { brigadeId: string; manage: boolean }) {
  const objects = useBrigadeObjects(brigadeId);
  const actions = useSectionActions();
  return (
    <section aria-labelledby="brigade-objects" data-testid="brigade-objects">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="brigade-objects" className="text-meta-strong text-text-2">
          Объекты бригады
        </h3>
        {manage ? <BindObject brigadeId={brigadeId} /> : null}
      </div>
      {objects.length === 0 ? (
        <p className="mt-1 text-meta text-text-3">
          Не привязана к объектам. Привяжите к разделам сметы объекта: бригадир увидит их в форме
          времени.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {objects.map((o) => (
            <li
              key={o.objectId}
              className="rounded-card border border-line p-3"
              data-testid="brigade-object"
            >
              <Link
                to="/gas/objects/$id"
                params={{ id: o.objectId }}
                className="block truncate text-body-strong focus-ring"
              >
                {o.code} · {o.label}
              </Link>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {o.sections.map((s) => (
                  <li
                    key={s.assignmentId}
                    className="inline-flex min-h-9 items-center gap-1 rounded-pill border border-line ps-3 text-meta"
                  >
                    {s.title} · с {fmtDay(s.from)}
                    {s.to ? ` по ${fmtDay(s.to)}` : ""}
                    {manage ? (
                      <button
                        type="button"
                        aria-label={`Отвязать: ${s.title}`}
                        onClick={() =>
                          void actions
                            .unassign(s.assignmentId)
                            .then((r) =>
                              r.ok ? toast.success("Отвязано") : toast.error(r.message),
                            )
                        }
                        className="grid size-9 place-items-center rounded-full text-text-2 focus-ring is-hover:bg-surface-2"
                      >
                        <X className="size-4" aria-hidden />
                      </button>
                    ) : (
                      <span className="pe-3" />
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BindObject({ brigadeId }: { brigadeId: string }) {
  const { objects, weekFrom } = useBindableObjects(brigadeId);
  const actions = useSectionActions();
  const [open, setOpen] = useState(false);
  const [objectId, setObjectId] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [from, setFrom] = useState(weekFrom);
  const [busy, setBusy] = useState(false);
  const object = objects.find((o) => o.id === objectId) ?? null;

  const choose = (id: string) => {
    setObjectId(id);
    const next = objects.find((o) => o.id === id);
    // Разделы отчёта отмечены сразу: их бригада и делает; уже назначенные не повторяем
    setPicked(
      new Set(
        next?.sections
          .filter((s) => s.report && !s.assigned && (s.role !== "earth-pe" || s.fits))
          .map((s) => s.key),
      ),
    );
  };

  const save = async () => {
    if (!object || picked.size === 0) return;
    setBusy(true);
    let done = 0;
    for (const key of picked) {
      const result = await actions.assign({
        objectId: object.id,
        sectionKey: key,
        brigadeId,
        from,
        to: null,
      });
      if (result.ok) done += 1;
      else toast.error(result.message);
    }
    setBusy(false);
    if (done) {
      toast.success(`Привязано разделов: ${done}`);
      setOpen(false);
    }
  };

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setObjectId("");
          setPicked(new Set());
          setFrom(weekFrom);
          setOpen(true);
        }}
        data-testid="brigade-bind"
      >
        <Link2 aria-hidden />
        Привязать к объекту
      </Button>
      <CenterDialog
        open={open}
        onOpenChange={setOpen}
        testId="brigade-bind-dialog"
        title="Привязать бригаду к объекту"
        description="Объект и разделы сметы, которые делает бригада"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!object || picked.size === 0}
              onClick={() => void save()}
              data-testid="brigade-bind-save"
            >
              Привязать{picked.size ? ` (${picked.size})` : ""}
            </Button>
          </>
        }
      >
        {objects.length === 0 ? (
          <p className="text-body text-text-2">
            Объектов с разделами сметы нет. Загрузите смету: разделы появятся у объекта.
          </p>
        ) : (
          <div className="flex flex-col gap-block">
            <label className="flex flex-col gap-1">
              <span className="text-meta text-text-2">Объект</span>
              <select
                value={objectId}
                onChange={(e) => choose(e.target.value)}
                className="h-btn w-full rounded-control border border-field-line bg-panel-2 px-3 text-body"
                data-testid="brigade-bind-object"
              >
                <option value="">Выберите объект</option>
                {objects.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.code} · {o.label}
                  </option>
                ))}
              </select>
            </label>
            {object ? (
              <fieldset className="flex flex-col gap-1">
                <legend className="mb-1 text-meta text-text-2">Разделы сметы</legend>
                {[
                  ...object.sections.filter((s) => s.report),
                  ...object.sections.filter((s) => !s.report),
                ].map((s) => (
                  <label
                    key={s.key}
                    className={cn(
                      "flex min-h-12 cursor-pointer items-center gap-3 rounded-control border border-line px-3 py-2",
                      s.report && "border-s-4 border-s-orange",
                      s.assigned && "opacity-60",
                    )}
                  >
                    <Checkbox
                      checked={s.assigned || picked.has(s.key)}
                      disabled={s.assigned}
                      onCheckedChange={(on) =>
                        setPicked((prev) => {
                          const next = new Set(prev);
                          if (on) next.add(s.key);
                          else next.delete(s.key);
                          return next;
                        })
                      }
                      aria-label={s.label}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body">{s.label}</span>
                      <span className="block text-meta text-text-3">
                        {s.assigned
                          ? "уже привязан"
                          : s.role === "earth-pe" && !s.fits
                            ? "Землю и П/Э выполняют бригады № 2 и № 5"
                            : SECTION_ROLE_LABEL[s.role]}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
            ) : null}
            <label className="flex flex-col gap-1">
              <span className="text-meta text-text-2">С даты</span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-btn w-full rounded-control border border-field-line bg-panel-2 px-3 text-body tnum"
              />
            </label>
          </div>
        )}
      </CenterDialog>
    </>
  );
}
