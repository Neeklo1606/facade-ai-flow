/**
 * «Журнал работ» (ADR-058, 7): черновики записей раздела 3 общего журнала из подтверждённых
 * объёмов. ПТО сверяет текст, дописывает условия производства работ и принимает.
 */
import { useState } from "react";
import {
  JOURNAL_CHECK_NOTE,
  ruDate,
  useDocsActions,
  useDocsActor,
  useJournal,
  type JournalDraft,
} from "@/api/gas-docs";
import { Button, Card, EmptyState, FormField, StatusChip } from "@/components/ui/mono";
import { toast } from "@/lib/toast";
import { DocsGate, ObjectPick, useObjectPick } from "./common";

export function JournalScreen() {
  return (
    <DocsGate screen="workJournal">
      <Journal />
    </DocsGate>
  );
}

function Journal() {
  const [objectId, setObjectId] = useObjectPick();
  const { drafts, accepted } = useJournal(objectId);
  const who = useDocsActor();
  if (!objectId) {
    return (
      <EmptyState
        title="Объектов с работами нет"
        text="Записи журнала берутся из подтверждённых объёмов."
      />
    );
  }
  return (
    <div className="flex flex-col gap-section">
      <div className="max-w-sm">
        <ObjectPick value={objectId} onChange={setObjectId} />
      </div>
      <p className="type-small text-ink-3">
        {JOURNAL_CHECK_NOTE}. Дневной разбивки объёма в данных нет: запись идёт на период работы.
      </p>
      <Card
        title="Черновики записей"
        action={drafts.length ? <StatusChip tone="note">{drafts.length}</StatusChip> : null}
      >
        {drafts.length === 0 ? (
          <p className="type-text text-ink-2">
            Новых черновиков нет: записи появляются, когда прораб подтверждает объём работ.
          </p>
        ) : (
          <ul aria-label="Черновики журнала" className="flex flex-col divide-y divide-line">
            {drafts.map((d) => (
              <DraftRow key={d.workId} objectId={objectId} draft={d} canAccept={who.canEdit} />
            ))}
          </ul>
        )}
      </Card>
      <Card title="Принятые записи">
        {accepted.length === 0 ? (
          <p className="type-text text-ink-2">Принятых записей пока нет.</p>
        ) : (
          <ol aria-label="Записи журнала" className="flex flex-col divide-y divide-line">
            {accepted.map((j, i) => (
              <li key={j.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <span className="type-label text-ink-3">
                  {i + 1}. {j.dates}
                </span>
                <span className="type-text">{j.text}</span>
                {j.conditions ? (
                  <span className="type-small text-ink-2">Условия: {j.conditions}</span>
                ) : null}
                <span className="type-small text-ink-3">
                  {j.representative} · принял {j.acceptedBy}, {ruDate(j.acceptedAt.slice(0, 10))}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}

function DraftRow({
  objectId,
  draft,
  canAccept,
}: {
  objectId: string;
  draft: JournalDraft;
  canAccept: boolean;
}) {
  const actions = useDocsActions();
  const [text, setText] = useState(draft.text);
  const [conditions, setConditions] = useState("");
  const accept = async () => {
    const result = await actions.acceptJournal({
      objectId,
      workId: draft.workId,
      text,
      conditions,
    });
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success("Запись принята в журнал");
  };
  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="type-text font-medium">{draft.dates}</span>
        <StatusChip tone="note">Черновик</StatusChip>
      </div>
      {canAccept ? (
        <>
          <FormField label="Наименование работ">
            {(props) => (
              <textarea
                {...props}
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="mono-input focus-ring min-h-24 py-3"
              />
            )}
          </FormField>
          <FormField label="Условия производства работ">
            {(props) => (
              <input
                {...props}
                value={conditions}
                onChange={(e) => setConditions(e.target.value)}
                placeholder="Например, погода, температура"
                className="mono-input focus-ring"
              />
            )}
          </FormField>
        </>
      ) : (
        <p className="type-text">{draft.text}</p>
      )}
      <p className="type-small text-ink-3">
        Источник: {draft.source.label} · представитель: {draft.representative || "не указан"}
      </p>
      {canAccept ? (
        <Button className="self-start" onClick={accept}>
          Принять запись
        </Button>
      ) : null}
    </li>
  );
}
