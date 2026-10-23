import { completePageHead } from "@/lib/page-head";
import { ScreenHint } from "@/components/gas-ops/page";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Field } from "@/components/ui/kit/field";
import { ListRow } from "@/components/ui/kit/list";
import { Sheet } from "@/components/ui/kit/sheet";
import { Segmented } from "@/components/ui/kit/controls";
import { FieldGroup, FieldRow, MetricCard } from "@/components/ui/kit/data";
import { notify } from "@/components/ui/kit/toast";
import { fmtHours, fmtRate, fmtRub, useGasBrigades, useGasEntries } from "@/api/gas-ops";
import { entryLine, fmtShortDay } from "@/components/gas-ops/review/rules";
import { setOnVacation, useOnVacation } from "@/lib/gas-ops/week-crew";
import { cn } from "@/lib/utils";

/**
 * Бригады и подгруппы (ТЗ, п. 8; вид ADR-045, 5.8). Строка бригады: бригадир, часы
 * и доходность недели, статус недели точкой «Работает» или «В отпуске». «Состав на неделю»
 * с переключателями и добавление бригады — демо раздела «Развитие»: в расчёт не входят.
 */
export const Route = createFileRoute("/gas/brigades")({
  head: () =>
    completePageHead(
      { meta: [{ title: "Бригады · Учёт выработки бригад" }] },
      "Бригады · Учёт выработки бригад",
      "Состав бригад, объекты недели, часы и начисления.",
    ),
  component: BrigadesPage,
});

interface Draft {
  name: string;
  lead: string;
  phone: string;
}

function BrigadesPage() {
  const cards = useGasBrigades("confirmed");
  const away = useOnVacation();
  const [view, setView] = useState<"list" | "crew">("list");
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>({ name: "", lead: "", phone: "" });
  const [tried, setTried] = useState(false);
  const [added, setAdded] = useState<Draft[]>([]);

  const groups = [...new Set(cards.map((card) => card.group?.name ?? "Без подразделения"))];
  const current = cards.find((card) => card.brigade.id === open) ?? null;
  const history = useGasEntries({ brigadeId: open ?? "__none__" }).slice(0, 5);

  const save = () => {
    setTried(true);
    if (!draft.name.trim()) return;
    setAdded((list) => [...list, draft]);
    notify(`${draft.name.trim()} добавлена в демо`);
    setDraft({ name: "", lead: "", phone: "" });
    setTried(false);
    setAdding(false);
  };

  return (
    <div className="flex flex-col gap-block">
      <ScreenHint screen="brigades" className="mb-0" />

      <div className="flex items-center justify-between gap-2">
        <Segmented
          label="Вид списка"
          value={view}
          onChange={setView}
          options={[
            { value: "list", label: "Бригады" },
            { value: "crew", label: "Состав на неделю" },
          ]}
        />
        <Button
          variant="primary"
          size="lg"
          className="hidden md:inline-flex"
          onClick={() => setAdding(true)}
        >
          <Plus aria-hidden />
          Добавить бригаду
        </Button>
      </div>

      {view === "crew" ? (
        <p className="text-meta text-text-3">
          Развитие · демо: отметка «работает» или «в отпуске» на неделю 28.09 – 03.10, в расчёт
          выработки не входит.
        </p>
      ) : null}

      {groups.map((groupName) => {
        const own = cards.filter((card) => (card.group?.name ?? "Без подразделения") === groupName);
        const amount = own.reduce((a, card) => a + card.totals.amountRub, 0);
        const minutes = own.reduce((a, card) => a + card.totals.minutes, 0);
        return (
          <section key={groupName} aria-label={groupName}>
            <h2 className="flex h-7 items-center justify-between gap-2 text-meta text-text-3 tnum">
              <span className="truncate">{groupName}</span>
              <span className="shrink-0">
                {own.length} · {fmtRub(amount)} · {fmtHours(minutes / 60)}
              </span>
            </h2>
            <ul className="surface-1 overflow-hidden [&>li+li]:border-t [&>li+li]:border-line">
              {own.map((card) => {
                const vacation = away.has(card.brigade.id);
                const lead = card.lead ? card.lead.name : "бригадир не назначен";
                return (
                  <li key={card.brigade.id}>
                    {view === "crew" ? (
                      <label className="flex min-h-row-compact cursor-pointer items-center gap-3 px-row py-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-body text-text">
                            {card.brigade.name}
                          </span>
                          <span className="block truncate text-meta text-text-3">{lead}</span>
                        </span>
                        <span className={cn("text-meta", vacation ? "text-text-3" : "text-ok")}>
                          {vacation ? "в отпуске" : "работает"}
                        </span>
                        <Switch
                          checked={!vacation}
                          onCheckedChange={(on) => setOnVacation(card.brigade.id, !on)}
                          aria-label={`${card.brigade.name}: работает на этой неделе`}
                        />
                      </label>
                    ) : (
                      <ListRow
                        title={card.brigade.name}
                        meta={
                          <>
                            <WeekDot vacation={vacation} /> {lead}
                            {card.pending > 0 ? ` · ${card.pending} на проверке` : ""}
                          </>
                        }
                        value={fmtHours(card.totals.minutes / 60)}
                        valueMeta={fmtRate(card.totals.revenuePerHour)}
                        onClick={() => setOpen(card.brigade.id)}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {added.length ? (
        <section aria-label="Добавлено в демо">
          <h2 className="flex h-7 items-center text-meta text-text-3">Добавлено в демо</h2>
          <ul className="surface-1 overflow-hidden [&>li+li]:border-t [&>li+li]:border-line">
            {added.map((item, index) => (
              <li key={`${item.name}-${index}`}>
                <ListRow
                  title={item.name}
                  meta={`${item.lead || "бригадир не указан"} · Демо, в расчёт не входит`}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-meta text-text-3">
        Цифры по подтверждённым записям. Доходность бригады: сумма за неделю, делённая на её часы, а
        не среднее по строкам: среднее завысило бы короткие дорогие работы.
      </p>

      {/* Главная кнопка на телефоне в конце списка: внизу один слой, нижняя панель (4.4) */}
      <Button variant="primary" size="lg" className="md:hidden" onClick={() => setAdding(true)}>
        <Plus aria-hidden />
        Добавить бригаду
      </Button>

      <Sheet
        open={!!current}
        onOpenChange={(next) => {
          if (!next) setOpen(null);
        }}
        id="brigade"
        size="full"
        eyebrow={current?.group?.name ?? "Бригада"}
        title={current?.brigade.name ?? ""}
      >
        {current ? (
          <div className="flex flex-col gap-section">
            <div className="grid grid-cols-2 gap-block">
              <MetricCard label="Начислено" value={fmtRub(current.totals.amountRub)} />
              <MetricCard label="Часы" value={fmtHours(current.totals.minutes / 60)} />
              <MetricCard label="Доходность" value={fmtRate(current.totals.revenuePerHour)} />
              <MetricCard label="Объектов" value={String(current.objects.length)} />
            </div>
            <FieldGroup title="Состав">
              {current.members.length ? (
                current.members.map((member) => (
                  <FieldRow
                    key={member.id}
                    icon={Users}
                    label={member.isLead ? "Бригадир" : "В составе"}
                    value={member.name}
                  />
                ))
              ) : (
                <p className="py-2 text-body text-text-3">Состав не указан</p>
              )}
            </FieldGroup>
            <section className="py-2">
              <h3 className="text-meta-strong text-text-2">Объекты недели</h3>
              {current.objects.length ? (
                <ul className="mt-1 divide-y divide-line">
                  {current.objects.map((object) => (
                    <li key={object.id} className="py-2 text-body">
                      {object.label}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-2 text-body text-text-3">Подтверждённых записей нет</p>
              )}
            </section>
            <section className="py-2">
              <h3 className="text-meta-strong text-text-2">Последние записи</h3>
              <ul className="mt-1 divide-y divide-line">
                {history.map((view) => (
                  <li key={view.entry.id} className="flex items-start justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-body">{view.object?.label}</span>
                      <span className="block text-meta text-text-3 tnum">
                        {fmtShortDay(view.entry.day)} · {entryLine(view)}
                      </span>
                    </span>
                    <span className="shrink-0 text-body-strong tnum">
                      {view.entry.amountRub === null ? "нет суммы" : fmtRub(view.entry.amountRub)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        ) : null}
      </Sheet>

      <Sheet
        open={adding}
        onOpenChange={setAdding}
        id="brigade-add"
        title="Новая бригада"
        description="Демо: бригада появится в списке этой вкладки, в расчёт не входит"
        actions={
          <>
            <Button variant="primary" size="lg" className="flex-1" onClick={save}>
              Сохранить
            </Button>
            <Button variant="outline" size="lg" onClick={() => setAdding(false)}>
              Отмена
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-block">
          <p className="text-meta text-text-3">Развитие · демо: справочник ведёт администратор.</p>
          <Field
            label="Название"
            value={draft.name}
            onChange={(name) => setDraft((d) => ({ ...d, name }))}
            placeholder="Бригада 8"
            error={draft.name.trim() ? null : "Укажите название"}
            showError={tried}
          />
          <Field
            label="Бригадир"
            value={draft.lead}
            onChange={(lead) => setDraft((d) => ({ ...d, lead }))}
            placeholder="Фамилия И. О."
          />
          <Field
            label="Телефон для MAX"
            value={draft.phone}
            onChange={(phone) => setDraft((d) => ({ ...d, phone }))}
            inputMode="tel"
            type="tel"
            placeholder="+7"
            hint="Бот MAX в демо не подключён"
          />
        </div>
      </Sheet>
    </div>
  );
}

/** Статус недели точкой: работает (зелёный) или в отпуске (серый) */
function WeekDot({ vacation }: { vacation: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={cn("size-2 rounded-full", vacation ? "bg-text-3" : "bg-ok")} />
      {vacation ? "В отпуске" : "Работает"} ·
    </span>
  );
}
