import { currentRevisions } from "@/domain/overview";
import { useNavigate } from "@tanstack/react-router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useApp } from "@/lib/app-context";
import { allNavItems, sectionHref } from "@/lib/navigation";
import { useProjectId } from "@/lib/project-scope";
import { useSpecStore } from "@/lib/spec-store";
import { counterpartyName } from "@/lib/directory";

/** Поиск по системе: объекты, разделы, документы, запросы и поставщики — только экраны объекта. */
export function CommandPalette() {
  const { commandOpen, setCommandOpen } = useApp();
  const navigate = useNavigate();
  const projectId = useProjectId();
  const projects = useSpecStore((s) => s.projects);
  const allDocuments = useSpecStore((s) => s.documents);
  const documents = currentRevisions(allDocuments);
  const requests = useSpecStore((s) => s.requests);
  const profiles = useSpecStore((s) => s.profiles);
  const nameOf = (id: string) => projects.find((p) => p.id === id)?.name ?? "";

  const go = (to: string, search?: Record<string, string>) => {
    setCommandOpen(false);
    void navigate({ to, search: (search ?? {}) as never });
  };

  // Поставщики ведутся в закупках объекта: открываем текущий объект, иначе первый с запросами
  const suppliersProject = projectId ?? requests[0]?.projectId ?? projects[0]?.id ?? null;

  return (
    <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
      <CommandInput placeholder="Объекты, документы, запросы, поставщики…" />
      <CommandList>
        <CommandEmpty>
          Ничего не найдено. Попробуйте код объекта, номер запроса или название документа.
        </CommandEmpty>
        <CommandGroup heading="Объекты">
          {projects.map((p) => (
            <CommandItem
              key={p.id}
              value={`объект ${p.name} ${p.code} ${p.contract}`}
              onSelect={() => go(`/projects/${p.id}`)}
            >
              <span className="truncate">{p.name}</span>
              <span className="ml-auto shrink-0 text-caption text-text-muted">{p.code}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading={projectId ? `Разделы · ${nameOf(projectId)}` : "Разделы"}>
          {allNavItems.map((item) => {
            const href = sectionHref(projectId, item.section);
            return (
              <CommandItem
                key={item.key}
                value={`раздел ${item.label}`}
                onSelect={() => go(href.to, href.search as Record<string, string>)}
              >
                <item.icon className="size-4" />
                {item.label}
              </CommandItem>
            );
          })}
        </CommandGroup>
        <CommandGroup heading="Документация">
          {documents.map((d) => (
            <CommandItem
              key={d.id}
              value={`документ ${d.title} ${d.fileName} ${nameOf(d.projectId)}`}
              onSelect={() => go(`/projects/${d.projectId}/documents/${d.id}`)}
            >
              <span className="truncate">{d.title}</span>
              <span className="ml-auto shrink-0 truncate text-caption text-text-muted">
                {nameOf(d.projectId)}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Запросы поставщикам">
          {requests.map((r) => (
            <CommandItem
              key={r.id}
              value={`запрос ${r.number} ${nameOf(r.projectId)}`}
              onSelect={() => go(`/projects/${r.projectId}/procurement/${r.id}`)}
            >
              <span className="truncate">{r.number}</span>
              <span className="ml-auto shrink-0 truncate text-caption text-text-muted">
                {nameOf(r.projectId)}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
        {suppliersProject && (
          <CommandGroup heading="Поставщики">
            {profiles.map((p) => (
              <CommandItem
                key={p.supplierId}
                value={`поставщик ${counterpartyName(p.supplierId)} ${p.contactName} ${p.region}`}
                onSelect={() =>
                  go(`/projects/${suppliersProject}/procurement`, { view: "suppliers" })
                }
              >
                <span className="truncate">{counterpartyName(p.supplierId)}</span>
                <span className="ml-auto shrink-0 text-caption text-text-muted">{p.region}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
