import { useState } from "react";
import {
  demoSectionAllocation,
  exportDemoAllocation,
  useDemoAllocation,
} from "@/api/gas-demo-allocation";
import { useGasDirectory, useGasWeek, fmtRub } from "@/api/gas-ops";
import type { EstimateVersion } from "@/api/gas-estimates";
import { Field } from "@/components/ui/kit/field";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";

export function AllocationPreview({ version }: { version: EstimateVersion }) {
  const { plan, save, error, ready, enabled } = useDemoAllocation(version);
  const directory = useGasDirectory();
  const week = useGasWeek();
  const [sectionRow, setSectionRow] = useState(String(version.sections[0]?.row ?? ""));
  const [brigadeId, setBrigadeId] = useState("");
  const [day, setDay] = useState(week.days[0] ?? "");
  const [percent, setPercent] = useState("");
  const [busy, setBusy] = useState(false);
  if (!enabled) return null;
  const section = version.sections.find((s) => String(s.row) === sectionRow);
  const add = () => {
    if (
      !section ||
      !directory.brigades.some((b) => b.id === brigadeId) ||
      !week.days.includes(day)
    ) {
      toast.error("Выберите раздел, бригаду и день");
      return;
    }
    const value = Number(percent.replace(",", "."));
    const row = {
      id: crypto.randomUUID(),
      sectionRow: section.row,
      brigadeId,
      day,
      percent: value,
    };
    const next = { ...plan, rows: [...plan.rows, row] };
    try {
      const result = demoSectionAllocation(section, next);
      if (result.net === null)
        throw new Error("Укажите материалы раздела: число от нуля до его стоимости");
      if (!plan.kinds[sectionRow]) throw new Error("Укажите вид работ раздела");
      save(next);
      setPercent("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Проверьте долю");
    }
  };
  return (
    <section className="surface-1 min-w-0 p-card" aria-labelledby="allocation-preview-title">
      <h2 id="allocation-preview-title" className="text-heading">
        Проект начислений по разделам
      </h2>
      <p className="mt-2 text-meta text-text-2">
        Демонстрация будущего расчёта по выполненному объёму. Сохраняется в этом браузере отдельно
        от табеля. Утверждённые суммы и Excel отчёта не меняются.
      </p>
      {!version.sections.length ? (
        <p className="mt-3 text-body">
          В смете не распознаны разделы. Откройте разбор сметы и проверьте формат файла.
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="flex min-w-0 flex-col gap-1 text-meta">
              Раздел сметы
              <select
                className="h-12 w-full rounded-control border border-line bg-surface px-3 text-body"
                value={sectionRow}
                onChange={(e) => setSectionRow(e.target.value)}
              >
                {version.sections.map((s) => (
                  <option key={s.row} value={s.row}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-meta">
              Вид раздела
              <select
                className="h-12 rounded-control border border-line bg-surface px-3 text-body"
                value={plan.kinds[sectionRow] ?? ""}
                onChange={(e) =>
                  save({ ...plan, kinds: { ...plan.kinds, [sectionRow]: e.target.value } })
                }
                disabled={!ready}
              >
                <option value="">Подтвердите вид работ</option>
                <option>СМР</option>
                <option>Опрессовка</option>
                <option>Другие работы</option>
              </select>
            </label>
            <Field
              label="Материалы раздела, ₽"
              value={plan.materials[sectionRow] ?? ""}
              onChange={(value) =>
                save({ ...plan, materials: { ...plan.materials, [sectionRow]: value } })
              }
              disabled={!ready}
              hint="Укажите по исходной смете; если материалов нет, введите 0. Система не угадывает эту сумму."
            />
            <div className="text-body">
              {section ? (
                <>
                  <p>Итог раздела: {fmtRub(section.kopecks / 100)}</p>
                  <p className="text-meta text-text-3">
                    Источник: {version.fileName}, строка {section.row}, версия {version.version}
                  </p>
                </>
              ) : null}
            </div>
            <label className="flex flex-col gap-1 text-meta">
              Исполнитель раздела
              <select
                className="h-12 rounded-control border border-line bg-surface px-3 text-body"
                value={brigadeId}
                onChange={(e) => setBrigadeId(e.target.value)}
              >
                <option value="">Выберите бригаду</option>
                {directory.brigades.map((b) => (
                  <option value={b.id} key={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-meta">
              День выполнения
              <select
                className="h-12 rounded-control border border-line bg-surface px-3 text-body"
                value={day}
                onChange={(e) => setDay(e.target.value)}
              >
                {week.days.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <Field
              label="Выполнено за день, %"
              value={percent}
              onChange={setPercent}
              inputMode="decimal"
              hint="Доля всего объёма раздела, а не доля от оставшихся работ"
            />
            <Button className="self-end" variant="secondary" disabled={!ready} onClick={add}>
              Добавить долю в проект
            </Button>
          </div>
          {error ? (
            <p role="alert" className="mt-3 text-meta text-danger">
              {error}
            </p>
          ) : null}
          <div className="mt-4 flex flex-col gap-3">
            {version.sections
              .filter((s) => plan.rows.some((r) => r.sectionRow === s.row))
              .map((s) => {
                let result;
                try {
                  result = demoSectionAllocation(s, plan);
                } catch {
                  return (
                    <p key={s.row} role="alert">
                      Проверьте доли раздела {s.title}
                    </p>
                  );
                }
                return (
                  <section key={s.row} className="rounded-control border border-line p-3">
                    <h3 className="text-body-strong">
                      {plan.kinds[String(s.row)] ?? "Раздел"} · {s.title}
                    </h3>
                    <p className="mt-1 text-meta">
                      Распределено {result.percent} % · проект{" "}
                      {result.allocated === null ? "не рассчитан" : fmtRub(result.allocated / 100)}{" "}
                      · остаток{" "}
                      {result.remaining === null ? "не рассчитан" : fmtRub(result.remaining / 100)}
                    </p>
                    {result.net === null ? (
                      <p role="alert" className="text-meta text-danger">
                        Проверьте материалы раздела
                      </p>
                    ) : null}
                    <ul className="mt-2 divide-y divide-line">
                      {plan.rows
                        .filter((r) => r.sectionRow === s.row)
                        .map((r) => (
                          <li
                            key={r.id}
                            className="flex flex-wrap items-center justify-between gap-2 py-2 text-meta"
                          >
                            <span>
                              {directory.brigades.find((b) => b.id === r.brigadeId)?.name ??
                                "Бригада удалена"}{" "}
                              · {r.day} · {r.percent} % ·{" "}
                              {result.amounts.has(r.id)
                                ? fmtRub(result.amounts.get(r.id)! / 100)
                                : "не рассчитано"}
                            </span>
                            <Button
                              variant="quiet"
                              size="sm"
                              aria-label={`Удалить долю ${r.percent} % за ${r.day}`}
                              onClick={() =>
                                save({ ...plan, rows: plan.rows.filter((x) => x.id !== r.id) })
                              }
                            >
                              Удалить
                            </Button>
                          </li>
                        ))}
                    </ul>
                  </section>
                );
              })}
          </div>
          <Button
            className="mt-4"
            variant="secondary"
            disabled={!plan.rows.length || busy}
            onClick={() => {
              setBusy(true);
              void exportDemoAllocation(version, plan, directory.brigades)
                .catch((e) =>
                  toast.error(e instanceof Error ? e.message : "Не удалось выгрузить проект"),
                )
                .finally(() => setBusy(false));
            }}
          >
            Скачать проект начислений XLSX
          </Button>
        </>
      )}
    </section>
  );
}
