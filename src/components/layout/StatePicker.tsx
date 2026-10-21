import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Check, Layers } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { screenStates, useForcedState } from "@/lib/screen-state";
import { cn } from "@/lib/utils";

/** Переключатель состояний экрана для просмотра макетов: загрузка, пусто, ошибка и так далее. */
export function StatePicker() {
  const forced = useForcedState() ?? "normal";
  const navigate = useNavigate();
  const location = useRouterState({ select: (s) => s.location });
  const current = screenStates.find((item) => item.id === forced);

  const pick = (id: string) => {
    const search = { ...(location.search as Record<string, unknown>) };
    if (id === "normal") delete search["state"];
    else search["state"] = id;
    void navigate({ to: location.pathname, search: search as never, replace: true });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Состояние экрана"
          className={cn(
            "text-meta icon-button focus-ring w-auto gap-2 px-2.5 transition-fast [grid-auto-flow:column]",
            forced !== "normal" && "bg-info-bg text-info hover:bg-info-bg hover:text-info",
          )}
        >
          <Layers strokeWidth={1.5} />
          <span className="hidden xl:inline">{current?.label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 p-1">
        <p className="text-meta-strong px-3 pt-2 pb-1 font-semibold text-text-muted">
          Состояние экрана
        </p>
        {screenStates.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => pick(item.id)}
            className="text-meta flex min-h-12 w-full items-center gap-2 rounded-[var(--r-sm)] px-3 text-left hover:bg-hover lg:min-h-9"
          >
            <span className="flex-1">{item.label}</span>
            {item.id === forced && <Check className="size-4 text-text" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
