import { completePageHead } from "@/lib/page-head";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check, ClipboardCheck, MessageCircleQuestion, Pencil, X } from "lucide-react";
import { PillTabs } from "@/components/common/PillTabs";
import { WidgetCard, WidgetCardHeader } from "@/components/common/WidgetCard";
import { EmptyState } from "@/components/common/EmptyState";
import { EntryStatusBadge, FlagList, SourceMark } from "@/components/gas-ops/marks";
import { EntryDetails } from "@/components/gas-ops/EntryDetails";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ENTRY_STATUS_LABEL,
  fmtHours,
  formatClock,
  useGasActions,
  useGasActor,
  useGasEntry,
  useGasQueue,
  useGasQueueCounts,
  type EntryStatus,
} from "@/api/gas-ops";
import { fmtDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/**
 * Очередь проверки (ТЗ, п. 8). Менеджер видит, что ввёл бригадир, что из этого посчитала
 * система и почему запись помечена. Решение всегда с причиной, кроме подтверждения.
 */
export const Route = createFileRoute("/gas/moderation")({
  head: () =>
    completePageHead(
      { meta: [{ title: "Проверка записей времени — гайка" }] },
      "Проверка записей времени — гайка",
      "Очередь проверки: подтвердить, исправить, отклонить или уточнить.",
    ),
  component: ModerationPage,
});

type Tab = EntryStatus | "all";

function ModerationPage() {
  const actor = useGasActor();
  const actions = useGasActions();
  const [tab, setTab] = useState<Tab>("pending");
  const [selected, setSelected] = useState<string | null>(null);
  const [comment, setComment] = useState("");

  const counts = useGasQueueCounts();
  const rows = useGasQueue(tab);
  const current = rows.find((row) => row.entry.id === selected) ?? rows[0] ?? null;

  if (!actor.canReview) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="Проверку ведёт менеджер"
        description="Войдите как менеджер проверки или администратор, чтобы работать с очередью."
      />
    );
  }

  const decide = async (action: "confirm" | "reject" | "clarify") => {
    if (!current) return;
    const result = await actions.review({
      id: current.entry.id,
      action,
      comment: comment.trim() || undefined,
    });
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    const titles: Record<typeof action, string> = {
      confirm: "Запись подтверждена",
      reject: "Запись отклонена",
      clarify: "Отправлено на уточнение",
    };
    toast.success(titles[action], {
      description: `${current.entry.number}, ${current.object?.label ?? ""}`,
    });
    setComment("");
    setSelected(null);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <div className="-mx-1 overflow-x-auto px-1">
          <PillTabs
            label="Статус записи"
            variant="primary"
            value={tab}
            onChange={(value) => {
              setTab(value);
              setSelected(null);
            }}
            tabs={[
              { value: "pending", label: ENTRY_STATUS_LABEL.pending, count: counts.pending },
              { value: "clarify", label: ENTRY_STATUS_LABEL.clarify, count: counts.clarify },
              { value: "draft", label: ENTRY_STATUS_LABEL.draft, count: counts.draft },
              { value: "rejected", label: ENTRY_STATUS_LABEL.rejected, count: counts.rejected },
              {
                value: "all",
                label: "Все",
                count: counts.pending + counts.clarify + counts.draft + counts.rejected,
              },
            ]}
          />
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title="Здесь пусто"
            description="В этом состоянии записей нет. Переключите вкладку, чтобы увидеть остальные."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((row) => {
              const active = current?.entry.id === row.entry.id;
              return (
                <li key={row.entry.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(row.entry.id);
                      setComment("");
                    }}
                    className={cn(
                      "w-full rounded-[var(--r-md)] border p-4 text-left transition-fast focus-ring",
                      active
                        ? "border-primary bg-surface-2"
                        : "border-line bg-surface hover:border-line-2",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-medium tabular-nums">
                        {row.entry.number}
                      </span>
                      <EntryStatusBadge status={row.entry.status} />
                      <SourceMark source={row.entry.source} />
                      <span className="ms-auto text-[13px] text-text-3 tabular-nums">
                        {fmtDate(row.entry.day)}
                      </span>
                    </div>
                    <p className="mt-2 text-[13px] text-text">
                      {row.object?.label ?? "Объект не указан"}
                    </p>
                    <p className="mt-1 text-[13px] text-text-3">
                      {row.brigade?.name ?? "—"}
                      {row.employee ? ` · ${row.employee.name}` : ""} ·{" "}
                      <span className="tabular-nums">{fmtHours(row.hours)}</span>
                    </p>
                    <FlagList flags={row.flags} className="mt-2" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        {current ? (
          <WidgetCard>
            <WidgetCardHeader
              icon={ClipboardCheck}
              title={`Запись ${current.entry.number}`}
              hint={`${current.brigade?.name ?? ""} · ${fmtDate(current.entry.day)}`}
              level={2}
              aside={<EntryStatusBadge status={current.entry.status} />}
            />

            <div className="mt-4">
              <EntryDetails view={current} />
            </div>

            <div className="mt-6 border-t border-line pt-4">
              <label className="block text-[13px] text-text-2" htmlFor="review-comment">
                Комментарий. Обязателен для отклонения, уточнения и исправления
              </label>
              <Textarea
                id="review-comment"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Что именно не так и что нужно сделать"
                className="mt-2 min-h-[84px]"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={() => void decide("confirm")} className="min-h-12">
                  <Check className="size-4" aria-hidden />
                  Подтвердить
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void decide("clarify")}
                  className="min-h-12"
                >
                  <MessageCircleQuestion className="size-4" aria-hidden />
                  На уточнение
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void decide("reject")}
                  className="min-h-12 text-danger"
                >
                  <X className="size-4" aria-hidden />
                  Отклонить
                </Button>
                <CorrectAction entryId={current.entry.id} />
              </div>
              <p className="mt-3 text-[13px] text-text-3">
                Подтверждение переносит запись в недельный отчёт и пересчитывает итоги. Любое
                решение пишется в журнал действий.
              </p>
            </div>
          </WidgetCard>
        ) : (
          <EmptyState
            icon={ClipboardCheck}
            title="Выберите запись"
            description="Слева очередь проверки. Нажмите на запись, чтобы увидеть исходные данные и расчёт."
          />
        )}
      </div>
    </div>
  );
}

/** Исправление времени проверяющим: обязателен комментарий, изменение идёт в журнал */
function CorrectAction({ entryId }: { entryId: string }) {
  const actions = useGasActions();
  const [open, setOpen] = useState(false);
  const entry = useGasEntry(entryId)?.entry ?? null;
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [breaks, setBreaks] = useState("");
  const [why, setWhy] = useState("");

  if (!entry) return null;

  const clock = (minutes: number | null) => (minutes === null ? "" : formatClock(minutes));

  const openForm = () => {
    setStart(clock(entry.startMinutes));
    setEnd(clock(entry.endMinutes));
    setBreaks(String(entry.breakMinutes));
    setWhy("");
    setOpen(true);
  };

  const save = async () => {
    const result = await actions.updateEntry({
      id: entry.id,
      start,
      end,
      breakMinutes: breaks,
      comment: why,
    });
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success("Запись исправлена", { description: "Изменение записано в журнал" });
    setOpen(false);
  };

  if (!open) {
    return (
      <Button variant="outline" onClick={openForm} className="min-h-12">
        <Pencil className="size-4" aria-hidden />
        Исправить время
      </Button>
    );
  }

  return (
    <div className="w-full rounded-[var(--r-md)] border border-line bg-surface-2 p-4">
      <p className="text-[13px] font-medium">Исправление времени</p>
      {entry.startMinutes === null && (
        <p className="mt-2 text-[13px] text-warn">
          У записи из выгрузки нет начала и окончания смены: в файле заказчика стоят только минуты.
        </p>
      )}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <label className="text-[13px] text-text-2">
          Начало
          <input
            value={start}
            onChange={(event) => setStart(event.target.value)}
            inputMode="numeric"
            placeholder="8:20"
            className="mt-1 h-12 w-full rounded-[var(--r-sm)] border border-line bg-surface px-3 text-[15px] tabular-nums focus-ring"
          />
        </label>
        <label className="text-[13px] text-text-2">
          Окончание
          <input
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            inputMode="numeric"
            placeholder="16:40"
            className="mt-1 h-12 w-full rounded-[var(--r-sm)] border border-line bg-surface px-3 text-[15px] tabular-nums focus-ring"
          />
        </label>
        <label className="text-[13px] text-text-2">
          Перерыв, мин
          <input
            value={breaks}
            onChange={(event) => setBreaks(event.target.value)}
            inputMode="numeric"
            placeholder="60"
            className="mt-1 h-12 w-full rounded-[var(--r-sm)] border border-line bg-surface px-3 text-[15px] tabular-nums focus-ring"
          />
        </label>
      </div>
      <Textarea
        value={why}
        onChange={(event) => setWhy(event.target.value)}
        placeholder="Что и почему исправлено"
        className="mt-3 min-h-[64px]"
      />
      <div className="mt-3 flex gap-2">
        <Button onClick={() => void save()} className="min-h-12">
          Сохранить исправление
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)} className="min-h-12">
          Отмена
        </Button>
      </div>
    </div>
  );
}
