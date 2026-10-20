import { completePageHead } from "@/lib/page-head";
import { ScreenHint } from "@/components/gas-ops/page";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Banknote } from "lucide-react";
import { WidgetCard, WidgetCardHeader } from "@/components/common/WidgetCard";
import { WidgetTable, type WidgetColumn } from "@/components/common/WidgetTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { MoneyCell, Num, SourceMark } from "@/components/gas-ops/marks";
import { Button } from "@/components/ui/button";
import {
  fmtRub,
  useGasActions,
  useGasActor,
  useGasDirectory,
  useGasEstimates,
  type Estimate,
} from "@/api/gas-ops";
import { toast } from "@/lib/toast";

/**
 * Стоимость работ объекта (ТЗ, п. 6 и 10). Стоимость без материалов, версия, источник
 * и кто подтвердил. Для котлов без сметы сумма вносится вручную менеджером.
 *
 * Распознавание смет здесь не делается: по ТЗ оно в работу не входит.
 */
export const Route = createFileRoute("/gas/estimates")({
  head: () =>
    completePageHead(
      { meta: [{ title: "Стоимость работ — Учёт выработки бригад" }] },
      "Стоимость работ — Учёт выработки бригад",
      "Подтверждённая стоимость работ без материалов и ручной ввод сумм.",
    ),
  component: EstimatesPage,
});

const STATUS_LABEL: Record<Estimate["status"], string> = {
  confirmed: "Подтверждена",
  "manual-pending": "Ждёт ручного ввода",
  missing: "Не передана",
};

const ORIGIN_LABEL: Record<Estimate["origin"], string> = {
  estimate: "смета",
  manual: "ручной ввод менеджера",
  none: "источника нет",
};

interface Row {
  id: string;
  object: string;
  code: string;
  version: number;
  amountRub: number | null;
  status: Estimate["status"];
  origin: Estimate["origin"];
  confirmedBy: string;
  note: string;
  source: "fact-report" | "mock";
}

function EstimatesPage() {
  const rows = useGasEstimates();
  const actor = useGasActor();
  const actions = useGasActions();
  const directory = useGasDirectory();
  const [objectId, setObjectId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const tableRows: Row[] = rows.map(({ estimate, object }) => ({
    id: estimate.id,
    object: object?.label ?? estimate.objectId,
    code: object?.code ?? "—",
    version: estimate.version,
    amountRub: estimate.status === "missing" ? null : estimate.amountRub,
    status: estimate.status,
    origin: estimate.origin,
    confirmedBy: estimate.confirmedBy ?? "—",
    note: estimate.note ?? "",
    source: estimate.source,
  }));

  const columns: WidgetColumn<Row>[] = [
    { key: "code", header: "Объект", cell: (row) => <Num>{row.code}</Num> },
    { key: "object", header: "Адрес", cell: (row) => row.object },
    { key: "version", header: "Версия", align: "right", cell: (row) => <Num>{row.version}</Num> },
    {
      key: "amount",
      header: "Стоимость работ",
      align: "right",
      cell: (row) => <MoneyCell value={row.amountRub} />,
    },
    {
      key: "status",
      header: "Статус",
      cell: (row) => (
        <StatusBadge
          tone={
            row.status === "confirmed" ? "ok" : row.status === "manual-pending" ? "warn" : "neutral"
          }
        >
          {STATUS_LABEL[row.status]}
        </StatusBadge>
      ),
    },
    { key: "origin", header: "Источник", cell: (row) => ORIGIN_LABEL[row.origin] },
    { key: "by", header: "Подтвердил", cell: (row) => row.confirmedBy },
    { key: "source", header: "Данные", cell: (row) => <SourceMark source={row.source} /> },
  ];

  const save = async () => {
    const value = Number(amount.replace(/\s/g, "").replace(",", "."));
    if (!objectId || !Number.isFinite(value) || value <= 0) {
      toast.error("Выберите объект и укажите сумму числом");
      return;
    }
    const result = await actions.setEstimate({
      objectId,
      amountRub: value,
      note: note.trim() || undefined,
    });
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success("Стоимость подтверждена", {
      description: `${fmtRub(result.value.amountRub)}, версия ${result.value.version}`,
    });
    setAmount("");
    setNote("");
  };

  return (
    <div className="flex flex-col gap-6">
      <ScreenHint screen="estimates" className="mb-0" />
      <p className="rounded-[var(--r-lg)] bg-surface-2 p-4 text-[13px] text-text-2">
        В фактическом отчёте заказчика суммы стоят как начисления по объекту за день, а
        подтверждённой стоимости работ в нём нет. Поэтому здесь только то, что подтвердил человек.
        Какие статьи сметы входят в стоимость работ и кто утверждает сумму по котлам без сметы —
        открытые вопросы ТЗ.
      </p>

      <WidgetCard>
        <WidgetCardHeader
          icon={Banknote}
          title="Подтверждённая стоимость работ"
          hint="Без материалов, целые рубли"
          level={2}
        />
        <div className="mt-4">
          <WidgetTable columns={columns} rows={tableRows} />
        </div>
      </WidgetCard>

      {actor.canManageEstimates && (
        <WidgetCard>
          <WidgetCardHeader
            icon={Banknote}
            title="Ручной ввод суммы"
            hint="Для объектов без сметы: котлы и мелкие работы"
            level={2}
          />
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="block w-full text-[13px] text-text-3 sm:w-auto">
              <span className="mb-1 block">Объект</span>
              <select
                value={objectId}
                onChange={(event) => setObjectId(event.target.value)}
                className="h-12 w-full rounded-[var(--r-sm)] border border-line bg-surface px-3 text-[13px] text-text focus-ring sm:h-10 sm:w-[320px]"
              >
                <option value="">Выберите объект</option>
                {directory.objects.map((object) => (
                  <option key={object.id} value={object.id}>
                    {object.code} · {object.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block w-full text-[13px] text-text-3 sm:w-auto">
              <span className="mb-1 block">Стоимость работ, ₽</span>
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="numeric"
                placeholder="14700"
                className="h-12 w-full rounded-[var(--r-sm)] border border-line bg-surface px-3 text-[13px] tabular-nums focus-ring sm:h-10 sm:w-[160px]"
              />
            </label>
            <label className="block flex-1 text-[13px] text-text-3">
              <span className="mb-1 block">Основание</span>
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Откуда сумма: договор, прайс, согласование"
                className="h-12 w-full rounded-[var(--r-sm)] border border-line bg-surface px-3 text-[13px] focus-ring sm:h-10"
              />
            </label>
            <Button onClick={() => void save()} className="min-h-12 w-full sm:w-auto">
              Подтвердить стоимость
            </Button>
          </div>
          <p className="mt-3 text-[13px] text-text-3">
            Подтверждение создаёт новую версию и пишется в журнал действий. Распознавание PDF-смет в
            прототипе не делается.
          </p>
        </WidgetCard>
      )}
    </div>
  );
}
