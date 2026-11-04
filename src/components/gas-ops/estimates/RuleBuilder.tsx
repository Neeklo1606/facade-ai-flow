/**
 * Конструктор «Что идёт в стоимость работ» (ADR-062, F2). Итоги сметы по порядку и строки
 * ниже «ВСЕГО по смете» (F4), у каждой «не входит / плюс / минус». Вверху живой пример на
 * смете: слагаемое с суммой и строкой файла, итог. Строки нет в смете — «нет строки», а не
 * ноль. Сохранение даёт новую редакцию «Требует согласования», подтверждает менеджер.
 * Пересчёт записей показывается тостом с отменой 6 секунд.
 */
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/kit/controls";
import { Sheet, SidePanel } from "@/components/ui/kit/sheet";
import { Chip } from "@/components/ui/kit/status";
import { notify } from "@/components/ui/kit/toast";
import { useIsDesktop } from "@/components/gas-ops/review/use-layout";
import {
  RULE_STATUS_LABEL,
  formulaOf,
  kop,
  ruleExample,
  sameTerms,
  termChoices,
  termLabel,
  useGasEstimateActions,
  useGasRuleHistory,
  validateTerms,
  type CostRule,
  type CostRuleChange,
  type CostRuleTerm,
  type EstimateVersion,
  type TermKey,
} from "@/api/gas-estimates";
import { toast } from "@/lib/toast";

type Choice = "off" | "plus" | "minus";

const CHOICES = [
  { value: "off", label: "не входит" },
  { value: "plus", label: "плюс" },
  { value: "minus", label: "минус" },
] as const satisfies readonly { value: Choice; label: string }[];

/** Выбор по строкам → слагаемые: сначала «плюс», затем «минус», каждые в порядке списка */
function termsOf(keys: TermKey[], choice: Partial<Record<TermKey, Choice>>): CostRuleTerm[] {
  const plus = keys.filter((k) => choice[k] === "plus").map((key) => ({ key, sign: 1 as const }));
  const minus = keys
    .filter((k) => choice[k] === "minus")
    .map((key) => ({ key, sign: -1 as const }));
  return [...plus, ...minus];
}

/** Текст тоста: что пересчитано и где посчитать нельзя */
function changeText(prefix: string, change: CostRuleChange): string {
  const parts = [`${prefix} Пересчитано записей: ${change.changedEntries}`];
  if (change.changedObjects) parts.push(`объектов: ${change.changedObjects}`);
  if (change.missingObjects)
    parts.push(`у объектов без строки правила стоимость не менялась: ${change.missingObjects}`);
  if (change.staleReports) parts.push(`отчётов требует обновления: ${change.staleReports}`);
  return parts.join(", ");
}

export function RuleBuilder({
  objectId,
  objectLabel,
  rule,
  companyRule,
  example,
  onClose,
}: {
  /** null — правило компании */
  objectId: string | null;
  objectLabel: string | null;
  /** Действующее правило объекта (своё или компании) или компании */
  rule: CostRule;
  companyRule: CostRule;
  /** Смета примера; null — смет ещё нет */
  example: EstimateVersion | null;
  onClose: () => void;
}) {
  const desktop = useIsDesktop();
  const actions = useGasEstimateActions();
  const own = objectId !== null && rule.objectId === objectId;
  const history = useGasRuleHistory(objectId === null || own ? rule : null);
  const keys = useMemo(() => termChoices(example?.extras ?? [], rule.terms), [example, rule]);
  const [choice, setChoice] = useState<Partial<Record<TermKey, Choice>>>(() =>
    Object.fromEntries(rule.terms.map((t) => [t.key, t.sign === 1 ? "plus" : "minus"])),
  );
  const [busy, setBusy] = useState(false);
  const terms = termsOf(keys, choice);
  const invalid = validateTerms(terms);
  const unchanged = sameTerms(terms, rule.terms) && (objectId === null || own);
  const live = example ? ruleExample(example, terms) : null;

  const save = async () => {
    if (invalid || unchanged) return;
    setBusy(true);
    const result = await actions.saveRule({ objectId, terms });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    const change = result.value;
    const revision = change.rule?.revision ?? 1;
    notify(changeText(`Правило сохранено, редакция ${revision}: требует согласования.`, change), {
      undo: () => {
        void actions.undoRule({ objectId, revision }).then((undone) => {
          if (!undone.ok) toast.error(undone.message);
          else notify(changeText("Редакция отменена.", undone.value));
        });
      },
    });
    onClose();
  };

  const content = (
    <div className="flex flex-col gap-section" data-testid="rule-builder">
      <section
        aria-labelledby="rule-example"
        className="rounded-card border border-line-2 p-card"
        data-testid="rule-example"
      >
        <h3 id="rule-example" className="text-meta-strong text-text-2">
          {example
            ? `Пример: смета версии ${example.version}, ${example.fileName}`
            : "Пример на смете"}
        </h3>
        {!example ? (
          <p className="mt-1 text-meta text-text-3">
            Смет ещё нет: пример появится после загрузки первой сметы.
          </p>
        ) : (
          <>
            <ul className="mt-2 flex flex-col gap-1 text-body">
              {live!.terms.map((t) => (
                <li key={t.key} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0">
                    {t.sign === 1 ? "плюс" : "минус"} {t.label}
                    <span className="block text-meta text-text-3 tnum">
                      {t.source ? `строка ${t.source.row}` : "нет строки в смете"}
                    </span>
                  </span>
                  <span className="shrink-0 tnum">
                    {t.source ? kop(t.source.kopecks) : "нет строки"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 border-t border-line pt-2 text-title tnum" data-testid="rule-total">
              {live!.result.ok
                ? kop(live!.result.kopecks)
                : terms.length === 0
                  ? "Ничего не выбрано"
                  : "Посчитать нельзя"}
            </p>
            {!live!.result.ok && live!.result.missing.length > 0 ? (
              <p className="text-meta text-warn">
                В этой смете нет строки:{" "}
                {live!.result.missing.map((k) => `«${termLabel(k)}»`).join(", ")}. Объект с такой
                сметой останется без стоимости, а не с нулём.
              </p>
            ) : null}
          </>
        )}
      </section>

      <section aria-labelledby="rule-terms" className="flex flex-col gap-2">
        <h3 id="rule-terms" className="text-meta-strong text-text-2">
          Строки сметы
        </h3>
        <ul className="flex flex-col [&>li+li]:border-t [&>li+li]:border-line">
          {keys.map((key) => {
            const source = example
              ? ruleExample(example, [{ key, sign: 1 }]).terms[0]!.source
              : null;
            return (
              <li key={key} className="flex flex-col gap-2 py-2" data-testid={`rule-term-${key}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 text-body">
                    {termLabel(key)}
                    {key.startsWith("extra:") ? (
                      <span className="block text-meta text-text-3">ниже «ВСЕГО по смете»</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-meta text-text-3 tnum">
                    {!example
                      ? null
                      : source
                        ? `${kop(source.kopecks)} · строка ${source.row}`
                        : "нет строки"}
                  </span>
                </div>
                <Segmented
                  label={termLabel(key)}
                  options={CHOICES}
                  value={choice[key] ?? "off"}
                  onChange={(next) => setChoice((c) => ({ ...c, [key]: next }))}
                />
              </li>
            );
          })}
        </ul>
      </section>

      <p className="text-body" data-testid="rule-builder-formula">
        Формула: {formulaOf({ ...rule, terms })}
      </p>
      {invalid ? <p className="text-meta text-warn">{invalid}</p> : null}
      <p className="text-meta text-text-3">
        Сохранение даёт новую редакцию со статусом «Требует согласования», её подтверждает менеджер.
        Стоимость объектов с подтверждённой сметой и их непроверенные записи пересчитаются сразу,
        отменить можно 6 секунд.
        {objectId !== null ? ` Правило компании: ${formulaOf(companyRule)}.` : ""}
      </p>

      {history.length > 0 ? (
        <section aria-labelledby="rule-history" className="flex flex-col gap-2">
          <h3 id="rule-history" className="text-meta-strong text-text-2">
            История редакций
          </h3>
          <ol className="flex flex-col gap-2" data-testid="rule-history">
            {history.map((r) => (
              <li key={r.revision} className="rounded-control bg-surface-2 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-meta-strong tnum">Редакция {r.revision}</span>
                  <Chip tone={r.confirmed ? "ok" : "decide"}>
                    {RULE_STATUS_LABEL[r.confirmed ? "confirmed" : "needs-agreement"]}
                  </Chip>
                </div>
                <p className="text-body">{r.formula}</p>
                <p className="text-meta text-text-3">
                  {r.samePerson
                    ? `Сохранил и подтвердил один человек: ${r.saved}. Подтвердил: ${r.confirmed}`
                    : `Сохранил: ${r.saved}${r.confirmed ? `. Подтвердил: ${r.confirmed}` : ""}`}
                </p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );

  const footer = (
    <>
      <Button
        variant="primary"
        className="flex-1"
        disabled={!!invalid || unchanged}
        loading={busy}
        loadingText="Сохраняю..."
        onClick={() => void save()}
      >
        Сохранить редакцию
      </Button>
      <Button variant="secondary" onClick={onClose}>
        Отмена
      </Button>
    </>
  );
  const title = objectId === null ? "Что идёт в стоимость работ" : "Своё правило для объекта";
  const eyebrow = objectLabel ?? "Правило компании";
  return desktop ? (
    <SidePanel
      open
      onOpenChange={(next) => (next ? undefined : onClose())}
      eyebrow={eyebrow}
      title={title}
      actions={footer}
    >
      {content}
    </SidePanel>
  ) : (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      id="rule-builder"
      title={title}
      description={eyebrow}
      actions={footer}
    >
      {content}
    </Sheet>
  );
}
