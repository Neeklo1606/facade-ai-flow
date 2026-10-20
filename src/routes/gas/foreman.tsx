import { completePageHead } from "@/lib/page-head";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Eye } from "lucide-react";
import { BotChat } from "@/components/gas-ops/bot/BotChat";
import { SystemPanel } from "@/components/gas-ops/bot/SystemPanel";
import {
  useGasActor,
  useGasAllowedObjects,
  useGasDayObjects,
  useGasDirectory,
  useGasEntries,
  useGasEmployees,
  useGasWeek,
  type WorkObject,
} from "@/api/gas-ops";
import { gasTitle } from "@/lib/gas-ops/brand";
import { useGasShow } from "@/lib/gas-ops/show";
import { cn } from "@/lib/utils";

/**
 * Экран бригадира как бот MAX (ADR-044, F4).
 *
 * Только то, что умеет бот: сообщения, inline-кнопки, ответ сообщением. Бригадир вводит
 * время, а не суммы: сумму и доходность ему не показываем. Канал MAX не подключён, это
 * подписано в ленте и под рамкой телефона.
 *
 * Менеджер и администратор видят тот же бот за Бригадира 1 с пометкой сверху.
 */
export const Route = createFileRoute("/gas/foreman")({
  head: () =>
    completePageHead(
      { meta: [{ title: gasTitle("Бот бригадира") }] },
      gasTitle("Бот бригадира"),
      "Диалог бота MAX: объект, день, начало, окончание, перерыв.",
    ),
  component: ForemanPage,
});

/** Бригада, за которую смотрят бот менеджер и администратор */
const VIEW_BRIGADE = "brg-1";
const LAST_KEY = "neeklo-gas-bot-last";

function readLast(): string | null {
  try {
    return sessionStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

function ForemanPage() {
  const actor = useGasActor();
  const week = useGasWeek();
  const directory = useGasDirectory();
  const employees = useGasEmployees();
  const show = useGasShow();
  const isForeman = actor.role === "foreman";
  const brigadeId = actor.brigadeId ?? VIEW_BRIGADE;
  const brigade = directory.brigades.find((b) => b.id === brigadeId);
  const speakerName = isForeman ? actor.name : (brigade?.leadName ?? "Бригадир");
  const employeeId = isForeman
    ? actor.employeeId
    : (employees.find((e) => e.isLead && e.name === brigade?.leadName)?.id ?? null);

  /*
   * Разрешённые объекты. Бригадиру их отдаёт порт. Менеджер смотрит «глазами» бригадира:
   * то же правило, что в домене, — где бригада работала или куда назначена.
   */
  const ownAllowed = useGasAllowedObjects();
  const assigned = useGasDayObjects(brigadeId, week.today);
  const brigadeEntries = useGasEntries({ brigadeId });
  const allowed = useMemo<WorkObject[]>(() => {
    if (isForeman) return ownAllowed;
    const ids = new Set([
      ...assigned.map((o) => o.id),
      ...brigadeEntries.map((v) => v.entry.objectId),
    ]);
    return directory.objects.filter((o) => ids.has(o.id));
  }, [isForeman, ownAllowed, assigned, brigadeEntries, directory.objects]);

  // Последняя отправленная запись: панель справа ведёт её по цепочке и после перехода
  const [lastId, setLastId] = useState<string | null>(null);
  const chainId = show.state.chain.gasEntryId ?? null;
  useEffect(() => {
    setLastId((id) => id ?? readLast() ?? chainId);
  }, [chainId]);

  return (
    <div
      className={cn(
        // Телефон и планшет: диалог во весь экран под шапкой контура
        "-mx-4 -mt-4 flex flex-col sm:-mx-6",
        // Бригадир: до нижнего края, безопасную зону учитывает лента и поле ответа
        isForeman
          ? "-mb-[max(16px,env(safe-area-inset-bottom))] h-[calc(100dvh_-_56px)]"
          : "h-[calc(100dvh_-_56px_-_96px_-_env(safe-area-inset-bottom))]",
        // Десктоп: рамка телефона по центру и панель системы справа
        "lg:mx-0 lg:mt-0 lg:mb-0 lg:grid lg:h-auto lg:grid-cols-[390px_minmax(300px,380px)] lg:items-start lg:justify-center lg:gap-10",
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col lg:flex-none">
        {!isForeman ? (
          <p className="flex min-h-10 shrink-0 items-center justify-center gap-2 bg-surface-2 px-4 text-[13px] text-text-2 lg:mb-3 lg:rounded-full">
            <Eye className="size-4" aria-hidden />
            Так выглядит бот бригадира
          </p>
        ) : null}
        <div
          data-tour="bot"
          className="hero-field flex min-h-0 flex-1 flex-col rounded-none lg:h-[min(780px,calc(100dvh_-_150px))] lg:min-h-[600px] lg:flex-none lg:rounded-[44px] lg:shadow-[0_24px_64px_rgba(0,0,0,0.22)] lg:ring-[10px] lg:ring-surface-3"
        >
          <BotChat
            brigadeId={brigadeId}
            speakerName={speakerName}
            employeeId={employeeId}
            isForeman={isForeman}
            allowed={allowed}
            objects={directory.objects}
            bottomInset={show.active}
            onSubmitted={(entry) => {
              setLastId(entry.id);
              try {
                sessionStorage.setItem(LAST_KEY, entry.id);
              } catch {
                // Приватный режим: панель покажет запись до перехода
              }
            }}
          />
        </div>
        <p className="mt-4 hidden text-center text-[13px] text-text-3 lg:block">
          Так будет выглядеть бот в MAX. Канал не подключён.
        </p>
      </div>

      <div className="hidden lg:block">
        <SystemPanel entryId={lastId} />
      </div>
    </div>
  );
}
