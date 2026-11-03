import { completePageHead } from "@/lib/page-head";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/kit/field";
import { ListRow } from "@/components/ui/kit/list";
import { PickerSheet, Sheet, SidePanel } from "@/components/ui/kit/sheet";
import { useIsDesktop } from "@/components/gas-ops/review/use-layout";
import { Chip } from "@/components/ui/kit/status";
import { notify } from "@/components/ui/kit/toast";
import { SourceMark } from "@/components/gas-ops/marks";
import { fmtRub, useGasActions, useGasActor, useGasDirectory } from "@/api/gas-ops";
import {
  ESTIMATE_FORMAT_LABEL,
  PARSE_STATUS_LABEL,
  RULE_STATUS_LABEL,
  estimateVersionView,
  formulaOf,
  normText,
  recalcNote,
  ESTIMATE_TEMPLATE,
  downloadTemplate,
  suggestEstimateObject,
  useGasEstimateActions,
  useGasWorkCost,
  type CostRule,
  type EstimateVersion,
  type WorkCostRow,
} from "@/api/gas-estimates";
import { toast } from "@/lib/toast";
import { ImportWizard, type WizardState } from "@/components/gas-ops/import/ImportWizard";
import { RuleBuilder } from "@/components/gas-ops/estimates/RuleBuilder";
import { cn } from "@/lib/utils";

/**
 * Стоимость работ и сметы (ADR-053; вид ADR-052). Файл сметы читается в браузере и не уходит
 * на сервер: итоги достаются по строкам с номерами, расхождения показываются, а не прячутся.
 * Стоимость объекта — из последней подтверждённой версии по правилу состава. Объекты без
 * сметы (котлы) — ручной ввод с комментарием.
 */
export const Route = createFileRoute("/gas/estimates")({
  head: () =>
    completePageHead(
      { meta: [{ title: "Стоимость работ · Учёт выработки бригад" }] },
      "Стоимость работ · Учёт выработки бригад",
      "Стоимость работ из смет заказчика: разбор файла, правило состава, версии и ручной ввод.",
    ),
  component: EstimatesPage,
});

function EstimatesPage() {
  const { rows, unlinked, companyRule, versions, latestUploaded } = useGasWorkCost();
  const actor = useGasActor();
  const actions = useGasActions();
  const estimateActions = useGasEstimateActions();
  const directory = useGasDirectory();
  const [upload, setUpload] = useState(false);
  const [vat, setVat] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Record<string, string | null>>({});
  const [manual, setManual] = useState(false);
  const [picker, setPicker] = useState(false);
  const [objectId, setObjectId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  // Конструктор правила (F2): компании или объекта, пример на смете версии
  const [builder, setBuilder] = useState<{
    objectId: string | null;
    versionId: string | null;
  } | null>(null);
  // Разбор с поправками мастера: лист, колонка сумм, строка начала (ADR-061, 12)
  const parsedOf = (state: WizardState) =>
    state.tools.parseEstimateWorkbook(state.sheets, {
      sheet: state.sheets[state.sheetIndex]?.name ?? null,
      amountCol: state.map["amount"] ?? null,
      fromRow: state.headerRow + 1,
    });

  const value = Number(amount.replace(/[\s\u00a0]/g, "").replace(",", "."));
  const amountError = !amount.trim()
    ? "Укажите сумму"
    : !Number.isFinite(value) || value <= 0
      ? "Сумма числом больше нуля"
      : null;
  const noteError = note.trim() ? null : "Напишите, откуда сумма";
  const object = directory.objects.find((o) => o.id === objectId) ?? null;
  const opened = versions.find((v) => v.id === openId) ?? null;
  const pending = versions.filter((v) => v.confirmedAt === null);
  const ruleOf = (objectIdOf: string | null): CostRule =>
    rows.find((r) => r.object.id === objectIdOf)?.rule ?? companyRule;

  const save = async () => {
    setTried(true);
    if (!objectId || amountError || noteError) return;
    const result = await actions.setEstimate({ objectId, amountRub: value, note: note.trim() });
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    notify(
      `Стоимость сохранена вручную: ${fmtRub(result.value.amountRub)}, версия ${result.value.version}`,
    );
    setAmount("");
    setNote("");
    setTried(false);
    setManual(false);
  };

  return (
    <div className="flex flex-col gap-block">
      <RuleCard
        formula={formulaOf(companyRule)}
        status={companyRule.status}
        revision={companyRule.revision ?? 1}
        canConfirm={actor.canManageEstimates}
        onSetup={() => setBuilder({ objectId: null, versionId: null })}
        onConfirm={async () => {
          const result = await estimateActions.confirmRule({
            objectId: null,
            terms: companyRule.terms,
          });
          if (result.ok) notify("Правило подтверждено для компании и записано в журнал");
          else toast.error(result.message);
        }}
      />

      {actor.canManageEstimates ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => setUpload(true)} iconEnd={<Upload />}>
            Загрузить смету
          </Button>
          <Button variant="secondary" onClick={() => setManual(true)}>
            Ввести вручную
          </Button>
          <Button
            variant="quiet"
            onClick={async () => {
              const done = await downloadTemplate(ESTIMATE_TEMPLATE, "Шаблон_сметы.xlsx");
              if (!done.ok) toast.error(done.message);
            }}
          >
            <Download aria-hidden />
            Скачать шаблон
          </Button>
        </div>
      ) : null}

      {pending.length > 0 ? (
        <section aria-labelledby="estimates-pending">
          <h2 id="estimates-pending" className="flex h-7 items-center text-meta text-text-3">
            Ждут подтверждения
          </h2>
          <ul className="surface-1 overflow-hidden [&>li+li]:border-t [&>li+li]:border-line">
            {pending.map((v) => {
              const linked = rows.find((r) => r.object.id === v.objectId)?.object ?? null;
              const view = estimateVersionView(v, ruleOf(v.objectId));
              return (
                <li key={v.id}>
                  <ListRow
                    title={linked ? `${linked.code} · ${linked.label}` : "Смета без объекта"}
                    meta={
                      <span className="inline-flex min-w-0 items-center gap-1.5">
                        <span
                          aria-hidden
                          className={cn(
                            "size-2 shrink-0 rounded-full",
                            v.parseStatus === "parsed" ? "bg-info" : "bg-warn",
                          )}
                        />
                        <span className="truncate">
                          {PARSE_STATUS_LABEL[v.parseStatus]} · версия {v.version}
                        </span>
                      </span>
                    }
                    value={view.costRub !== null ? fmtRub(view.costRub) : "нет итога"}
                    valueMeta="кандидат"
                    onClick={() => setOpenId(v.id)}
                    data-testid="estimate-pending"
                  />
                </li>
              );
            })}
          </ul>
          {unlinked.length > 0 ? (
            <p className="mt-1 text-meta text-text-3">
              Смет без объекта: {unlinked.length}. Откройте и привяжите к объекту справочника.
            </p>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="estimates-list">
        <h2 id="estimates-list" className="flex h-7 items-center text-meta text-text-3">
          Объекты и стоимость работ
        </h2>
        <ul className="surface-1 overflow-hidden [&>li+li]:border-t [&>li+li]:border-line">
          {rows.map((row) => (
            <li key={row.object.id}>
              <ObjectRow row={row} />
            </li>
          ))}
        </ul>
      </section>

      <ImportWizard
        open={upload}
        onOpenChange={setUpload}
        id="estimate-upload"
        title="Загрузить смету"
        description="ГРАНД-Смета или ресурсная смета 14 граф, xlsx или xls"
        fileTestId="estimate-file"
        fields={[{ key: "amount", label: "Суммы (всего в текущем уровне цен)", required: true }]}
        template={{ fileName: "Шаблон_сметы.xlsx", rows: ESTIMATE_TEMPLATE }}
        defaultSheet={(tools, sheets) => {
          const best = tools.parseEstimateWorkbook(sheets).sheet;
          return Math.max(
            0,
            sheets.findIndex((sheet) => sheet.name === best),
          );
        }}
        detect={(tools, grid) => {
          const col = tools.detectAmountCol(grid);
          // Строка заголовка — та, где подпись колонки сумм; без формы — первая строка
          const headerRow =
            col === null
              ? 0
              : Math.max(
                  0,
                  grid.findIndex((row) => typeof row[col] === "string"),
                );
          const parsed = tools.parseEstimateGrid(grid);
          setVat(tools.guessVatIncluded(parsed));
          return { headerRow, map: { amount: col } };
        }}
        options={
          <div role="radiogroup" aria-label="Цены в смете" className="flex flex-wrap gap-2">
            {(
              [
                [false, "Цены без НДС"],
                [true, "Цены с НДС"],
              ] as const
            ).map(([value, text]) => (
              <button
                key={text}
                type="button"
                role="radio"
                aria-checked={vat === value}
                onClick={() => setVat(value)}
                className={`inline-flex min-h-11 items-center rounded-full px-4 text-body focus-ring ${
                  vat === value ? "bg-pill text-pill-text" : "bg-surface-2 text-text"
                }`}
              >
                {text}
              </button>
            ))}
          </div>
        }
        recognized={(state) => parsedOf(state).format !== null}
        evaluate={(state) => {
          const parsed = parsedOf(state);
          const total = parsed.totals.total;
          const withoutVat = parsed.totals.withoutVat;
          return {
            check: state.tools.estimateCheck(parsed, vat),
            canApply: parsed.format !== null,
            preview: (
              <div className="flex flex-col gap-1 text-meta text-text-2 tnum">
                <p className="text-body text-text">
                  {parsed.format ? ESTIMATE_FORMAT_LABEL[parsed.format] : "Форма не распознана"}
                  {parsed.sheet ? ` · лист «${parsed.sheet}»` : ""}
                </p>
                {withoutVat ? (
                  <p>
                    Итог без НДС: {fmtRub(withoutVat.kopecks / 100)}, строка {withoutVat.row}
                  </p>
                ) : null}
                {total ? (
                  <p>
                    ВСЕГО по смете: {fmtRub(total.kopecks / 100)}, строка {total.row}
                  </p>
                ) : null}
                <p>Разделов: {parsed.sections.length}</p>
                {parsed.extras.length ? (
                  <p>
                    Ниже «ВСЕГО по смете»:{" "}
                    {parsed.extras
                      .map((e) => `${e.label} ${fmtRub(e.kopecks / 100)}, строка ${e.row}`)
                      .join("; ")}
                    . Взять в стоимость можно в правиле.
                  </p>
                ) : null}
                <p className="text-text">
                  Добавится версия сметы. Стоимость работ по правилу будет кандидатом с меткой
                  «требует подтверждения»: её подтверждает менеджер.
                </p>
              </div>
            ),
          };
        }}
        onApply={async (state) => {
          const parsed = parsedOf(state);
          const added = await estimateActions.addVersion({
            parsed,
            fileName: state.fileName,
            objectId: null,
          });
          if (!added.ok) {
            toast.error(added.message);
            return false;
          }
          const suggestion = await suggestEstimateObject(state.fileName, directory.objects);
          setSuggestions((s) => ({ ...s, [added.value.id]: suggestion }));
          setOpenId(added.value.id);
          notify(`Смета загружена: версия ${added.value.version}`, {
            undo: () => {
              setOpenId(null);
              void estimateActions.discard(added.value.id);
            },
          });
          return true;
        }}
      />

      {opened ? (
        <VersionSheet
          version={opened}
          suggestion={suggestions[opened.id] ?? null}
          rule={ruleOf(opened.objectId)}
          canManage={actor.canManageEstimates}
          onClose={() => setOpenId(null)}
          onManual={() => {
            setOpenId(null);
            setManual(true);
          }}
          onRule={(objectIdOf) => {
            setOpenId(null);
            setBuilder({ objectId: objectIdOf, versionId: opened.id });
          }}
        />
      ) : null}

      {builder ? (
        <RuleBuilder
          key={`${builder.objectId ?? "company"}-${builder.versionId ?? ""}`}
          objectId={builder.objectId}
          objectLabel={(() => {
            const o = directory.objects.find((x) => x.id === builder.objectId);
            return o ? `${o.code} · ${o.label}` : null;
          })()}
          rule={builder.objectId ? ruleOf(builder.objectId) : companyRule}
          companyRule={companyRule}
          example={versions.find((v) => v.id === builder.versionId) ?? latestUploaded}
          onClose={() => setBuilder(null)}
        />
      ) : null}

      <Sheet
        open={manual}
        onOpenChange={setManual}
        id="estimate-manual"
        title="Ручной ввод стоимости"
        description="Для объектов без сметы: котлы и мелкие работы"
        actions={
          <>
            <Button variant="primary" className="flex-1" onClick={() => void save()}>
              Сохранить
            </Button>
            <Button variant="secondary" onClick={() => setManual(false)}>
              Отмена
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-block">
          <div className="flex flex-col gap-1">
            <span className="text-meta text-text-2">Объект</span>
            <Button
              variant="secondary"
              className={cn("justify-start", tried && !objectId && "border-danger text-danger")}
              onClick={() => setPicker(true)}
            >
              <span className="truncate">
                {object ? `${object.code} · ${object.label}` : "Выберите объект"}
              </span>
            </Button>
            {tried && !objectId ? (
              <p role="alert" className="text-meta text-danger">
                Выберите объект
              </p>
            ) : null}
          </div>
          <Field
            label="Стоимость работ"
            value={amount}
            onChange={setAmount}
            inputMode="decimal"
            placeholder="14 700"
            unit="₽"
            error={amountError}
            showError={tried}
          />
          <Field
            label="Комментарий"
            value={note}
            onChange={setNote}
            placeholder="Откуда сумма: договор, прайс, согласование"
            error={noteError}
            showError={tried}
          />
          <p className="text-meta text-text-3">
            Источник «вручную». Сохранение создаёт новую версию стоимости, пересчитывает
            неподтверждённые записи объекта и пишется в журнал действий.
          </p>
        </div>
      </Sheet>

      <PickerSheet
        open={picker}
        onOpenChange={setPicker}
        title="Объект"
        searchLabel="Адрес или номер"
        value={objectId}
        onPick={setObjectId}
        options={directory.objects.map((o) => ({ value: o.id, label: o.label, meta: o.code }))}
      />
    </div>
  );
}

/** Правило состава стоимости работ: формула словами и статус согласования */
function RuleCard({
  formula,
  status,
  revision,
  canConfirm,
  onSetup,
  onConfirm,
}: {
  formula: string;
  status: CostRule["status"];
  revision: number;
  canConfirm: boolean;
  onSetup: () => void;
  onConfirm: () => void;
}) {
  return (
    <section aria-labelledby="cost-rule" className="surface-1 flex flex-col gap-2 p-card">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="cost-rule" className="text-heading">
          Стоимость работ для выработки
        </h2>
        <Chip tone={status === "confirmed" ? "ok" : "decide"}>{RULE_STATUS_LABEL[status]}</Chip>
        <span className="text-meta text-text-3 tnum">редакция {revision}</span>
      </div>
      <p className="text-body" data-testid="cost-rule-formula">
        {formula}
      </p>
      <p className="text-meta text-text-3">
        Правило подтверждает сметчик или менеджер один раз на компанию, для отдельного объекта его
        можно переопределить в шторке сметы. Какие строки входят, решает заказчик в «Настроить».
      </p>
      {canConfirm ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={onSetup}>
            Настроить
          </Button>
          {status !== "confirmed" ? (
            <Button variant="secondary" size="sm" onClick={onConfirm}>
              Подтвердить правило
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

const ESTIMATE_STATUS: Record<string, { word: string; dot: string }> = {
  confirmed: { word: "Подтверждена", dot: "bg-ok" },
  "manual-pending": { word: "Ждёт подтверждения", dot: "bg-warn" },
  missing: { word: "Нет сметы", dot: "bg-text-3" },
};

function ObjectRow({ row }: { row: WorkCostRow }) {
  const { object, estimate, confirmed, norm } = row;
  const ownRule = row.rule.objectId === object.id;
  const status = ESTIMATE_STATUS[estimate?.status ?? "missing"]!;
  const origin =
    estimate?.origin === "manual"
      ? "вручную"
      : confirmed
        ? `смета, версия ${confirmed.version}`
        : null;
  return (
    <ListRow
      title={object.label}
      meta={
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <span aria-hidden className={cn("size-2 shrink-0 rounded-full", status.dot)} />
          <span className="truncate">
            {status.word} · {object.code}
            {origin ? ` · ${origin}` : ""}
            {ownRule ? " · своё правило" : ""}
            {normText(norm) ? ` · ${normText(norm)}` : ""}
          </span>
        </span>
      }
      value={
        !estimate || estimate.status === "missing" ? (
          <span className="font-normal text-warn">нет сметы</span>
        ) : (
          fmtRub(estimate.amountRub)
        )
      }
      valueMeta={estimate ? <SourceMark source={estimate.source} /> : undefined}
    />
  );
}

/** Разбор версии: статус, замечания со строками, итоги, разделы, привязка и подтверждение */
function VersionSheet({
  version,
  suggestion,
  rule,
  canManage,
  onClose,
  onManual,
  onRule,
}: {
  version: EstimateVersion;
  suggestion: string | null;
  rule: CostRule;
  canManage: boolean;
  onClose: () => void;
  onManual: () => void;
  /** Конструктор своего правила объекта (F2) */
  onRule: (objectId: string) => void;
}) {
  const directory = useGasDirectory();
  const estimateActions = useGasEstimateActions();
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const object = directory.objects.find((o) => o.id === version.objectId) ?? null;
  const suggested =
    !object && suggestion ? (directory.objects.find((o) => o.id === suggestion) ?? null) : null;
  const view = estimateVersionView(version, rule);
  const ready = view.ready;
  const confirmed = version.confirmedAt !== null;
  const ownRule = rule.objectId !== null && rule.objectId === version.objectId;
  const desktop = useIsDesktop();

  const link = async (id: string) => {
    const result = await estimateActions.link({ id: version.id, objectId: id });
    if (!result.ok) toast.error(result.message);
  };

  const confirm = async () => {
    setBusy(true);
    const result = await estimateActions.confirm(version.id);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    const { estimate, changedEntries, waitingEntries, lockedEntries, keptEntries, staleReports } =
      result.value;
    notify(
      `Смета подтверждена: ${fmtRub(estimate.amountRub)}. ${recalcNote({
        changed: changedEntries,
        waiting: waitingEntries,
        locked: lockedEntries,
        kept: keptEntries,
      })}${staleReports ? `, отчётов требует обновления: ${staleReports}` : ""}`,
    );
    onClose();
  };

  const footer =
    canManage && !confirmed ? (
      <Button
        variant="primary"
        className="flex-1"
        size="field"
        disabled={!ready.ok}
        loading={busy}
        loadingText="Подтверждаю..."
        onClick={() => void confirm()}
        iconEnd={<ArrowRight />}
      >
        Подтвердить смету
      </Button>
    ) : undefined;
  const content = (
    <>
      <div className="flex flex-col gap-section" data-testid="estimate-parsed">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={version.parseStatus === "parsed" ? "ok" : "decide"}>
            {PARSE_STATUS_LABEL[version.parseStatus]}
          </Chip>
          {confirmed ? <Chip tone="sky">Подтверждена</Chip> : null}
          {version.issuesReviewedBy ? <Chip tone="info">Замечания проверены</Chip> : null}
        </div>

        {version.issues.length > 0 ? (
          <section aria-labelledby="estimate-issues" className="flex flex-col gap-2">
            <h3 id="estimate-issues" className="text-meta-strong text-text-2">
              Что проверить сметчику
            </h3>
            <ul className="flex flex-col gap-2">
              {version.issues.map((issue, i) => (
                <li key={i} className="rounded-control bg-warn-bg px-3 py-2 text-meta text-warn">
                  {issue.row ? <span className="tnum">Строка {issue.row}: </span> : null}
                  {issue.message}
                </li>
              ))}
            </ul>
            {canManage && !version.issuesReviewedBy && version.parseStatus === "needs-review" ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    const result = await estimateActions.reviewIssues(version.id);
                    if (!result.ok) toast.error(result.message);
                  }}
                >
                  Замечания проверены
                </Button>
                <Button variant="quiet" size="sm" onClick={onManual}>
                  Ввести сумму вручную
                </Button>
              </div>
            ) : null}
          </section>
        ) : null}

        <section aria-labelledby="estimate-object" className="flex flex-col gap-2">
          <h3 id="estimate-object" className="text-meta-strong text-text-2">
            Объект
          </h3>
          {object ? (
            <p className="text-body">
              {object.code} · {object.label}
            </p>
          ) : suggested ? (
            <>
              <p className="text-body">
                Похоже на {suggested.code} · {suggested.label}
              </p>
              <p className="text-meta text-text-3">
                Подсказка по имени файла. Подтвердите или выберите сами.
              </p>
            </>
          ) : (
            <p className="text-meta text-text-3">
              Объект по имени файла не определён: выберите из справочника.
            </p>
          )}
          {canManage && !confirmed ? (
            <div className="flex flex-wrap gap-2">
              {suggested ? (
                <Button variant="secondary" size="sm" onClick={() => void link(suggested.id)}>
                  Да, {suggested.code}
                </Button>
              ) : null}
              <Button variant="quiet" size="sm" onClick={() => setPicker(true)}>
                {object ? "Сменить объект" : "Выбрать объект"}
              </Button>
            </div>
          ) : null}
        </section>

        <section aria-labelledby="estimate-totals">
          <h3 id="estimate-totals" className="text-meta-strong text-text-2">
            Итоги сметы
          </h3>
          <table className="mt-1 w-full text-body">
            <tbody className="divide-y divide-line">
              {view.totals.map((row) => (
                <tr key={row.key}>
                  <th scope="row" className="py-2 pe-3 text-left font-normal text-text-2">
                    {row.label}
                    <span className="block text-meta text-text-3">строка {row.row}</span>
                  </th>
                  <td className="py-2 text-right tnum">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {view.sections.length > 0 ? (
          <section aria-labelledby="estimate-sections">
            <h3 id="estimate-sections" className="text-meta-strong text-text-2">
              Разделы
            </h3>
            <table className="mt-1 w-full text-body">
              <tbody className="divide-y divide-line">
                {view.sections.map((section) => (
                  <tr key={section.row}>
                    <th scope="row" className="py-2 pe-3 text-left font-normal">
                      {section.title}
                      <span className="block text-meta text-text-3">строка {section.row}</span>
                    </th>
                    <td className="py-2 text-right tnum">{section.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {view.sectionsNote ? (
              <p className="mt-1 text-meta text-text-3">{view.sectionsNote}</p>
            ) : null}
          </section>
        ) : null}

        {view.extras.length > 0 ? (
          <section aria-labelledby="estimate-extras">
            <h3 id="estimate-extras" className="text-meta-strong text-text-2">
              Ниже «ВСЕГО по смете»
            </h3>
            <table className="mt-1 w-full text-body">
              <tbody className="divide-y divide-line">
                {view.extras.map((extra) => (
                  <tr key={extra.row}>
                    <th scope="row" className="py-2 pe-3 text-left font-normal">
                      {extra.label}
                      <span className="block text-meta text-text-3">строка {extra.row}</span>
                    </th>
                    <td className="py-2 text-right tnum">{extra.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-meta text-text-3">
              В итог не входят. Взять в стоимость можно в «Своё правило для объекта» или в правиле
              компании.
            </p>
          </section>
        ) : null}

        {view.labor ? (
          <p className="text-body">
            Трудозатраты рабочих по смете: <span className="tnum">{view.labor.value}</span>{" "}
            <span className="text-meta text-text-3">· строка {view.labor.row}</span>
          </p>
        ) : null}

        <section
          aria-labelledby="estimate-cost"
          className="rounded-card border border-line-2 p-card"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h3 id="estimate-cost" className="text-heading">
              Стоимость работ
            </h3>
            {ownRule ? <Chip tone="info">Своё правило</Chip> : null}
            <Chip tone={rule.status === "confirmed" ? "ok" : "decide"}>
              {RULE_STATUS_LABEL[rule.status]}
            </Chip>
          </div>
          <p className="mt-1 text-title tnum" data-testid="estimate-candidate">
            {view.cost ?? "Нет строк для правила"}
          </p>
          <p className="mt-1 text-meta text-text-2">
            {view.formula}
            {view.costRub !== null ? `. В записи идёт целыми рублями: ${fmtRub(view.costRub)}` : ""}
          </p>
          {!ready.ok && !confirmed ? (
            <p className="mt-2 text-meta text-warn">{ready.reason}</p>
          ) : null}
          {canManage && version.objectId ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => onRule(version.objectId!)}>
                Своё правило для объекта
              </Button>
              {ownRule && rule.status !== "confirmed" ? (
                <Button
                  variant="quiet"
                  size="sm"
                  onClick={async () => {
                    const result = await estimateActions.confirmRule({
                      objectId: version.objectId,
                      terms: rule.terms,
                    });
                    if (result.ok) notify("Правило объекта подтверждено и записано в журнал");
                    else toast.error(result.message);
                  }}
                >
                  Подтвердить правило объекта
                </Button>
              ) : null}
              {ownRule ? (
                <Button
                  variant="quiet"
                  size="sm"
                  onClick={async () => {
                    const result = await estimateActions.resetObjectRule(version.objectId!);
                    if (result.ok)
                      notify(
                        `Объект снова по правилу компании. Пересчитано записей: ${result.value.changedEntries}`,
                      );
                    else toast.error(result.message);
                  }}
                >
                  Вернуть правило компании
                </Button>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

      <PickerSheet
        open={picker}
        onOpenChange={setPicker}
        title="Объект сметы"
        searchLabel="Адрес или номер"
        value={version.objectId}
        onPick={(id) => void link(id)}
        options={directory.objects.map((o) => ({ value: o.id, label: o.label, meta: o.code }))}
      />
    </>
  );
  // Компьютер: деталь справа 420, как у записи и объекта; телефон: шторка
  return desktop ? (
    <SidePanel
      open
      onOpenChange={(next) => (next ? undefined : onClose())}
      eyebrow={`Версия ${version.version}. Итоги с номерами строк файла`}
      title={version.format ? ESTIMATE_FORMAT_LABEL[version.format] : "Разбор сметы"}
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
      id="estimate-version"
      title={version.format ? ESTIMATE_FORMAT_LABEL[version.format] : "Разбор сметы"}
      description={`Версия ${version.version}. Итоги с номерами строк файла`}
      actions={footer}
    >
      {content}
    </Sheet>
  );
}
