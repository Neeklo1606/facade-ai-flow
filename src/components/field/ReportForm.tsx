import { useState, type ReactNode } from "react";
import type { FieldReport, WorkZone } from "@/contracts";
import { useCreateReport } from "@/api/mutations";
import { toast } from "@/lib/toast";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Поля отчёта с площадки (ADR-022) одной формой для двух входов: окна на экране отчётов
 * и шторки «+» (ADR-029). Форма одна, потому что поля одни: две копии разошлись бы
 * на первой же правке.
 *
 * `sources` подписывает подставленные значения: человек должен видеть, откуда взялась
 * захватка и дата, и менять их на месте.
 */
export interface ReportFormValue {
  zoneId: string;
  workType: string;
  qty: string;
  unit: string;
  date: string;
  headcount: string;
  summary: string;
  issue: string;
}

export function emptyReport(zoneId: string, today: string): ReportFormValue {
  return {
    zoneId,
    workType: "",
    qty: "",
    unit: "м²",
    date: today,
    headcount: "4",
    summary: "",
    issue: "",
  };
}

export function reportReady(value: ReportFormValue) {
  return (
    !!value.zoneId &&
    value.workType.trim().length > 1 &&
    Number(value.qty) > 0 &&
    value.summary.trim().length > 2
  );
}

/** Отправка формы: общая для окна и шторки, чтобы правила записи не разошлись */
export function useReportSubmit(projectId: string) {
  const create = useCreateReport({ onFailed: (error) => toast.error(error.message) });
  const submit = (value: ReportFormValue, onDone: (report: FieldReport) => void) => {
    create.mutate(
      {
        projectId,
        zoneId: value.zoneId,
        workType: value.workType.trim(),
        declaredQty: Number(value.qty),
        unit: value.unit.trim(),
        reportDate: value.date,
        headcount: Number(value.headcount) || 0,
        summary: value.summary.trim(),
        ...(value.issue.trim() ? { issue: value.issue.trim() } : {}),
      },
      { onSuccess: onDone },
    );
  };
  return { submit, pending: create.isPending };
}

export function ReportFields({
  value,
  onChange,
  zones,
  today,
  sources,
  compact,
}: {
  value: ReportFormValue;
  onChange: (next: ReportFormValue) => void;
  zones: WorkZone[];
  today: string;
  /** Подписи «откуда взялось» для подставленных полей: ключ — имя поля */
  sources?: Partial<Record<"zoneId" | "date", string>>;
  /** Шторка телефона: поля в одну колонку */
  compact?: boolean;
}) {
  const set = <K extends keyof ReportFormValue>(key: K, next: ReportFormValue[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <div className="grid gap-3">
      <Labelled label="Захватка" source={sources?.zoneId}>
        <select
          value={value.zoneId}
          onChange={(event) => set("zoneId", event.target.value)}
          aria-label="Захватка"
          className="focus-ring h-12 rounded-[var(--r-sm)] border border-line bg-surface-2 px-3 text-[14px] text-text lg:h-10"
        >
          {zones.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.name}
            </option>
          ))}
        </select>
      </Labelled>

      <Labelled label="Вид работ">
        <Input
          value={value.workType}
          onChange={(event) => set("workType", event.target.value)}
          placeholder="Монтаж облицовки из керамогранита"
          aria-label="Вид работ"
        />
      </Labelled>

      <div className={cn("grid gap-2", compact ? "grid-cols-2" : "grid-cols-[1fr_100px_120px]")}>
        <Labelled label="Объём за смену">
          <Input
            value={value.qty}
            onChange={(event) => set("qty", event.target.value.replace(",", "."))}
            inputMode="decimal"
            placeholder="184"
            aria-label="Объём за смену"
            className="tnum"
          />
        </Labelled>
        <Labelled label="Единица">
          <Input
            value={value.unit}
            onChange={(event) => set("unit", event.target.value)}
            aria-label="Единица"
          />
        </Labelled>
        <Labelled label="Дата смены" source={sources?.date}>
          <Input
            type="date"
            value={value.date}
            max={today}
            onChange={(event) => set("date", event.target.value)}
            aria-label="Дата смены"
            className="tnum"
          />
        </Labelled>
      </div>

      <Labelled label="Человек в смене">
        <Input
          value={value.headcount}
          onChange={(event) => set("headcount", event.target.value.replace(/\D/gu, ""))}
          inputMode="numeric"
          aria-label="Человек в смене"
          className="tnum w-24"
        />
      </Labelled>

      <Labelled label="Что сделали">
        <textarea
          value={value.summary}
          onChange={(event) => set("summary", event.target.value)}
          rows={3}
          placeholder="Монтаж облицовки, захватка 2, оси Г–К, этажи 9–11."
          aria-label="Что сделали"
          className="focus-ring rounded-[var(--r-sm)] border border-line bg-surface-2 p-3 text-[14px] leading-[1.5] text-text"
        />
      </Labelled>

      <Labelled label="Что мешало — если мешало">
        <Input
          value={value.issue}
          onChange={(event) => set("issue", event.target.value)}
          placeholder="Не хватает нащельника углового, 12 шт"
          aria-label="Что мешало"
        />
      </Labelled>
    </div>
  );
}

function Labelled({
  label,
  source,
  children,
}: {
  label: string;
  source?: string | undefined;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="flex flex-wrap items-center gap-1.5 text-[13px] text-text-2">
        {label}
        {/* Подставленное значение не молчит: видно, откуда взялось (ADR-029, п. 4) */}
        {source && (
          <span className="rounded-[var(--r-xs)] bg-surface-2 px-1.5 py-0.5 text-[13px] text-text-3">
            {source}
          </span>
        )}
      </span>
      {children}
    </label>
  );
}
