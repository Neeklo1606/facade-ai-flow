import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { gasTitle } from "@/lib/gas-ops/brand";
import { completePageHead } from "@/lib/page-head";
import { useGasActor } from "@/lib/gas-ops/use-gas-ops";
import { useGasPrintReport } from "@/api/gas-print";
import { cn } from "@/lib/utils";

/**
 * Отчёт руководителю для PDF (ADR-072): лист A4 альбомом, сохраняется в PDF печатью браузера
 * («Сохранить как PDF» на компьютере, «Поделиться → Сохранить в Файлы» на iPhone). Только
 * принятые записи; сколько ещё ждёт проверки — в шапке. Бригадир сумм не видит (ТЗ, 5.6).
 */
export const Route = createFileRoute("/gas/print")({
  validateSearch: (search: Record<string, unknown>): { auto?: boolean | undefined } => ({
    auto:
      search["auto"] === true || search["auto"] === "1" || search["auto"] === 1 ? true : undefined,
  }),
  head: () =>
    completePageHead(
      { meta: [{ title: gasTitle("Отчёт для печати") }] },
      gasTitle("Отчёт для печати"),
      "Отчёт недели на листе A4: показатели и табель по бригадам и адресам, сохраняется в PDF.",
    ),
  component: PrintPage,
});

function PrintPage() {
  const actor = useGasActor();
  const sheet = useGasPrintReport();
  const { auto } = Route.useSearch();
  const allowed = actor.canSeeMoney;

  useEffect(() => {
    if (!auto || !allowed) return;
    // Окно печати после отрисовки таблицы: иначе на лист попадёт пустая страница
    const timer = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(timer);
  }, [auto, allowed]);

  if (!allowed) {
    return (
      <p className="surface-1 px-row py-6 text-body text-text-2">
        Отчёт с суммами доступен менеджеру и руководителю. Свои часы бригадир видит в «Мои записи».
      </p>
    );
  }

  const madeAt = new Date().toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="flex flex-col gap-block">
      <div data-print="hide" className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => window.print()} iconEnd={<Printer />}>
          Сохранить в PDF
        </Button>
        <Link
          to="/gas/tabel"
          className="inline-flex min-h-11 items-center gap-1 px-2 text-body text-text-2 focus-ring"
        >
          <ArrowLeft className="size-4" aria-hidden />К табелю
        </Link>
        <p className="w-full text-meta text-text-3">
          В окне печати выберите «Сохранить как PDF». На iPhone: «Параметры», затем «Поделиться» и
          «Сохранить в Файлы».
        </p>
      </div>

      <article
        className="print-sheet surface-1 overflow-x-auto px-row py-row"
        data-testid="print-report"
      >
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3">
          <div>
            <h1 className="text-title">{sheet.title}</h1>
            <p className="text-meta text-text-3">{sheet.note}</p>
          </div>
          <p className="text-meta text-text-3">Сформирован {madeAt}</p>
        </header>

        <dl
          className="grid grid-cols-2 gap-3 border-b border-line py-3 sm:grid-cols-4"
          data-testid="print-kpis"
        >
          {sheet.kpis.map((kpi) => (
            <div key={kpi.label}>
              <dt className="text-meta text-text-3">{kpi.label}</dt>
              <dd className="text-body-strong tnum">{kpi.value}</dd>
              {kpi.note ? <dd className="text-meta text-text-3">{kpi.note}</dd> : null}
            </div>
          ))}
        </dl>

        {sheet.rows.length === 0 ? (
          <p className="py-6 text-center text-body text-text-3">Принятых записей за неделю нет.</p>
        ) : (
          <table className="print-table mt-3 w-full min-w-[720px] text-meta tnum">
            <thead>
              <tr className="border-b border-line text-left text-text-3">
                <th className="py-1 pr-2 font-normal">Бригада и адрес</th>
                {sheet.dayLabels.map((day) => (
                  <th key={day} className="px-1 py-1 text-right font-normal whitespace-nowrap">
                    {day}
                  </th>
                ))}
                <th className="px-1 py-1 text-right font-normal">Часы</th>
                <th className="px-1 py-1 text-right font-normal">Сумма</th>
                <th className="py-1 pl-1 text-right font-normal">₽/ч</th>
              </tr>
            </thead>
            <tbody>
              {sheet.rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn("border-b border-line", row.strong && "font-semibold")}
                >
                  <td className="py-1 pr-2" style={{ paddingLeft: `${row.level * 12}px` }}>
                    {row.label}
                  </td>
                  {row.days.map((h, i) => (
                    <td key={i} className="px-1 py-1 text-right">
                      {h}
                    </td>
                  ))}
                  <td className="px-1 py-1 text-right">{row.hours}</td>
                  <td className="px-1 py-1 text-right whitespace-nowrap">{row.amount}</td>
                  <td className="py-1 pl-1 text-right whitespace-nowrap">{row.rate}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="py-1 pr-2">Итого</td>
                {sheet.totals.days.map((h, i) => (
                  <td key={i} className="px-1 py-1 text-right">
                    {h}
                  </td>
                ))}
                <td className="px-1 py-1 text-right">{sheet.totals.hours}</td>
                <td className="px-1 py-1 text-right whitespace-nowrap">{sheet.totals.amount}</td>
                <td className="py-1 pl-1 text-right whitespace-nowrap">{sheet.totals.rate}</td>
              </tr>
            </tfoot>
          </table>
        )}
        <p className="mt-3 text-meta text-text-3">
          Суммы по стоимости работ из подтверждённых смет. Часы от минут записей, как в Excel
          заказчика.
        </p>
      </article>
    </div>
  );
}
