import { completePageHead } from "@/lib/page-head";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Eye } from "lucide-react";
import { ChatHeader } from "@/components/gas-ops/bot/parts";
import { GasRoleAvatar } from "@/components/gas-ops/shell/GasShell";
import { useGasBrand } from "@/lib/gas-ops/contour";
import { useBack } from "@/lib/ui/tab-stack";
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
  const brand = useGasBrand();
  const back = useBack("/gas/more");
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
        "-mx-gutter -mt-2 flex flex-col",
        // Бригадир: до нижнего края, безопасную зону учитывает лента и поле ответа
        // Высота: экран минус липкий верх (полоса показа) и нижняя панель (ADR-048, 6)
        isForeman
          ? "-mb-[max(16px,env(safe-area-inset-bottom))] h-[calc(100dvh-var(--gas-top-h,0px))]"
          : "-mb-4 h-[calc(100dvh-var(--gas-top-h,0px)-var(--bottom-inset,0px))]",
        // Десктоп: рамка телефона по центру и панель системы справа
        "lg:mx-0 lg:mt-0 lg:mb-0 lg:grid lg:h-auto lg:grid-cols-[390px_minmax(300px,380px)] lg:items-start lg:justify-center lg:gap-10",
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col lg:flex-none">
        {!isForeman ? (
          <p className="text-meta hidden min-h-10 shrink-0 items-center justify-center gap-2 bg-surface-2 px-4 text-text-2 lg:mb-3 lg:flex lg:rounded-full">
            <Eye className="size-4" aria-hidden />
            Так выглядит бот бригадира
          </p>
        ) : null}
        <div
          data-tour="bot"
          className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none bg-void lg:w-[390px] lg:h-[min(780px,calc(100dvh_-_150px))] lg:min-h-[600px] lg:flex-none lg:rounded-[44px] lg:ring-[10px] lg:ring-surface-3"
        >
          <BotChat
            brigadeId={brigadeId}
            speakerName={speakerName}
            employeeId={employeeId}
            isForeman={isForeman}
            allowed={allowed}
            objects={directory.objects}
            bottomInset={show.active}
            /*
              Одна шапка на телефоне (ADR-048, 6): шапка чата и есть шапка экрана. Менеджер
              смотрит бот изнутри «Ещё», поэтому слева «Назад»; бригадиру сверху «Мои записи»
            */
            header={
              <ChatHeader
                note={
                  isForeman
                    ? `бот · ${brand.clientShort}`
                    : `Так выглядит бот бригадира · ${brand.clientShort}`
                }
                leading={
                  isForeman ? null : (
                    <button
                      type="button"
                      onClick={back}
                      aria-label="Назад"
                      className="-ml-2 grid min-h-11 min-w-11 place-items-center rounded-full text-text focus-ring lg:hidden"
                    >
                      <ChevronLeft className="size-6" strokeWidth={1.75} aria-hidden />
                    </button>
                  )
                }
                trailing={
                  <span className="flex shrink-0 items-center gap-1 lg:hidden">
                    {isForeman ? (
                      <Link
                        to="/gas/entries"
                        className="inline-flex min-h-11 items-center rounded-full px-2 text-body-strong text-text focus-ring"
                      >
                        Мои записи
                      </Link>
                    ) : null}
                    <GasRoleAvatar />
                  </span>
                }
              />
            }
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
        <p className="text-meta mt-4 hidden text-center text-text-3 lg:block">
          Так будет выглядеть бот в MAX. Канал не подключён.
        </p>
      </div>

      <div className="hidden lg:block">
        <SystemPanel entryId={lastId} />
      </div>
    </div>
  );
}
