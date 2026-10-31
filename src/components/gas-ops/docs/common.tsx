/**
 * Общие части экранов исполнительной документации (ADR-058): тон статуса, выбор объекта,
 * строка комплектности с «Добавить» и ответственным.
 */
import { useState } from "react";
import {
  useDocsActions,
  useDocsActor,
  useDocsBase,
  type DocStatus,
  type Issue,
} from "@/api/gas-docs";
import { Button, SelectSheet, StatusChip, type StatusTone } from "@/components/ui/mono";
import { toast } from "@/lib/toast";
import { FilePick } from "../supply/common";

export { SupplyGate as DocsGate } from "../supply/common";

export const DOC_TONE: Record<DocStatus, StatusTone> = {
  draft: "note",
  review: "caution",
  signing: "neutral",
  signed: "up",
  registry: "up",
};

/** Объект экрана: первый доступный по умолчанию, выбор шторкой */
export function useObjectPick(): [string | null, (id: string) => void] {
  const base = useDocsBase();
  const [picked, setPicked] = useState<string | null>(null);
  const objectId =
    picked && base.objects.some((o) => o.id === picked) ? picked : (base.objects[0]?.id ?? null);
  return [objectId, setPicked];
}

export function ObjectPick({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string) => void;
}) {
  const base = useDocsBase();
  return (
    <SelectSheet
      label="Объект"
      value={value}
      onChange={onChange}
      options={base.objects.map((o) => ({ value: o.id, label: o.code, meta: o.label }))}
    />
  );
}

const ACCEPT = "image/*,.pdf";

/** Строка комплектности: что не так, кто отвечает и «Добавить» по месту */
export function IssueRow({ issue, objectId }: { issue: Issue; objectId: string }) {
  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="type-text font-medium">{issue.text}</span>
        <StatusChip tone="caution">Ответственный: {issue.owner}</StatusChip>
      </div>
      <IssueAdd issue={issue} objectId={objectId} />
    </li>
  );
}

export function IssueAdd({
  issue,
  objectId,
  field = false,
}: {
  issue: Issue;
  objectId: string;
  /** Полевая кнопка прораба: крупнее и с камерой */
  field?: boolean;
}) {
  const actions = useDocsActions();
  const who = useDocsActor();
  const run = async (action: () => Promise<{ ok: boolean; message?: string }>, done: string) => {
    const result = await action();
    if (!result.ok) {
      toast.error(result.message ?? "Не выполнено. Повторите.");
      return;
    }
    toast.success(done);
  };
  const t = issue.target;
  if (t.kind === "volume") {
    return who.canEdit && !field ? (
      <p className="type-small text-ink-3">Объём подтверждает прораб на своём экране.</p>
    ) : (
      <Button
        field
        onClick={() => run(() => actions.confirmVolume({ workId: t.workId }), "Объём подтверждён")}
      >
        Подтвердить объём
      </Button>
    );
  }
  if (t.kind === "participant") {
    return (
      <p className="type-small text-ink-3">
        Добавьте участника в данные объекта: в демо справочник участников не редактируется.
      </p>
    );
  }
  if (t.kind === "authority" && !who.canAddAuthority) return null;
  if (!who.canUpload) return null;
  const label =
    t.kind === "certificate"
      ? "Добавить сертификат"
      : t.kind === "scheme"
        ? field
          ? "Сфотографировать схему"
          : "Добавить схему"
        : t.kind === "tests"
          ? field
            ? "Сфотографировать протокол"
            : "Добавить протокол"
          : "Добавить приказ";
  return (
    <FilePick
      label={label}
      accept={ACCEPT}
      files={[]}
      capture={field}
      onPick={([name]) =>
        run(
          () =>
            actions.addFile({
              objectId,
              kind:
                t.kind === "certificate"
                  ? "certificate"
                  : t.kind === "authority"
                    ? "authority"
                    : t.kind,
              fileName: name!,
              workId: t.kind === "scheme" || t.kind === "tests" ? t.workId : null,
              itemId: t.kind === "certificate" ? t.itemId : null,
              participantId: t.kind === "authority" ? t.participantId : null,
            }),
          `Файл добавлен: ${name}`,
        )
      }
    />
  );
}
