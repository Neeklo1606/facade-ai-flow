/**
 * Акт в окне «как в 1С» (ADR-084): командная панель сверху, форма «подпись — значение»
 * слева, комплектность и действия справа. Правки полей копятся в окне и записываются кнопкой
 * «Записать» одной пачкой; у исправленного поля источник становится «Исправил» (ADR-058).
 * Страница акта /gas/docs/$docId остаётся для телефона и прямых ссылок.
 */
import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DOC_STATUS_LABEL,
  FORM_CHECK_NOTE,
  useDocDetail,
  useDocsActions,
  useDocsActor,
  type DocDetail,
} from "@/api/gas-docs";
import { EmptyState, StatusChip } from "@/components/ui/mono";
import { toast } from "@/lib/toast";
import { useWindowFrame } from "../windows/windows";
import { Actions, Completeness } from "./DocScreen";
import { DOC_TONE } from "./common";

export function ActWindow({ docId }: { docId: string }) {
  const detail = useDocDetail(docId);
  if (!detail) {
    return (
      <EmptyState
        title="Акт не найден"
        text="Его нет или он по объекту, который вам не доступен."
      />
    );
  }
  return <ActForm detail={detail} />;
}

function ActForm({ detail }: { detail: DocDetail }) {
  const { view } = detail;
  const who = useDocsActor();
  const actions = useDocsActions();
  const frame = useWindowFrame();
  const editable = who.canEdit && detail.editable;
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const fields = useMemo(() => detail.sections.flatMap((s) => s.fields), [detail.sections]);
  const changed = useMemo(
    () => fields.filter((f) => f.key in draft && draft[f.key]!.trim() !== f.value.trim()),
    [fields, draft],
  );
  const dirty = changed.length > 0;

  const save = useCallback(async (): Promise<boolean> => {
    if (!changed.length) return true;
    setSaving(true);
    try {
      for (const field of changed) {
        const result = await actions.editField({
          docId: view.doc.id,
          key: field.key,
          value: draft[field.key]!,
        });
        if (!result.ok) {
          toast.error(`${field.label || "Поле"}: ${result.message}`);
          return false;
        }
      }
      setDraft({});
      toast.success(
        changed.length === 1
          ? "Записано: 1 поле, источник «Исправил»"
          : `Записано полей: ${changed.length}, источник «Исправил»`,
      );
      return true;
    } finally {
      setSaving(false);
    }
  }, [actions, changed, draft, view.doc.id]);

  useEffect(() => {
    frame?.setDirty(dirty);
  }, [frame, dirty]);
  useEffect(() => {
    frame?.setSave(save);
    return () => frame?.setSave(null);
  }, [frame, save]);

  return (
    <div
      className="gas-doc-form"
      onKeyDown={(event) => {
        // Ctrl+S / Cmd+S: записать, как в 1С
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          void save();
        }
      }}
    >
      <div className="gas-doc-bar" role="toolbar" aria-label="Команды акта">
        {editable ? (
          <>
            <button
              type="button"
              className="mono-btn mono-btn-primary focus-ring gas-doc-cmd"
              disabled={saving}
              onClick={async () => {
                if (await save()) frame?.requestClose();
              }}
            >
              Записать и закрыть
            </button>
            <button
              type="button"
              className="mono-btn mono-btn-secondary focus-ring gas-doc-cmd"
              disabled={!dirty || saving}
              onClick={() => void save()}
            >
              Записать
            </button>
          </>
        ) : null}
        <span className="gas-doc-bar-gap" />
        <Link
          to="/gas/docs/$docId"
          params={{ docId: view.doc.id }}
          className="mono-btn mono-btn-quiet focus-ring gas-doc-cmd"
        >
          <ExternalLink aria-hidden />
          Страницей
        </Link>
      </div>

      <header className="gas-doc-head">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-heading">{view.title}</h2>
          <StatusChip tone={DOC_TONE[view.doc.status]}>
            {DOC_STATUS_LABEL[view.doc.status]}
          </StatusChip>
          <StatusChip tone="neutral">Версия {view.doc.version}</StatusChip>
          {view.work?.source === "mock" ? <StatusChip tone="neutral">Демо</StatusChip> : null}
        </div>
        <p className="text-meta text-text-2">{view.objectLabel}</p>
        <p className="text-meta text-text-3">
          {FORM_CHECK_NOTE}. Система готовит черновик, подписывают люди.
        </p>
      </header>

      <div className="gas-doc-split">
        <div className="gas-doc-fields">
          {!editable ? (
            <p className="text-meta text-text-3">
              {detail.editable
                ? "Поля правит ПТО."
                : "Акт ушёл на подпись: чтобы исправить, верните его с замечанием."}
            </p>
          ) : null}
          {detail.sections.map((section) => (
            <fieldset key={section.title} className="gas-form-group">
              <legend className="gas-form-legend">{section.title}</legend>
              {section.fields.map((field) => {
                const id = `act-${view.doc.id}-${field.key}`;
                const label = field.label || "Ещё материал";
                const value = draft[field.key] ?? field.value;
                const canEdit = editable && detail.canEditKey(field.key);
                const edited =
                  field.key in draft && draft[field.key]!.trim() !== field.value.trim();
                return (
                  <div
                    key={field.key}
                    className="gas-form-row"
                    data-edited={edited ? "" : undefined}
                  >
                    <label htmlFor={id} className="gas-form-label">
                      {label}
                    </label>
                    <div className="min-w-0">
                      {canEdit ? (
                        <textarea
                          id={id}
                          rows={value.length > 70 ? 3 : 1}
                          value={value}
                          placeholder="Заполнит ПТО"
                          onChange={(event) =>
                            setDraft((prev) => ({ ...prev, [field.key]: event.target.value }))
                          }
                          className="gas-form-input focus-ring"
                        />
                      ) : (
                        <p id={id} className="gas-form-value">
                          {field.value || "не заполнено"}
                        </p>
                      )}
                      <p className="gas-form-source">
                        {edited
                          ? "Будет: Исправил, после «Записать»"
                          : field.source
                            ? `Источник: ${field.source.label}`
                            : field.empty
                              ? "Нет данных: заполните вручную"
                              : "Источник не указан"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </fieldset>
          ))}
        </div>
        <aside className="gas-doc-side" aria-label="Комплектность и действия">
          <Completeness detail={detail} />
          <Actions detail={detail} />
        </aside>
      </div>
    </div>
  );
}
