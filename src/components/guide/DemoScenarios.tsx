import { useNavigate } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { useEnterAs } from "@/lib/persona";
import { markRoleChosen, setEntering, startScenario } from "@/lib/guide/store";
import { CANON_PERSONA, scenarioById } from "@/lib/guide/scenarios";
import { record } from "@/lib/guide/telemetry";
import { cn } from "@/lib/utils";

/**
 * Три сценария канона ГАЙКИ (ADR-038). Жили на экране входа `/`, с ADR-047 стоят вторым
 * блоком на `/demo`. Поведение то же: плитка ставит роль первого шага, сценарий канона
 * и открывает его стартовый экран.
 */
export const CANON_TILES = [
  { id: "canon-shift", title: "Смена → учёт", hint: "Прораб говорит, гайка раскладывает" },
  { id: "canon-document", title: "ПТО → документ", hint: "Проверка, сводка и черновик ведомости" },
  { id: "canon-supply", title: "Объект → снабжение", hint: "Заявка на материал и решение" },
] as const;

export function useStartCanonScenario() {
  const navigate = useNavigate();
  const enterAs = useEnterAs();
  return (scenarioId: string) => {
    const scenario = scenarioById(scenarioId);
    const first = scenario?.steps[0];
    const role = first?.role ?? "foreman";
    const persona = CANON_PERSONA[role];
    if (!scenario || !persona) return;
    setEntering(true);
    record({ t: "role", role, personaId: persona });
    startScenario(scenario.id);
    markRoleChosen();
    const projectId = "p-korona";
    void enterAs(persona, role)
      .then((home) => navigate({ to: first?.to ? first.to(projectId) : home }))
      .finally(() => setEntering(false));
  };
}

/** Строки сценариев 64: номер, название, что происходит, минута */
export function DemoScenarioList({ className }: { className?: string }) {
  const start = useStartCanonScenario();
  return (
    <ul
      className={cn(
        "overflow-hidden rounded-2xl bg-surface ring-1 ring-line [&>li+li]:border-t [&>li+li]:border-line",
        className,
      )}
    >
      {CANON_TILES.map((tile, index) => (
        <li key={tile.id}>
          {/*
            Ссылка, а не кнопка: касание до загрузки скриптов тоже работает. Оно открывает
            /demo?scenario=…, и страница запускает сценарий сама (находка CI на 430, L10)
          */}
          <a
            href={`/demo?scenario=${tile.id}`}
            onClick={(event) => {
              event.preventDefault();
              start(tile.id);
            }}
            className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-100 focus-ring active:bg-surface-2 is-hover:bg-surface-2 lg:px-5"
          >
            <span
              aria-hidden
              className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-meta-strong text-text-2 tnum"
            >
              {index + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-heading text-text">{tile.title}</span>
              <span className="mt-0.5 block text-meta text-text-3">
                {tile.hint} · <span>1 минута</span>
              </span>
            </span>
            <ArrowUpRight className="size-5 shrink-0 text-text-3" aria-hidden />
          </a>
        </li>
      ))}
    </ul>
  );
}
