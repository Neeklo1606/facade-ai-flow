/**
 * Редактор акта (ADR-058, 4): поля формы слева, предпросмотр документа справа, у каждого
 * значения источник. Ниже комплектность с «Добавить», действия по статусу, замечания
 * и история. Файл docx и печать в PDF с меткой «Черновик» до подписи.
 */
import { Link } from "@tanstack/react-router";
import { ArrowLeft, FileDown, Printer } from "lucide-react";
import { useState } from "react";
import {
  DOC_STATUS_LABEL,
  DOC_TYPE_LABEL,
  FORM_CHECK_NOTE,
  SIDE_LABEL,
  ruDate,
  useDocDetail,
  useDocsActions,
  useDocsActor,
  useExecDownloads,
  type ActSection,
  type DocDetail,
} from "@/api/gas-docs";
import { Button, Card, EmptyState, FormField, StatusChip, Timeline } from "@/components/ui/mono";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { FilePick } from "../supply/common";
import { DOC_TONE, DocsGate, IssueRow } from "./common";

export function DocScreen({ docId }: { docId: string }) {
  return (
    <DocsGate screen="docs">
      <Editor docId={docId} />
    </DocsGate>
  );
}

function Editor({ docId }: { docId: string }) {
  const detail = useDocDetail(docId);
  if (!detail) {
    return (
      <EmptyState
        title="Акт не найден"
        text="Его нет или он по объекту, который вам не доступен."
      />
    );
  }
  const { view } = detail;
  return (
    <div className="flex flex-col gap-section">
      <div data-print="hide" className="flex flex-col gap-section">
        <Link
          to="/gas/docs"
          className="mono-row focus-ring -ms-4 self-start rounded-pill type-label"
        >
          <ArrowLeft className="size-5" aria-hidden />
          Все документы
        </Link>
        <Card>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="type-screen">{view.title}</h2>
              <StatusChip tone={DOC_TONE[view.doc.status]}>
                {DOC_STATUS_LABEL[view.doc.status]}
              </StatusChip>
              <StatusChip tone="neutral">Версия {view.doc.version}</StatusChip>
              {view.work?.source === "mock" ? <StatusChip tone="neutral">Демо</StatusChip> : null}
            </div>
            <p className="type-text text-ink-2">{view.objectLabel}</p>
            <p className="type-small text-ink-3">
              {FORM_CHECK_NOTE}. Система готовит черновик, подписывают люди.
            </p>
          </div>
        </Card>
        <Completeness detail={detail} />
        <Actions detail={detail} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-section lg:grid-cols-2 lg:items-start">
        <div data-print="hide">
          <Card title="Поля формы">
            <Fields detail={detail} />
          </Card>
        </div>
        <Preview detail={detail} />
      </div>

      <div data-print="hide" className="flex flex-col gap-section">
        {view.doc.remarks.length ? (
          <Card title="Замечания">
            <ul className="flex flex-col divide-y divide-line">
              {[...view.doc.remarks].reverse().map((r) => (
                <li key={r.at} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                  <p className="type-text">{r.reason}</p>
                  <p className="type-small text-ink-3">
                    {r.by}, {ruDate(r.at.slice(0, 10))} · к версии {r.version}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
        <Card title="История">
          <Timeline
            label="История акта"
            events={[...view.doc.history].reverse().map((h, i) => ({
              id: `${h.at}-${i}`,
              at: `${ruDate(h.at.slice(0, 10))}, ${h.at.slice(11, 16)}`,
              who: h.actor,
              what: DOC_STATUS_LABEL[h.status],
              change: h.note,
            }))}
          />
        </Card>
      </div>
    </div>
  );
}

function Completeness({ detail }: { detail: DocDetail }) {
  const { completeness, doc } = detail.view;
  if (!detail.draftMark) return null;
  return (
    <Card
      title="Комплектность"
      action={
        <StatusChip tone={completeness.complete ? "up" : "caution"}>
          {completeness.complete ? "Полный" : `${completeness.percent}%`}
        </StatusChip>
      }
    >
      {completeness.complete ? (
        <p className="type-text text-ink-2">
          Все основания на месте: работы подтверждены, сертификаты, схемы и приказы есть.
        </p>
      ) : (
        <ul aria-label="Чего не хватает" className="flex flex-col divide-y divide-line">
          {completeness.issues.map((issue) => (
            <IssueRow
              key={`${issue.code}-${JSON.stringify(issue.target)}`}
              issue={issue}
              objectId={doc.objectId}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function Actions({ detail }: { detail: DocDetail }) {
  const actions = useDocsActions();
  const who = useDocsActor();
  const downloads = useExecDownloads();
  const { doc, completeness } = detail.view;
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<{ ok: boolean; message?: string }>, done: string) => {
    const result = await action();
    if (!result.ok) return setError(result.message ?? "Не выполнено. Повторите.");
    setError(null);
    setReason("");
    toast.success(done);
  };

  const download = async () => {
    try {
      const name = await downloads.act(doc.id);
      toast.success(`Файл скачан: ${name}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Файл не собран. Повторите.");
    }
  };

  return (
    <Card title="Действия">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-3">
          {who.canEdit && doc.status === "draft" ? (
            <Button
              onClick={() =>
                run(() => actions.moveDoc({ docId: doc.id, to: "review" }), "Акт на проверке ПТО")
              }
            >
              Отправить на проверку
            </Button>
          ) : null}
          {who.canEdit && doc.status === "review" ? (
            <Button
              disabled={!completeness.complete}
              onClick={() =>
                run(
                  () => actions.moveDoc({ docId: doc.id, to: "signing" }),
                  "Акт передан на подпись",
                )
              }
            >
              Передать на подпись
            </Button>
          ) : null}
          {who.canEdit && doc.status === "signing" ? (
            <FilePick
              label="Загрузить скан подписанного"
              accept="image/*,.pdf"
              files={[]}
              onPick={([name]) =>
                run(
                  () => actions.moveDoc({ docId: doc.id, to: "signed", scan: name! }),
                  "Акт подписан, скан загружен",
                )
              }
            />
          ) : null}
          <Button variant="secondary" onClick={download}>
            <FileDown aria-hidden />
            Скачать docx
          </Button>
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer aria-hidden />
            Печать или PDF
          </Button>
        </div>
        {doc.status === "review" && !completeness.complete ? (
          <p className="type-small text-ink-3">
            На подпись акт уходит с полным комплектом: добавьте недостающее выше.
          </p>
        ) : null}
        {doc.status === "signed" ? (
          <p className="type-small text-ink-3">
            Скан: {doc.scan}. Акт войдёт в реестр, когда ПТО закроет версию в{" "}
            <Link
              to="/gas/docs-registry"
              className="focus-ring rounded-tile underline underline-offset-4"
            >
              «Реестре ИД»
            </Link>
            .
          </p>
        ) : null}
        {doc.status === "registry" ? (
          <p className="type-small text-ink-3">Скан: {doc.scan}. Акт в реестре.</p>
        ) : null}
        {who.canEdit && (doc.status === "review" || doc.status === "signing") ? (
          <div className="flex flex-col gap-3 mono-inset lg:flex-row lg:items-end">
            <FormField label="Замечание">
              {(props) => (
                <input
                  {...props}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="mono-input focus-ring"
                  placeholder="Например, уточнить оси и отметки"
                />
              )}
            </FormField>
            <Button
              variant="secondary"
              onClick={() =>
                run(
                  () => actions.moveDoc({ docId: doc.id, to: "draft", reason }),
                  "Акт возвращён: новая версия",
                )
              }
            >
              Вернуть с замечанием
            </Button>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="type-label text-down">
            {error}
          </p>
        ) : null}
      </div>
    </Card>
  );
}

function Fields({ detail }: { detail: DocDetail }) {
  const who = useDocsActor();
  const editable = who.canEdit && detail.editable;
  return (
    <div className="flex flex-col gap-5">
      {!editable ? (
        <p className="type-small text-ink-3">
          {detail.editable
            ? "Поля правит ПТО."
            : "Акт ушёл на подпись: чтобы исправить, верните его с замечанием."}
        </p>
      ) : null}
      {detail.sections.map((section) => (
        <section key={section.title} className="flex flex-col gap-4">
          <h3 className="type-card">{section.title}</h3>
          {section.fields.map((f) => (
            <FieldRow
              key={`${f.key}:${f.value}`}
              docId={detail.view.doc.id}
              field={f}
              editable={editable && detail.canEditKey(f.key)}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

function FieldRow({
  docId,
  field,
  editable,
}: {
  docId: string;
  field: ActSection["fields"][number];
  editable: boolean;
}) {
  const actions = useDocsActions();
  const [value, setValue] = useState(field.value);
  const label = field.label || "Ещё материал";
  const save = async () => {
    if (value.trim() === field.value.trim()) return;
    const result = await actions.editField({ docId, key: field.key, value });
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success("Поле исправлено: источник «Исправил»");
  };
  return (
    <div className="flex flex-col gap-1">
      {editable ? (
        <FormField label={label}>
          {(props) => (
            <textarea
              {...props}
              rows={2}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={save}
              placeholder="Заполнит ПТО"
              className="mono-input focus-ring min-h-20 py-3"
            />
          )}
        </FormField>
      ) : (
        <>
          <span className="type-label text-ink-3">{label}</span>
          <span className="type-text">{field.value || "не заполнено"}</span>
        </>
      )}
      <p className={cn("type-small", field.source ? "text-ink-3" : "text-ink-3 italic")}>
        {field.source
          ? `Источник: ${field.source.label}`
          : field.empty
            ? "Нет данных: заполните вручную"
            : "Источник не указан"}
      </p>
    </div>
  );
}

/** Предпросмотр: то же содержимое, что в файле, без источников. Его и печатает браузер */
function Preview({ detail }: { detail: DocDetail }) {
  const { view, sections, participants } = detail;
  return (
    <section
      aria-label="Предпросмотр документа"
      className="mono-card relative flex flex-col gap-4 p-6"
    >
      {detail.draftMark ? (
        <p className="self-center rounded-pill border border-line-2 px-3 py-1 type-label">
          Черновик
        </p>
      ) : null}
      <h3 className="text-center type-card">
        {DOC_TYPE_LABEL[view.doc.type]} №&nbsp;{view.doc.number}
      </h3>
      <p className="text-center type-small text-ink-3">Редакция {view.doc.version}</p>
      {sections.map((s) => (
        <div key={s.title} className="flex flex-col gap-2">
          {s.fields.map((f) => (
            <div key={f.key} className="flex flex-col gap-0.5">
              {f.label ? <span className="type-label">{f.label}</span> : null}
              <span className="type-small text-ink-2">{f.value || "_______________"}</span>
            </div>
          ))}
        </div>
      ))}
      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <span className="type-label">Подписи</span>
        {participants.map((p) => (
          <span key={p.id} className="type-small text-ink-2">
            {SIDE_LABEL[p.side]}: {p.position}, {p.person} ____________
          </span>
        ))}
      </div>
    </section>
  );
}
