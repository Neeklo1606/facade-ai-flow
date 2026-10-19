import { completePageHead } from "@/lib/page-head";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Check, Clock, Plus, Search, Smartphone } from "lucide-react";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EntryStatusBadge, SourceMark } from "@/components/gas-ops/marks";
import { Button } from "@/components/ui/button";
import {
  fmtHours,
  formatClock,
  previewMinutes,
  useGasActions,
  useGasActor,
  useGasAllowedObjects,
  useGasDirectory,
  useGasMyEntries,
  useGasWeek,
} from "@/api/gas-ops";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Экран бригадира: тот же сценарий, что будет в боте MAX (ТЗ, п. 5).
 *
 * Правила экрана:
 * - бригадир не вводит суммы и виды работ, он вводит только время;
 * - объекты только разрешённые ему, выбор из списка, а не свободный текст;
 * - рассчитанные минуты показываются до подтверждения, а не после;
 * - номер записи и статус приходят сразу после отправки;
 * - на несколько адресов за день заводится отдельная запись на каждый.
 *
 * Канал MAX не подключён. Экран честно подписан как вид бота, а не как работающий бот.
 */
export const Route = createFileRoute("/gas/foreman")({
  head: () =>
    completePageHead(
      { meta: [{ title: "Бригадир: ввод времени — гайка" }] },
      "Бригадир: ввод времени — гайка",
      "Сценарий бота: объект, дата, начало, окончание, перерыв.",
    ),
  component: ForemanPage,
});

type Step = "home" | "object" | "date" | "time" | "check" | "done";

const BREAKS = [0, 30, 45, 60, 90];

function ForemanPage() {
  const actor = useGasActor();
  const actions = useGasActions();
  const week = useGasWeek();
  const directory = useGasDirectory();

  const [step, setStep] = useState<Step>("home");
  const [objectId, setObjectId] = useState<string | null>(null);
  const [day, setDay] = useState(week.today);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [breaks, setBreaks] = useState(60);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ number: string; minutes: number } | null>(null);

  const brigadeId = actor.brigadeId ?? "brg-1";
  const objects = useGasAllowedObjects();
  const history = useGasMyEntries().slice(0, 8);
  const object = objects.find((o) => o.id === objectId) ?? null;
  const brigade = directory.brigades.find((b) => b.id === brigadeId);
  const brigadeName = brigade?.name ?? "Бригада";
  /*
   * В шапке «диалога» стоит бригадир этой бригады, а не тот, кто открыл экран: менеджер
   * и администратор смотрят на тот же экран, что увидит бригадир в боте.
   */
  const speakerName = actor.role === "foreman" ? actor.name : (brigade?.leadName ?? "Бригадир");

  const minutes = useMemo(() => previewMinutes(start, end, breaks), [start, end, breaks]);
  const yesterday = week.yesterday;

  const reset = () => {
    setObjectId(null);
    setDay(week.today);
    setStart("");
    setEnd("");
    setBreaks(60);
    setError(null);
    setSearch("");
  };

  const send = async () => {
    if (!objectId) return;
    const result = await actions.createEntry({
      day,
      brigadeId,
      employeeId: actor.employeeId,
      objectId,
      start,
      end,
      breakMinutes: breaks,
      submit: true,
    });
    if (!result.ok) {
      setError(result.message);
      setStep("check");
      return;
    }
    setCreated({ number: result.value.number, minutes: result.value.minutes });
    setError(null);
    setStep("done");
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[390px_minmax(0,1fr)]">
      <div>
        <p className="mb-3 flex flex-wrap items-center gap-2 text-[13px] text-text-3">
          <Smartphone className="size-4" aria-hidden />
          Так выглядит в боте MAX.
          <StatusBadge tone="warn">Канал не подключён</StatusBadge>
        </p>

        <div className="rounded-[var(--r-lg)] border border-line bg-surface p-4">
          {/* Шапка «диалога»: кто вошёл и какая бригада */}
          <div className="flex items-center gap-3 border-b border-line pb-3">
            <span className="grid size-10 place-items-center rounded-full bg-orange-dim text-[13px] font-medium text-orange-hot">
              {brigadeId.replace("brg-", "Б")}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-medium">{speakerName}</p>
              <p className="text-[13px] text-text-3">{brigadeName}</p>
            </div>
          </div>

          {step !== "home" && step !== "done" && (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep(
                  step === "object"
                    ? "home"
                    : step === "date"
                      ? "object"
                      : step === "time"
                        ? "date"
                        : "time",
                );
              }}
              className="mt-3 inline-flex min-h-12 items-center gap-2 text-[13px] text-text-2 focus-ring"
            >
              <ArrowLeft className="size-4" aria-hidden />
              Назад
            </button>
          )}

          {step === "home" && (
            <div className="mt-4 flex flex-col gap-3">
              <p className="text-[15px]">
                Добрый день. Внесите время по объекту за смену. Сумму и виды работ вводить не нужно.
              </p>
              <Button
                className="min-h-14 w-full text-[15px]"
                onClick={() => {
                  reset();
                  setStep("object");
                }}
              >
                <Plus className="size-5" aria-hidden />
                Внести время
              </Button>
              <p className="text-[13px] text-text-3">
                Если за день было несколько адресов, заведите запись на каждый.
              </p>
            </div>
          )}

          {step === "object" && (
            <div className="mt-4 flex flex-col gap-3">
              <p className="text-[15px]">Выберите объект</p>
              <label className="relative block">
                <Search
                  className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-text-3"
                  aria-hidden
                />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Населённый пункт или вид работ"
                  aria-label="Поиск объекта"
                  className="h-12 w-full rounded-[var(--r-sm)] border border-line bg-surface ps-9 pe-3 text-[15px] focus-ring"
                />
              </label>
              <ul className="flex max-h-[320px] flex-col gap-2 overflow-y-auto">
                {objects
                  .filter((o) => o.label.toLowerCase().includes(search.trim().toLowerCase()))
                  .slice(0, 40)
                  .map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setObjectId(item.id);
                          setStep("date");
                        }}
                        className="min-h-12 w-full rounded-[var(--r-sm)] border border-line px-3 py-2 text-start text-[13px] transition-fast hover:border-line-2 focus-ring"
                      >
                        <span className="block">{item.label}</span>
                        <span className="mt-0.5 block text-text-3">
                          {item.code}
                          {item.workType ? ` · ${item.workType}` : ""}
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
              <p className="text-[13px] text-text-3">
                В списке только объекты, закреплённые за вашей бригадой.
              </p>
            </div>
          )}

          {step === "date" && (
            <div className="mt-4 flex flex-col gap-3">
              <p className="text-[15px]">За какой день</p>
              <Button
                variant={day === week.today ? "default" : "outline"}
                className="min-h-14 w-full justify-start text-[15px]"
                onClick={() => {
                  setDay(week.today);
                  setStep("time");
                }}
              >
                Сегодня, {fmtDate(week.today)}
              </Button>
              <Button
                variant={day === yesterday ? "default" : "outline"}
                className="min-h-14 w-full justify-start text-[15px]"
                onClick={() => {
                  setDay(yesterday);
                  setStep("time");
                }}
              >
                Вчера, {fmtDate(yesterday)}
              </Button>
              <p className="flex items-start gap-2 text-[13px] text-warn">
                <StatusBadge tone="warn">Требует согласования</StatusBadge>
                <span className="text-text-2">
                  Можно ли вносить время за вчера и до какого часа — открытый вопрос ТЗ.
                </span>
              </p>
            </div>
          )}

          {step === "time" && (
            <div className="mt-4 flex flex-col gap-4">
              <p className="text-[15px]">Время смены на объекте</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-[13px] text-text-2">
                  Начало
                  <input
                    value={start}
                    onChange={(event) => setStart(event.target.value)}
                    inputMode="numeric"
                    placeholder="8:20"
                    className="mt-1 h-14 w-full rounded-[var(--r-sm)] border border-line bg-surface px-3 text-[17px] tabular-nums focus-ring"
                  />
                </label>
                <label className="text-[13px] text-text-2">
                  Окончание
                  <input
                    value={end}
                    onChange={(event) => setEnd(event.target.value)}
                    inputMode="numeric"
                    placeholder="16:40"
                    className="mt-1 h-14 w-full rounded-[var(--r-sm)] border border-line bg-surface px-3 text-[17px] tabular-nums focus-ring"
                  />
                </label>
              </div>
              <div>
                <p className="text-[13px] text-text-2">Перерыв, минут</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {BREAKS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setBreaks(value)}
                      className={cn(
                        "min-h-12 min-w-12 rounded-full px-4 text-[15px] tabular-nums transition-fast focus-ring",
                        breaks === value
                          ? "bg-primary text-primary-foreground"
                          : "border border-line text-text-2",
                      )}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-[var(--r-sm)] bg-surface-2 p-3 text-[13px]">
                {minutes.ok ? (
                  <p className="text-text">
                    Эффективное время:{" "}
                    <span className="font-medium tabular-nums">{minutes.minutes} мин</span> ={" "}
                    <span className="tabular-nums">{fmtHours(minutes.minutes / 60)}</span>
                    <span className="block text-text-3">
                      {formatClock(minutes.startMinutes)} — {formatClock(minutes.endMinutes)},
                      перерыв {minutes.breakMinutes} мин
                    </span>
                  </p>
                ) : (
                  <p className="text-text-3">
                    Введите начало и окончание — система посчитает минуты и покажет их здесь.
                  </p>
                )}
              </div>

              <Button
                className="min-h-14 w-full text-[15px]"
                disabled={!minutes.ok}
                onClick={() => {
                  setError(null);
                  setStep("check");
                }}
              >
                Дальше
              </Button>
            </div>
          )}

          {step === "check" && (
            <div className="mt-4 flex flex-col gap-3">
              <p className="text-[15px]">Проверьте запись</p>
              <dl className="rounded-[var(--r-sm)] bg-surface-2 p-3 text-[13px]">
                <div className="flex justify-between gap-3 py-1">
                  <dt className="text-text-3">Объект</dt>
                  <dd className="text-end">{object?.label ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-3 py-1">
                  <dt className="text-text-3">Дата</dt>
                  <dd className="tabular-nums">{fmtDate(day)}</dd>
                </div>
                <div className="flex justify-between gap-3 py-1">
                  <dt className="text-text-3">Смена</dt>
                  <dd className="tabular-nums">
                    {start} — {end}, перерыв {breaks} мин
                  </dd>
                </div>
                <div className="flex justify-between gap-3 py-1">
                  <dt className="text-text-3">Эффективное время</dt>
                  <dd className="font-medium tabular-nums">
                    {minutes.ok
                      ? `${minutes.minutes} мин = ${fmtHours(minutes.minutes / 60)}`
                      : "—"}
                  </dd>
                </div>
              </dl>

              {error && (
                <p className="rounded-[var(--r-sm)] border border-danger/40 bg-danger-bg p-3 text-[13px] text-danger">
                  {error}
                </p>
              )}

              <Button className="min-h-14 w-full text-[15px]" onClick={() => void send()}>
                <Check className="size-5" aria-hidden />
                Подтвердить и отправить
              </Button>
              <p className="text-[13px] text-text-3">
                После отправки запись уходит на проверку менеджеру. До проверки её можно исправить.
              </p>
            </div>
          )}

          {step === "done" && created && (
            <div className="mt-4 flex flex-col gap-3">
              <p className="text-[15px] font-medium">Запись принята</p>
              <div className="rounded-[var(--r-sm)] bg-ok-bg p-3 text-[13px]">
                <p className="text-[15px] font-medium tabular-nums">{created.number}</p>
                <p className="mt-1 text-text-2">
                  {object?.label} · {fmtDate(day)} ·{" "}
                  <span className="tabular-nums">
                    {created.minutes} мин = {fmtHours(created.minutes / 60)}
                  </span>
                </p>
                <p className="mt-2">
                  <EntryStatusBadge status="pending" />
                </p>
              </div>
              <Button
                className="min-h-14 w-full text-[15px]"
                onClick={() => {
                  reset();
                  setStep("object");
                }}
              >
                Внести ещё один адрес
              </Button>
              <Button
                variant="ghost"
                className="min-h-12 w-full"
                onClick={() => {
                  reset();
                  setStep("home");
                }}
              >
                В начало
              </Button>
            </div>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-section-title">Мои записи</h2>
        <p className="mt-1 text-[13px] text-text-3">
          История бригады: что отправлено, что проверено, что вернули. До проверки запись можно
          исправить.
        </p>
        <ul className="mt-4 flex flex-col gap-2">
          {history.map((view) => (
            <li
              key={view.entry.id}
              className="rounded-[var(--r-md)] border border-line bg-surface p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-medium tabular-nums">{view.entry.number}</span>
                <EntryStatusBadge status={view.entry.status} />
                <SourceMark source={view.entry.source} />
                <span className="ms-auto text-[13px] text-text-3 tabular-nums">
                  {fmtDate(view.entry.day)}
                </span>
              </div>
              <p className="mt-2 text-[13px]">{view.object?.label ?? "—"}</p>
              <p className="mt-1 flex items-center gap-2 text-[13px] text-text-3">
                <Clock className="size-4" aria-hidden />
                <span className="tabular-nums">
                  {view.entry.startMinutes !== null && view.entry.endMinutes !== null
                    ? `${formatClock(view.entry.startMinutes)} — ${formatClock(view.entry.endMinutes)}, `
                    : ""}
                  {view.entry.minutes} мин = {fmtHours(view.hours)}
                </span>
              </p>
              {view.entry.comment && (
                <p className="mt-2 rounded-[var(--r-sm)] bg-surface-2 p-2 text-[13px] text-text-2">
                  {view.entry.comment}
                </p>
              )}
              {(view.entry.status === "draft" || view.entry.status === "clarify") && (
                <SubmitDraft entryId={view.entry.id} />
              )}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[13px] text-text-3">
          Сумма начисления и доходность бригадиру не показываются: он вводит только время.
        </p>
      </div>
    </div>
  );
}

/** Черновик и возврат на уточнение бригадир отправляет сам */
function SubmitDraft({ entryId }: { entryId: string }) {
  const actions = useGasActions();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-3">
      <Button
        size="sm"
        variant="outline"
        className="min-h-12"
        onClick={() => {
          void actions.submitEntry(entryId).then((result) => {
            setError(result.ok ? null : result.message);
          });
        }}
      >
        Отправить на проверку
      </Button>
      {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
    </div>
  );
}
