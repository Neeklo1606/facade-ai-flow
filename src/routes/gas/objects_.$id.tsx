import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, SearchX } from "lucide-react";
import { completePageHead } from "@/lib/page-head";
import { gasTitle } from "@/lib/gas-ops/brand";
import { fmtDuration, fmtRub, useGasActor, useGasObjects } from "@/api/gas-ops";
import { useObjectSections } from "@/api/gas-section-accrual";
import { ObjectSections } from "@/components/gas-ops/workspace/ObjectSections";
import { ObjectPath } from "@/components/gas-ops/workspace/ObjectPath";
import { fmtShortDay } from "@/components/gas-ops/review/rules";
import {
  Avatar,
  DotNumber,
  KpiCard,
  ScreenHello,
  SplitProgress,
  dotMoney,
} from "@/components/ui/kit/warm";
import { EmptyBlock } from "@/components/ui/kit/states";

/**
 * Страница объекта (план 20.11.2026, этап 1; дизайн «Тепло»): шапка с адресом, номером сметы
 * и видом работ, остаток по разделам главной цифрой, разделы с бригадами и назначением,
 * записи времени. Сюда ведут список объектов и «Создать объект» из сметы.
 */
export const Route = createFileRoute("/gas/objects_/$id")({
  head: () =>
    completePageHead(
      { meta: [{ title: gasTitle("Объект") }] },
      gasTitle("Объект"),
      "Объект: смета, разделы, бригады, начислено и остаток, записи времени.",
    ),
  component: ObjectPage,
});

function ObjectPage() {
  const { id } = Route.useParams();
  const card = useGasObjects().find((c) => c.object.id === id) ?? null;
  const sections = useObjectSections(card ? id : null);
  const money = useGasActor().canSeeMoney;

  if (!card)
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <EmptyBlock
          icon={SearchX}
          title="Объект не найден"
          text="Возможно, его удалили или ссылка устарела. Откройте список объектов."
        />
      </div>
    );

  const { object } = card;
  const work = sections.reduce((a, s) => a + (s.workRub ?? 0), 0);
  const accrued = sections.reduce((a, s) => a + s.accruedRub, 0);
  const left = Math.max(0, work - accrued);
  const address = object.address
    ? [object.address.settlement, object.address.street, object.address.house]
        .filter(Boolean)
        .join(", ")
    : null;

  return (
    <div className="flex flex-col gap-4">
      <BackLink />
      <ScreenHello
        greeting={`Объект · ${object.code}${object.workType ? ` · ${object.workType}` : ""}`}
        title={object.label}
      />

      <ObjectPath objectId={object.id} label={object.label} />

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact term="Адрес" value={address ?? object.label} />
        <Fact term="Номер сметы" value={object.estimateNumber ?? "не указан"} />
        <Fact term="Разделов" value={String(sections.length)} />
        <Fact term="Дней в работе" value={String(card.days.length)} />
      </dl>

      {money && sections.length > 0 ? (
        <KpiCard
          title="Остаток по разделам сметы"
          period={`начислено ${fmtRub(accrued)} из ${fmtRub(work)}`}
          progress={
            <SplitProgress
              label={`Начислено ${fmtRub(accrued)}, остаток ${fmtRub(left)}`}
              segments={[
                { value: accrued, tone: "light" },
                { value: left, tone: "dim" },
              ]}
            />
          }
          legend={
            <>
              <span>● начислено</span>
              <span className="opacity-80">● остаток</span>
            </>
          }
        >
          <DotNumber {...dotMoney(left)} label={`Остаток ${fmtRub(left)}`} />
        </KpiCard>
      ) : null}

      <div className="surface-1 p-4 lg:p-5">
        <ObjectSections objectId={object.id} />
      </div>

      <section aria-labelledby="object-entries" className="surface-1 p-4 lg:p-5">
        <h2 id="object-entries" className="text-heading">
          Записи времени
        </h2>
        {card.entries.length === 0 ? (
          <p className="mt-2 text-body text-text-2">По объекту ещё нет записей.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {card.entries.slice(0, 30).map((entry) => {
              const brigade = card.brigades.find((b) => b.id === entry.brigadeId);
              return (
                <li key={entry.id} className="flex items-center gap-3 py-3">
                  <Avatar name={brigade?.name ?? "Бригада"} id={entry.brigadeId} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body-strong">
                      {brigade?.name ?? "Бригада"} · {fmtShortDay(entry.day)}
                    </span>
                    <span className="block text-meta text-text-2 tnum">
                      {entry.number} · {fmtDuration(entry.minutes)}
                      {entry.sectionKey ? ` · раздел ${entry.sectionKey}` : ""}
                    </span>
                  </span>
                  {money ? (
                    <span className="shrink-0 text-body-strong tnum">
                      {entry.amountRub === null ? "нет суммы" : fmtRub(entry.amountRub)}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/gas/objects"
      className="inline-flex min-h-11 items-center gap-1 self-start text-meta text-text-2 focus-ring"
    >
      <ChevronLeft className="size-4" aria-hidden />
      Объекты
    </Link>
  );
}

function Fact({ term, value }: { term: string; value: string }) {
  return (
    <div className="surface-1 min-w-0 p-3">
      <dt className="text-meta text-text-2">{term}</dt>
      <dd className="mt-1 truncate text-body-strong">{value}</dd>
    </div>
  );
}
