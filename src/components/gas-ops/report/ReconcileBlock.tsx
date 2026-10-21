/**
 * «Сверка с вашим файлом» (ADR-044, F6): под итогом недели, свёрнут. Текст целиком
 * приходит из кода сверки (`reconcile.ts`): цифры здесь не пишутся руками, тест сравнивает
 * текст блока с расчётом.
 */
import { Link } from "@tanstack/react-router";
import { ChevronDown, FileCheck2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useGasReconcile, type ReconcileLine } from "@/api/gas-report";
import { cn } from "@/lib/utils";

/** Список строк сверки. Ссылка на вопрос подставляется снаружи: в тесте роутера нет */
export function ReconcileLines({
  lines,
  link = (line, children) => (
    <Link
      to="/gas/questions"
      hash={`q-${line.question!.number}`}
      className="font-medium text-orange underline-offset-4 focus-ring is-hover:underline"
    >
      {children}
    </Link>
  ),
}: {
  lines: ReconcileLine[];
  link?: (line: ReconcileLine, children: ReactNode) => ReactNode;
}) {
  return (
    <ul className="flex flex-col gap-3" data-testid="reconcile-lines">
      {lines.map((line) => (
        <li
          key={line.id}
          data-line={line.id}
          className="text-body rounded-[var(--r-lg)] bg-surface-2 px-4 py-3 text-text-2"
        >
          {line.text}
          {line.question ? <> {link(line, line.question.label)}</> : null}
        </li>
      ))}
    </ul>
  );
}

export function ReconcileBlock({ className }: { className?: string }) {
  const lines = useGasReconcile();
  const [open, setOpen] = useState(false);
  return (
    <section
      className={cn("card-v3 px-4 py-2 md:px-6", className)}
      aria-labelledby="reconcile-title"
    >
      <h2 id="reconcile-title" className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="reconcile-body"
          onClick={() => setOpen((value) => !value)}
          className="text-body-strong flex min-h-12 w-full items-center gap-3 text-start font-semibold focus-ring"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-text-2">
            <FileCheck2 className="size-4" aria-hidden />
          </span>
          <span className="flex-1">Сверка с вашим файлом</span>
          <span className="text-meta hidden font-normal text-text-3 sm:inline">
            {open ? "Свернуть" : "Показать"}
          </span>
          <ChevronDown
            className={cn("size-4 text-text-3 transition-transform", open && "rotate-180")}
            aria-hidden
          />
        </button>
      </h2>
      {open ? (
        <div id="reconcile-body" className="pt-2 pb-4">
          <ReconcileLines lines={lines} />
        </div>
      ) : null}
    </section>
  );
}
