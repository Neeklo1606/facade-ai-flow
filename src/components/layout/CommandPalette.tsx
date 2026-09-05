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
import { sites } from "@/mock/sites";
import { events } from "@/mock/events";
import { tasks, documents } from "@/mock/tasks";
import { suppliers } from "@/mock/supply";

export function CommandPalette() {
  const { commandOpen, setCommandOpen } = useApp();
  const navigate = useNavigate();

  const go = (to: string) => {
    setCommandOpen(false);
    navigate({ to });
  };

  return (
    <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
      <CommandInput placeholder="Объекты, события, задачи, документы, поставщики…" />
      <CommandList>
        <CommandEmpty>Ничего не найдено. Попробуйте номер заявки или фамилию.</CommandEmpty>
        <CommandGroup heading="Разделы">
          {allNavItems.map((i) => (
            <CommandItem key={i.to} value={`раздел ${i.label}`} onSelect={() => go(i.to)}>
              <i.icon className="size-4" />
              {i.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Объекты">
          {sites.map((s) => (
            <CommandItem key={s.id} value={`объект ${s.name}`} onSelect={() => go("/sites")}>
              {s.name}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="События">
          {events.slice(0, 6).map((e) => (
            <CommandItem key={e.id} value={`событие ${e.preview}`} onSelect={() => go("/inbox")}>
              <span className="truncate">{e.preview}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Задачи">
          {tasks.slice(0, 6).map((t) => (
            <CommandItem key={t.id} value={`задача ${t.title}`} onSelect={() => go("/tasks")}>
              {t.title}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Документы">
          {documents.slice(0, 5).map((d) => (
            <CommandItem key={d.id} value={`документ ${d.name}`} onSelect={() => go("/documents")}>
              {d.name}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Поставщики">
          {suppliers.map((s) => (
            <CommandItem key={s.id} value={`поставщик ${s.name}`} onSelect={() => go("/suppliers")}>
              {s.name}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
