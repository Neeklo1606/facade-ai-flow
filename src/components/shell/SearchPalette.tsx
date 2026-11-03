/**
 * Палитра поиска «Монохрома» (ADR-055, раздел 2.6). Индекс строит контур из данных своих
 * портов с правами роли (lib/search), палитра только ищет и рисует: группы результатов,
 * подсветка совпадения, недавние запросы, пустой результат с советом. Своё сопоставление
 * вместо фильтра cmdk: без учёта «ё/е», по началу слов и номерам.
 */
import { useNavigate } from "@tanstack/react-router";
import { Clock, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Command,
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
          // Цвет текста строки: на выбранной (чёрной) строке совпадение остаётся видимым
          <mark key={i} className="bg-current/15 text-inherit">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

/** Запрос, недавние и выбор результата: общие для окна и поля в шапке */
function useSearch(
  index: readonly SearchItem[],
  close: () => void,
  onAction?: (action: string) => void,
) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>(() =>
    typeof window === "undefined" ? [] : readRecent(),
  );
  const results = useMemo(() => searchIndex(index, query), [index, query]);

  const choose = (item: SearchItem) => {
    const next = pushRecent(recent, query);
    setRecent(next);
    writeRecent(next);
    close();
    setQuery("");
    if (item.action) {
      onAction?.(item.action);
      return;
    }
    if (item.to) void navigate({ to: item.to, search: (item.search ?? {}) as never });
  };
  return { query, setQuery, recent, results, choose };
}

/** Группы результатов: недавние и действия на пустом запросе, иначе найденное */
function SearchResults({
  index,
  hint,
  state,
  className,
}: {
  index: readonly SearchItem[];
  hint: string;
  state: ReturnType<typeof useSearch>;
  className?: string;
}) {
  const { query, setQuery, recent, results, choose } = state;
  const blank = query.trim() === "";
  return (
    <CommandList className={className ?? "max-h-[min(480px,60dvh)]"}>
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
  const state = useSearch(index, () => onOpenChange(false), onAction);
  return (
    <CommandDialog
      shouldFilter={false}
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) state.setQuery("");
      }}
    >
      <CommandInput
        value={state.query}
        onValueChange={state.setQuery}
        placeholder={placeholder}
        aria-label="Что найти"
      />
      <SearchResults index={index} hint={hint} state={state} />
    </CommandDialog>
  );
}

/**
 * Поиск в верхней строке компьютера (ADR-061, 2.2): иконка раскрывается в поле 360,
 * результаты группами выпадают под полем. Escape и щелчок мимо сворачивают поле
 */
export function SearchField({
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
  hint: string;
  onAction?: (action: string) => void;
}) {
  const close = () => {
    onOpenChange(false);
    state.setQuery("");
  };
  const state = useSearch(index, close, onAction);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
    // close меняется на каждом рендере, подписка нужна только на открытие
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) {
    return (
      <button
        type="button"
        aria-label="Поиск, ⌘K"
        title="Поиск, ⌘K"
        onClick={() => onOpenChange(true)}
        className="gas-icon-button focus-ring"
      >
        <Search strokeWidth={1.75} aria-hidden />
      </button>
    );
  }
  return (
    <div ref={boxRef} role="search" aria-label="Поиск в системе" className="relative w-[360px]">
      <Command
        shouldFilter={false}
        onKeyDown={(event) => {
          if (event.key === "Escape") close();
        }}
        className="overflow-visible bg-transparent"
      >
        <CommandInput
          autoFocus
          value={state.query}
          onValueChange={state.setQuery}
          placeholder={placeholder}
          aria-label="Что найти"
          wrapperClassName="h-10 rounded-control border border-line bg-panel-2 px-3"
          className="h-10 py-0"
        />
        <div className="absolute inset-x-0 top-12 z-50 overflow-hidden rounded-inset bg-card p-1 shadow-floating ring-1 ring-line">
          <SearchResults
            index={index}
            hint={hint}
            state={state}
            className="max-h-[min(480px,70dvh)]"
          />
        </div>
      </Command>
    </div>
  );
}
