/**
 * Палитра поиска «Монохрома» (ADR-055, раздел 2.6). Индекс строит контур из данных своих
 * портов с правами роли (lib/search), палитра только ищет и рисует: группы результатов,
 * подсветка совпадения, недавние запросы, пустой результат с советом. Своё сопоставление
 * вместо фильтра cmdk: без учёта «ё/е», по началу слов и номерам.
 */
import { useNavigate } from "@tanstack/react-router";
import { Clock } from "lucide-react";
import { useMemo, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { RECENT_KEY, highlight, pushRecent, searchIndex, type SearchItem } from "@/lib/search";

function readRecent(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeRecent(list: string[]) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // Приватный режим: недавние живут до закрытия палитры
  }
}

function Marked({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlight(text, query).map((part, i) =>
        part.hit ? (
          <mark key={i} className="bg-accent-soft text-ink">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

export function SearchPalette({
  open,
  onOpenChange,
  index,
  placeholder,
  hint,
  onAction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  index: readonly SearchItem[];
  placeholder: string;
  /** Совет при пустом результате: что здесь можно найти */
  hint: string;
  onAction?: (action: string) => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>(() =>
    typeof window === "undefined" ? [] : readRecent(),
  );
  const results = useMemo(() => searchIndex(index, query), [index, query]);
  const blank = query.trim() === "";

  const choose = (item: SearchItem) => {
    const next = pushRecent(recent, query);
    setRecent(next);
    writeRecent(next);
    onOpenChange(false);
    setQuery("");
    if (item.action) {
      onAction?.(item.action);
      return;
    }
    if (item.to) void navigate({ to: item.to, search: (item.search ?? {}) as never });
  };

  return (
    <CommandDialog
      shouldFilter={false}
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setQuery("");
      }}
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder={placeholder}
        aria-label="Что найти"
      />
      <CommandList className="max-h-[min(480px,60dvh)]">
        {blank ? (
          <>
            {recent.length ? (
              <CommandGroup heading="Недавние запросы">
                {recent.map((q) => (
                  <CommandItem key={q} value={`recent:${q}`} onSelect={() => setQuery(q)}>
                    <Clock className="size-4 text-ink-3" aria-hidden />
                    {q}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {results.length === 0 ? (
              <CommandGroup heading="Действия">
                {index
                  .filter((item) => item.group === "actions")
                  .map((item) => (
                    <CommandItem key={item.id} value={item.id} onSelect={() => choose(item)}>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate">{item.title}</span>
                        {item.subtitle ? (
                          <span className="truncate text-meta text-ink-3">{item.subtitle}</span>
                        ) : null}
                      </span>
                    </CommandItem>
                  ))}
              </CommandGroup>
            ) : null}
          </>
        ) : (
          <>
            <CommandEmpty>Ничего не найдено. {hint}</CommandEmpty>
            {results.map((group) => (
              <CommandGroup key={group.group} heading={group.label}>
                {group.items.map((item) => (
                  <CommandItem key={item.id} value={item.id} onSelect={() => choose(item)}>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">
                        <Marked text={item.title} query={query} />
                      </span>
                      {item.subtitle ? (
                        <span className="truncate text-meta text-ink-3">
                          <Marked text={item.subtitle} query={query} />
                        </span>
                      ) : null}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
