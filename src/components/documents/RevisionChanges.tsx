import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, FileDiff } from "lucide-react";
import type { ProjectDocument } from "@/contracts";
import { queries } from "@/api/queries";
import { useDirectory } from "@/api/directory";
import { useResolveChange } from "@/api/mutations";
import { Button } from "@/components/ui/button";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/**
 * Изменения между ревизиями документов объекта (ADR-015, п. 7). Карточка и реестр считают
 * неразобранные — здесь их видно и здесь их разбирают: кто и когда, запись в истории объекта.
 */
export function RevisionChanges({
  projectId,
  documents,
  canResolve,
}: {
  projectId: string;
  documents: ProjectDocument[];
  canResolve: boolean;
}) {
  const changes = useQuery(queries.revisionChanges(projectId)).data ?? [];
  const resolve = useResolveChange();
  const { employeeName } = useDirectory();
  const [showResolved, setShowResolved] = useState(false);
  if (!changes.length) return null;

  const titleOf = (documentId: string) =>
    documents.find((item) => item.documentId === documentId)?.title ?? "Документ";
  const open = changes.filter((item) => item.status === "open");
  const resolved = changes.filter((item) => item.status === "resolved");

  return (
    <section aria-labelledby="revision-changes" className="card-surface">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <FileDiff className="size-4 text-text-muted" strokeWidth={1.75} aria-hidden />
        <h2 id="revision-changes" className="text-[14px] font-semibold">
          Изменения документации
        </h2>
        <span className="text-caption text-text-muted">
          {open.length
            ? `без разбора: ${fmtNum(open.length)}`
            : `все разобраны: ${fmtNum(resolved.length)}`}
        </span>
      </header>

      {open.length > 0 && (
        <ul className="divide-y divide-border">
          {open.map((change) => (
            <li
              key={change.id}
              className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium">{change.description}</p>
                <p className="mt-0.5 text-caption text-text-muted">{titleOf(change.documentId)}</p>
              </div>
              {canResolve && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={resolve.isPending}
                  onClick={() =>
                    resolve.mutate(
                      { projectId, changeId: change.id },
                      {
                        onSuccess: () =>
                          toast.success("Изменение разобрано", {
                            description: "Запись добавлена в историю объекта",
                          }),
                        onError: (error) =>
                          toast.error("Не удалось отметить", { description: error.message }),
                      },
                    )
                  }
                >
                  <Check className="size-4" /> Разобрано
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {resolved.length > 0 && (
        <div className={cn(open.length > 0 && "border-t border-border")}>
          <button
            type="button"
            aria-expanded={showResolved}
            onClick={() => setShowResolved((value) => !value)}
            className="focus-ring flex min-h-11 w-full items-center gap-2 px-4 text-left text-[13px] text-text-secondary hover:text-text-primary lg:min-h-9"
          >
            <ChevronDown
              className={cn("size-4 transition-fast", !showResolved && "-rotate-90")}
              aria-hidden
            />
            Разобранные: {fmtNum(resolved.length)}
          </button>
          {showResolved && (
            <ul className="divide-y divide-border border-t border-border">
              {resolved.map((change) => (
                <li key={change.id} className="px-4 py-2.5">
                  <p className="text-[13px] text-text-secondary">{change.description}</p>
                  <p className="mt-0.5 text-caption text-text-muted">
                    {titleOf(change.documentId)}
                    {change.resolvedAt
                      ? ` · разобрано ${fmtDateTime(change.resolvedAt)}${change.resolvedBy ? `, ${employeeName(change.resolvedBy)}` : ""}`
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
