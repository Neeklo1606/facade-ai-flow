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
import { allNavItems } from "@/lib/navigation";
import {
  counterparties,
  documents,
  materials,
  projectName,
  projects,
  supplyRequests,
} from "@/mock/repository";

export function CommandPalette() {
  const { commandOpen, setCommandOpen } = useApp();
  const navigate = useNavigate();

  const go = (to: string) => {
    setCommandOpen(false);
    navigate({ to });
  };

  const openProject = (id: string) => {
    setCommandOpen(false);
    navigate({ to: "/projects/$id", params: { id } });
  };

  return (
    <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
      <CommandInput placeholder="Объекты, документы, материалы, запросы, поставщики…" />
      <CommandList>
        <CommandEmpty>
          Ничего не найдено. Попробуйте код объекта, номер запроса или название материала.
        </CommandEmpty>
        <CommandGroup heading="Объекты">
          {projects.map((p) => (
            <CommandItem
              key={p.id}
              value={`объект ${p.name} ${p.code} ${p.contract}`}
              onSelect={() => openProject(p.id)}
            >
              <span className="truncate">{p.name}</span>
              <span className="ml-auto shrink-0 text-caption text-text-muted">{p.code}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Разделы">
          {allNavItems.map((i) => (
            <CommandItem key={i.to} value={`раздел ${i.label}`} onSelect={() => go(i.to)}>
              <i.icon className="size-4" />
              {i.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Документация">
          {documents.map((d) => (
            <CommandItem
              key={d.id}
              value={`документ ${d.name} ${projectName(d.projectId)}`}
              onSelect={() => go("/documents")}
            >
              <span className="truncate">{d.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Материалы">
          {materials.map((m) => (
            <CommandItem
              key={m.id}
              value={`материал ${m.name} ${m.category}`}
              onSelect={() => go("/materials")}
            >
              <span className="truncate">{m.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Запросы поставщикам">
          {supplyRequests.map((r) => (
            <CommandItem
              key={r.id}
              value={`запрос ${r.number} ${projectName(r.projectId)}`}
              onSelect={() => go("/requests")}
            >
              <span className="truncate">{r.number}</span>
              <span className="ml-auto shrink-0 truncate text-caption text-text-muted">
                {projectName(r.projectId)}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Поставщики">
          {counterparties
            .filter((c) => c.role === "supplier")
            .map((s) => (
              <CommandItem
                key={s.id}
                value={`поставщик ${s.name}`}
                onSelect={() => go("/suppliers")}
              >
                {s.name}
              </CommandItem>
            ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
