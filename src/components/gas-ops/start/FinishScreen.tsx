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
      <section className="hero-field flex flex-col items-start gap-4 p-6 sm:p-10">
        <span aria-hidden className="orb -top-24 -right-16 size-[280px]" />
        <h2 className="text-[26px] leading-[30px] font-semibold tracking-[-0.02em] sm:text-[32px] sm:leading-9">
          Показ ещё не пройден. <span className="tone-2">Он займёт 3 минуты.</span>
        </h2>
        <p className="max-w-[560px] text-[15px] leading-6 text-text-2">
          Запись пройдёт путь от бота бригадира через проверку до недельного отчёта и файла Excel, а
          здесь появится итог.
        </p>
        <Link to="/gas" className="pill-action press focus-ring mt-2">
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
    <div className="flex flex-col gap-6">
      <section className="hero-field p-6 sm:p-10" aria-labelledby="gas-finish-title">
        <span aria-hidden className="orb -top-28 -right-16 size-[320px] sm:size-[420px]" />
        <p className="text-[13px] font-medium text-text-2">Показ пройден</p>
        <h2 id="gas-finish-title" className="text-display mt-2 max-w-[760px] text-balance">
          Готово. <span className="tone-2 block">Запись дошла от бота до Excel.</span>
        </h2>
        <p className="mt-8 text-[13px] text-text-3">Доходность часа</p>
        <p className="text-hero-num mt-1" data-testid="finish-rate">
          {fmtRate(entry?.revenue ?? null)}
        </p>
      </section>

      <section aria-labelledby="gas-finish-list" className="card-v3 p-5 sm:p-7">
        <h2 id="gas-finish-list" className="text-[17px] leading-6 font-semibold">
          Что создано за показ
        </h2>
        <dl className="mt-4 grid gap-x-6 sm:grid-cols-2">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-baseline justify-between gap-4 border-b border-line py-3 sm:[&:nth-last-child(2)]:border-b-0"
            >
              <dt className="shrink-0 text-[14px] text-text-3">{row.label}</dt>
              <dd className="tnum min-w-0 text-right text-[15px] font-medium">{row.value}</dd>
            </div>
          ))}
          <div className="flex flex-col gap-1 border-b border-line py-3 sm:border-b-0">
            <dt className="flex items-center gap-2 text-[14px] text-text-3">
              <FileSpreadsheet className="size-4" aria-hidden />
              Файл
            </dt>
            <dd className="text-[15px] font-medium [overflow-wrap:anywhere]">
              {state.chain.gasFile ?? "ещё не выгружен"}
            </dd>
          </div>
        </dl>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={() => setConfirm(true)}
          className="pill-action press focus-ring w-full sm:w-auto"
        >
          <RotateCcw className="size-4" aria-hidden />
          Пройти заново
        </button>
        <Link
          to="/gas/guide"
          className="press focus-ring inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-surface-2 px-6 font-medium lg:min-h-12"
        >
          <BookOpen className="size-4" aria-hidden />
          Открыть инструкцию
        </Link>
        <Link
          to="/gas/questions"
          className="press focus-ring inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-surface-2 px-6 font-medium lg:min-h-12"
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
