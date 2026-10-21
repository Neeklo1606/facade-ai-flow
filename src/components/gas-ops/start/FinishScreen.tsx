/**
 * Финал показа «gas-week» (ADR-044, F3, п. 6): что создано за показ и куда дальше.
 * Запись и файл берутся из цепочки вкладки, числа записи из порта: те же, что в отчёте.
 */
import { Link } from "@tanstack/react-router";
import { BookOpen, FileSpreadsheet, MessageCircleQuestion, Play, RotateCcw } from "lucide-react";
import { useState } from "react";
import {
  ENTRY_STATUS_LABEL,
  fmtHours,
  fmtRate,
  fmtRub,
  useGasActions,
  useGasEntry,
} from "@/api/gas-ops";
import { useRoleSwitch } from "@/components/gas-ops/shell/use-role-switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { resetGasShow, startGasShow, useGasShow } from "@/lib/gas-ops/show";

export function FinishScreen() {
  const { state } = useGasShow();
  const entry = useGasEntry(state.chain.gasEntryId ?? null);
  const actions = useGasActions();
  const switchRole = useRoleSwitch();
  const [confirm, setConfirm] = useState(false);

  const restart = async () => {
    setConfirm(false);
    await actions.reset();
    resetGasShow();
    startGasShow();
    await switchRole("foreman");
  };

  if (!state.chain.gasEntryId) {
    return (
      <section className="surface-1 flex flex-col items-start gap-block p-card">
        <h2 className="text-display">
          Показ ещё не пройден. <span className="tone-2">Он займёт 3 минуты.</span>
        </h2>
        <p className="max-w-[560px] text-body text-text-2">
          Запись пройдёт путь от бота бригадира через проверку до недельного отчёта и файла Excel, а
          здесь появится итог.
        </p>
        <Link
          to="/gas"
          className="inline-flex h-control-lg items-center gap-2 rounded-control bg-orange-strong px-5 text-body-strong text-on-orange focus-ring press-98"
        >
          <Play className="size-4 fill-current" aria-hidden />
          Пройти показ
        </Link>
      </section>
    );
  }

  const rows = [
    { label: "Номер записи", value: entry?.entry.number ?? state.chain.gasEntryNumber ?? "—" },
    { label: "Объект", value: entry?.object?.label ?? "—" },
    {
      label: "Минуты",
      value: entry ? `${entry.entry.minutes} мин · ${fmtHours(entry.hours)}` : "—",
    },
    {
      label: "Сумма",
      value: entry && entry.entry.amountRub !== null ? fmtRub(entry.entry.amountRub) : "нет суммы",
    },
    { label: "Статус", value: entry ? ENTRY_STATUS_LABEL[entry.entry.status] : "—" },
  ];

  return (
    <div className="flex flex-col gap-section">
      {/* Бренд допустим на финале (3.4), но без поля на пол-экрана (5.11) */}
      <section
        className="rounded-card bg-[linear-gradient(135deg,var(--orange-dim),transparent_60%)] p-card"
        aria-labelledby="gas-finish-title"
      >
        <p className="text-meta text-text-2">Показ пройден</p>
        <h2 id="gas-finish-title" className="mt-1 max-w-[760px] text-display text-balance">
          Готово. <span className="tone-2 block">Запись дошла от бота до Excel.</span>
        </h2>
        <p className="mt-block text-meta text-text-3">Доходность часа</p>
        <p className="text-hero" data-testid="finish-rate">
          {fmtRate(entry?.revenue ?? null)}
        </p>
      </section>

      <section aria-labelledby="gas-finish-list">
        <h2 id="gas-finish-list" className="flex min-h-7 items-center text-heading">
          Что создано за показ
        </h2>
        <dl className="surface-1 mt-2 grid gap-x-6 px-row sm:grid-cols-2">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex min-h-row-compact items-center justify-between gap-4 border-b border-line py-2 sm:[&:nth-last-child(2)]:border-b-0"
            >
              <dt className="shrink-0 text-meta text-text-3">{row.label}</dt>
              <dd className="min-w-0 text-right text-body-strong tnum">{row.value}</dd>
            </div>
          ))}
          <div className="flex min-h-row-compact flex-col justify-center gap-1 py-2">
            <dt className="flex items-center gap-2 text-meta text-text-3">
              <FileSpreadsheet className="size-4" aria-hidden />
              Файл
            </dt>
            <dd className="text-body-strong [overflow-wrap:anywhere]">
              {state.chain.gasFile ?? "ещё не выгружен"}
            </dd>
          </div>
        </dl>
      </section>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={() => setConfirm(true)}
          className="inline-flex h-control-lg w-full items-center justify-center gap-2 rounded-control bg-orange-strong px-5 text-body-strong text-on-orange focus-ring press-98 sm:w-auto"
        >
          <RotateCcw className="size-4" aria-hidden />
          Пройти заново
        </button>
        <Link
          to="/gas/guide"
          className="inline-flex h-control items-center justify-center gap-2 rounded-control border border-line-2 bg-surface px-4 text-body-strong focus-ring press-98"
        >
          <BookOpen className="size-4" aria-hidden />
          Открыть инструкцию
        </Link>
        <Link
          to="/gas/questions"
          className="inline-flex h-control items-center justify-center gap-2 rounded-control border border-line-2 bg-surface px-4 text-body-strong focus-ring press-98"
        >
          <MessageCircleQuestion className="size-4" aria-hidden />
          Вопросы к согласованию
        </Link>
      </div>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Пройти показ заново?</AlertDialogTitle>
            <AlertDialogDescription>
              Записи, проверки и правки этой вкладки сотрутся, данные вернутся к отчёту заказчика.
              Отменить это нельзя.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Оставить</AlertDialogCancel>
            <AlertDialogAction onClick={() => void restart()}>Начать заново</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
