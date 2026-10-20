/**
 * «Что происходит в системе» (ADR-044, F4): справа от рамки телефона на десктопе.
 * Показывает, куда ушла запись из бота: в проверку, затем в недельный отчёт.
 */
import { useNavigate } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { SectionTitle } from "@/components/gas-ops/page";
import { ENTRY_STATUS_LABEL, useGasEntry, type EntryStatus } from "@/api/gas-ops";
import { cn } from "@/lib/utils";

const shortDay = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}`;

type Phase = 0 | 1 | 2;

function phaseOf(status: EntryStatus | null): Phase {
  if (status === "confirmed") return 2;
  if (status === null || status === "draft") return 0;
  return 1;
}

export function SystemPanel({ entryId }: { entryId: string | null }) {
  const view = useGasEntry(entryId);
  const entry = view?.entry ?? null;
  const phase = phaseOf(entry?.status ?? null);

  return (
    <section className="card-v3 p-5" aria-label="Что происходит в системе">
      <SectionTitle>Что происходит в системе</SectionTitle>

      <div className="rounded-[var(--r-lg)] bg-surface-2 p-4" data-testid="bot-system-status">
        {!entry ? (
          <p className="text-[15px] leading-[21px] text-text-2">
            Пока ничего не отправлено. Когда бригадир нажмёт «Отправить», здесь появится номер
            записи.
          </p>
        ) : entry.status === "confirmed" ? (
          <>
            <p className="text-[15px] leading-[21px] font-medium">
              <span className="tnum">{entry.number}</span> подтверждена, в отчёте за{" "}
              <span className="tnum">{shortDay(entry.day)}</span>
            </p>
            <PanelLink href={`/gas/reports?highlight=${entry.id}`}>Открыть в отчёте</PanelLink>
          </>
        ) : entry.status === "pending" ? (
          <>
            <p className="text-[15px] leading-[21px] font-medium">
              <span className="tnum">{entry.number}</span> создана, ждёт проверки
            </p>
            <PanelLink href={`/gas/moderation?open=${entry.id}`}>Открыть в проверке</PanelLink>
          </>
        ) : (
          <>
            <p className="text-[15px] leading-[21px] font-medium">
              <span className="tnum">{entry.number}</span>:{" "}
              {ENTRY_STATUS_LABEL[entry.status].toLowerCase()}
            </p>
            {entry.comment ? (
              <p className="mt-1 text-[13px] leading-[18px] text-text-3">{entry.comment}</p>
            ) : null}
            <PanelLink href={`/gas/moderation?open=${entry.id}`}>Открыть в проверке</PanelLink>
          </>
        )}
      </div>

      <ol className="mt-4 flex flex-col gap-1">
        <Phase index={0} current={phase} title="Бригадир вносит время в боте">
          Объект, день, начало, окончание, перерыв. Минуты считает система.
        </Phase>
        <Phase index={1} current={phase} title="Менеджер проверяет запись">
          Подтверждает, исправляет с причиной или возвращает на уточнение.
        </Phase>
        <Phase index={2} current={phase} title="Запись в недельном отчёте">
          Строка объекта в структуре Excel заказчика, сумма и доходность.
        </Phase>
      </ol>

      <p className="mt-4 text-[13px] leading-[18px] text-text-3">
        Сумму и доходность бригадир не видит: он вводит только время.
      </p>
    </section>
  );
}

function Phase({
  index,
  current,
  title,
  children,
}: {
  index: Phase;
  current: Phase;
  title: string;
  children: ReactNode;
}) {
  const done = index < current;
  const active = index === current;
  return (
    <li className="flex gap-3 rounded-[var(--r-md)] px-1 py-2">
      <span
        aria-hidden
        className={cn(
          "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-semibold tnum",
          active
            ? "bg-pill text-pill-text"
            : done
              ? "bg-ok-bg text-ok"
              : "bg-surface-2 text-text-3",
        )}
      >
        {index + 1}
      </span>
      <span className="min-w-0">
        <span className={cn("block text-[14px] leading-5 font-medium", !active && "text-text-2")}>
          {title}
          {done ? <span className="sr-only"> (сделано)</span> : null}
          {active ? <span className="sr-only"> (сейчас)</span> : null}
        </span>
        <span className="block text-[13px] leading-[18px] text-text-3">{children}</span>
      </span>
    </li>
  );
}

function PanelLink({ href, children }: { href: string; children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <a
      href={href}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        void navigate({ href });
      }}
      className="mt-3 inline-flex min-h-12 items-center gap-1.5 rounded-full bg-pill px-4 text-[14px] font-medium text-pill-text focus-ring press"
    >
      {children}
      <ArrowUpRight className="size-4" aria-hidden />
    </a>
  );
}
