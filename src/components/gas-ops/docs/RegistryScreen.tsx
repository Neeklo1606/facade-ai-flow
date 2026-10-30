/**
 * «Реестр ИД» объекта (ADR-058, 6): подписанные документы, выгрузка xlsx, закрытие версией
 * и пакет zip. Отдельной формы реестра в приказе № 344/пр нет: столбцы взяты из раздела 5
 * общего журнала работ «Перечень исполнительной документации».
 */
import { Archive, FileSpreadsheet } from "lucide-react";
import { useState } from "react";
import {
  ruDate,
  useDocsActions,
  useDocsActor,
  useExecDownloads,
  useRegistry,
  type RegistryVersion,
} from "@/api/gas-docs";
import { Button, Card, EmptyState, StatusChip } from "@/components/ui/mono";
import { toast } from "@/lib/toast";
import { DocsGate, ObjectPick, useObjectPick } from "./common";

export function RegistryScreen() {
  return (
    <DocsGate screen="docsRegistry">
      <Registry />
    </DocsGate>
  );
}

function Registry() {
  const [objectId, setObjectId] = useObjectPick();
  const registry = useRegistry(objectId);
  const actions = useDocsActions();
  const who = useDocsActor();
  const downloads = useExecDownloads();
  const [error, setError] = useState<string | null>(null);

  if (!objectId) {
    return (
      <EmptyState
        title="Объектов с работами нет"
        text="Реестр появится, когда по объекту будут акты."
      />
    );
  }

  const file = async (make: () => Promise<string>) => {
    try {
      toast.success(`Файл скачан: ${await make()}`);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Файл не собран. Повторите.");
    }
  };

  const close = async () => {
    const result = await actions.closeRegistry({ objectId });
    if (!result.ok) return setError(result.message);
    setError(null);
    toast.success(`Реестр закрыт: версия ${result.value.version}`);
  };

  return (
    <div className="flex flex-col gap-section">
      <div className="max-w-sm">
        <ObjectPick value={objectId} onChange={setObjectId} />
      </div>
      <Card
        title="Текущий реестр"
        action={
          registry.pendingNew ? (
            <StatusChip tone="caution">Новых подписанных: {registry.pendingNew}</StatusChip>
          ) : null
        }
      >
        <div className="flex flex-col gap-4">
          {registry.current.length === 0 ? (
            <p className="type-text text-ink-2">
              Подписанных документов пока нет: реестр собирается из них.
            </p>
          ) : (
            <ol aria-label="Документы реестра" className="flex flex-col divide-y divide-line">
              {registry.current.map((row, i) => (
                <li key={row.docId} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="type-text font-medium">
                      {i + 1}. {row.title}
                    </span>
                    <StatusChip tone="up">{registry.statusOf(row.docId)}</StatusChip>
                  </div>
                  <p className="type-small text-ink-3">
                    {row.details} · подписан {ruDate(row.signedAt)}
                  </p>
                </li>
              ))}
            </ol>
          )}
          <div className="flex flex-wrap gap-3">
            {who.canEdit ? (
              <Button disabled={registry.pendingNew === 0} onClick={close}>
                Закрыть реестр версией
              </Button>
            ) : null}
            <Button
              variant="secondary"
              onClick={() => file(() => downloads.registry(objectId, null))}
            >
              <FileSpreadsheet aria-hidden />
              Скачать xlsx
            </Button>
            <Button variant="secondary" onClick={() => file(() => downloads.package(objectId))}>
              <Archive aria-hidden />
              Пакет zip
            </Button>
          </div>
          <p className="type-small text-ink-3">
            Пакет: все акты объекта в docx (неподписанные с меткой «Черновик») и реестр последней
            версии. Столбцы реестра по разделу 5 общего журнала работ, сверить с приказом № 1026/пр.
          </p>
          {error ? (
            <p role="alert" className="type-label text-down">
              {error}
            </p>
          ) : null}
        </div>
      </Card>
      <Card title="Версии реестра">
        {registry.versions.length === 0 ? (
          <p className="type-text text-ink-2">Закрытых версий нет.</p>
        ) : (
          <ul aria-label="Версии реестра" className="flex flex-col divide-y divide-line">
            {registry.versions.map((v) => (
              <VersionRow
                key={v.id}
                version={v}
                onDownload={() => file(() => downloads.registry(objectId, v))}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function VersionRow({ version, onDownload }: { version: RegistryVersion; onDownload: () => void }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <span className="flex flex-col gap-1">
        <span className="type-text font-medium">Версия {version.version}</span>
        <span className="type-small text-ink-3">
          {version.rows.length} док. · закрыл {version.closedBy},{" "}
          {ruDate(version.closedAt.slice(0, 10))}
        </span>
      </span>
      <Button
        variant="secondary"
        onClick={onDownload}
        aria-label={`Скачать xlsx версии ${version.version}`}
      >
        <FileSpreadsheet aria-hidden />
        xlsx
      </Button>
    </li>
  );
}
