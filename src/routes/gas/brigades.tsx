import { completePageHead } from "@/lib/page-head";
import { ScreenHint } from "@/components/gas-ops/page";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { HardHat, Users } from "lucide-react";
import { WidgetCard, WidgetCardHeader } from "@/components/common/WidgetCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { HoursCell, MoneyCell, Num, RateCell, SourceMark } from "@/components/gas-ops/marks";
import { Button } from "@/components/ui/button";
import { fmtHours, fmtRate, fmtRub, useGasBrigades } from "@/api/gas-ops";

/**
 * Бригады и подгруппы (ТЗ, п. 8). Структура не ограничена семью бригадами: в отчёте
 * заказчика есть подгруппы — СЭГ, отопление, бригады из одного человека.
 */
export const Route = createFileRoute("/gas/brigades")({
  head: () =>
    completePageHead(
      { meta: [{ title: "Бригады — Учёт выработки бригад" }] },
      "Бригады — Учёт выработки бригад",
      "Состав бригад, объекты недели, часы и начисления.",
    ),
  component: BrigadesPage,
});

function BrigadesPage() {
  const cards = useGasBrigades("confirmed");
  const [open, setOpen] = useState<string | null>(null);

  const groups = [...new Set(cards.map((card) => card.group?.name ?? "Без подразделения"))];

  return (
    <div className="flex flex-col gap-6">
      <ScreenHint screen="brigades" className="mb-0" />
      {groups.map((groupName) => {
        const own = cards.filter((card) => (card.group?.name ?? "Без подразделения") === groupName);
        const amount = own.reduce((a, card) => a + card.totals.amountRub, 0);
        const minutes = own.reduce((a, card) => a + card.totals.minutes, 0);
        return (
          <WidgetCard key={groupName}>
            <WidgetCardHeader
              icon={HardHat}
              title={groupName}
              hint={`${own.length} бригад, ${fmtRub(amount)}, ${fmtHours(minutes / 60)}`}
              level={2}
            />
            <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {own.map((card) => {
                const expanded = open === card.brigade.id;
                return (
                  <li key={card.brigade.id} className="rounded-[var(--r-lg)] bg-surface-2 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[15px] font-medium">{card.brigade.name}</h3>
                      <SourceMark source={card.brigade.source} />
                      {card.pending > 0 && (
                        <StatusBadge tone="warn">{card.pending} на проверке</StatusBadge>
                      )}
                    </div>
                    <p className="mt-1 text-[13px] text-text-3">
                      {card.lead ? `Бригадир: ${card.lead.name}` : "Бригадир не назначен"} ·{" "}
                      {card.members.length} в составе
                    </p>

                    <dl className="mt-3 grid grid-cols-3 gap-2 text-[13px]">
                      <div>
                        <dt className="text-text-3">Начислено</dt>
                        <dd className="mt-0.5">
                          <MoneyCell value={card.totals.amountRub} />
                        </dd>
                      </div>
                      <div>
                        <dt className="text-text-3">Часы</dt>
                        <dd className="mt-0.5">
                          <HoursCell minutes={card.totals.minutes} />
                        </dd>
                      </div>
                      <div>
                        <dt className="text-text-3">Доходность</dt>
                        <dd className="mt-0.5">
                          <RateCell value={card.totals.revenuePerHour} />
                        </dd>
                      </div>
                    </dl>

                    <p className="mt-2 text-[13px] text-text-3">
                      Объектов за неделю: <Num>{card.objects.length}</Num>
                      {card.totals.withoutAmount > 0 && (
                        <>
                          {" "}
                          · записей без суммы: <Num>{card.totals.withoutAmount}</Num>
                        </>
                      )}
                    </p>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      onClick={() => setOpen(expanded ? null : card.brigade.id)}
                    >
                      {expanded ? "Свернуть" : "Состав и объекты"}
                    </Button>

                    {expanded && (
                      <div className="mt-3 border-t border-line pt-3">
                        <p className="flex items-center gap-2 text-[13px] font-medium">
                          <Users className="size-4" aria-hidden />
                          Состав
                        </p>
                        <ul className="mt-1 flex flex-col gap-1 text-[13px] text-text-2">
                          {card.members.map((member) => (
                            <li key={member.id}>
                              {member.name}
                              {member.isLead ? " · бригадир" : ""}
                            </li>
                          ))}
                          {card.members.length === 0 && <li className="text-text-3">—</li>}
                        </ul>
                        <p className="mt-3 text-[13px] font-medium">Объекты недели</p>
                        <ul className="mt-1 flex flex-col gap-1 text-[13px] text-text-2">
                          {card.objects.map((object) => (
                            <li key={object.id}>{object.label}</li>
                          ))}
                          {card.objects.length === 0 && (
                            <li className="text-text-3">Подтверждённых записей нет</li>
                          )}
                        </ul>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </WidgetCard>
        );
      })}
      <p className="text-[13px] text-text-3">
        Цифры считаются по подтверждённым записям. Доходность бригады — это сумма за неделю,
        делённая на её часы, а не среднее по строкам: среднее завысило бы короткие дорогие работы.
      </p>
    </div>
  );
}
