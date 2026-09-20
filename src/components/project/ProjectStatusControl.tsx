import { ChevronDown } from "lucide-react";
import { projectStatusTransitions, type Project, type ProjectStatus } from "@/contracts";
import { useAccess } from "@/api/access";
import { useSetProjectStatus } from "@/api/mutations";
import { StatusBadge, type Tone } from "@/components/common/StatusBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { projectStatusMeta } from "@/lib/project-meta";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const textTone: Record<Tone, string> = {
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
  info: "text-info",
  neutral: "text-text-2",
  accent: "text-text",
};

/**
 * Статус объекта в шапке карточки (ADR-015, п. 7). С правом записи в «Объекты» — меню
 * разрешённых переходов, смена попадает в историю; без права и у завершённого — просто статус.
 * `variant`: подпись шапки на компьютере или значок над метриками на телефоне.
 */
export function ProjectStatusControl({
  project,
  variant,
}: {
  project: Project;
  variant: "caption" | "badge";
}) {
  const { canProject } = useAccess();
  const setStatus = useSetProjectStatus();
  const meta = projectStatusMeta[project.status];
  const next: readonly ProjectStatus[] = projectStatusTransitions[project.status];
  const plain =
    variant === "badge" ? (
      <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
    ) : (
      <span className={textTone[meta.tone]}>{meta.label}</span>
    );
  if (!canProject("projects", project.id, "write") || next.length === 0) return plain;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Статус объекта: ${meta.label}. Изменить`}
          disabled={setStatus.isPending}
          className={cn(
            "focus-ring inline-flex min-h-11 items-center gap-1 rounded-[var(--r-xs)] underline-offset-2 hover:underline lg:min-h-0",
            textTone[meta.tone],
          )}
        >
          {variant === "badge" ? (
            <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
          ) : (
            meta.label
          )}
          <ChevronDown className="size-3.5" strokeWidth={1.75} aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[220px]">
        <DropdownMenuLabel className="text-[12px] font-normal text-text-3">
          Сменить статус объекта
        </DropdownMenuLabel>
        {next.map((status) => (
          <DropdownMenuItem
            key={status}
            onSelect={() =>
              setStatus.mutate(
                { projectId: project.id, status },
                {
                  onSuccess: () =>
                    toast.success(`Статус объекта: «${projectStatusMeta[status].label}»`, {
                      description: "Запись добавлена в историю объекта",
                    }),
                  onError: (error) =>
                    toast.error("Статус не изменён", { description: error.message }),
                },
              )
            }
          >
            {projectStatusMeta[status].label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
