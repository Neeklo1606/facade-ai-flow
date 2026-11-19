/**
 * Папка смет на сервисе (ADR-077): перетащить файлы или выбрать, у каждого статус, карточка
 * сметы со строками источника, объект «Прикрепить» или «Создать», разделы с работами без
 * материалов и опрессовкой отдельно. Деньги объекта подтверждаются в разборе версии, как раньше.
 */
import { useRef, useState, type DragEvent } from "react";
import { AlertTriangle, ArrowRight, FileSpreadsheet, RefreshCw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/kit/field";
import { PickerSheet, Sheet, SidePanel } from "@/components/ui/kit/sheet";
import { Chip, type ChipTone } from "@/components/ui/kit/status";
import { notify } from "@/components/ui/kit/toast";
import { useIsDesktop } from "@/components/gas-ops/review/use-layout";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  useEstimateIntake,
  type EstimateCard,
  type EstimateHeader,
  type HeaderField,
  type ObjectDraft,
  type PressureMode,
  type UploadRow,
} from "@/api/gas-estimate-intake";

const rub = (kopecks: number | null) =>
  kopecks === null
    ? "нет в файле"
    : `${(kopecks / 100).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;

const TONE: Record<"parsed" | "needs-review" | "unreadable", ChipTone> = {
  parsed: "ok",
  "needs-review": "decide",
  unreadable: "block",
};
const WORD: Record<"parsed" | "needs-review" | "unreadable", string> = {
  parsed: "Распознана",
  "needs-review": "Нужна проверка",
  unreadable: "Не распознана",
};

export function EstimateIntake({
  canUpload,
  onOpenVersion,
}: {
  canUpload: boolean;
  /** Разбор версии с подтверждением стоимости: прежний экран версии */
  onOpenVersion: (versionId: string) => void;
}) {
  const intake = useEstimateIntake();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [last, setLast] = useState<UploadRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  const send = async (list: File[]) => {
    if (!list.length) return;
    const rows = await intake.upload(list);
    setLast(rows);
    const added = rows.filter((r) => r.outcome?.kind === "added").length;
    const twins = rows.filter((r) => r.outcome?.kind === "duplicate").length;
    const failedCount = rows.filter((r) => !r.ok).length;
    notify(
      rows.length === 1
        ? `${rows[0]!.name}: ${rows[0]!.text}`
        : [
            `Новых смет: ${added}`,
            twins ? `уже загружены: ${twins}` : null,
            failedCount ? `не приняты: ${failedCount}` : null,
          ]
            .filter(Boolean)
            .join(", "),
    );
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    if (!canUpload || intake.busy) return;
    void send([...event.dataTransfer.files]);
  };

  return (
    <section
      aria-labelledby="estimate-intake"
      className="surface-1 overflow-hidden"
      data-testid="estimate-intake"
    >
      <div className="flex flex-col gap-3 px-row py-row">
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="mt-0.5 size-5 shrink-0 text-text-3" aria-hidden />
          <div className="min-w-0">
            <h2 id="estimate-intake" className="text-body-strong">
              Папка смет
            </h2>
            <p className="text-meta text-text-3">
              Перетащите файлы смет .xls и .xlsx, можно несколько сразу. Объект и разделы система
              предложит сама, решаете вы.
            </p>
          </div>
        </div>
        {canUpload ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
            data-testid="estimate-drop"
            className={cn(
              "flex flex-col items-center gap-2 rounded-card border border-dashed p-card text-center",
              over ? "border-accent bg-panel-2" : "border-line-2",
            )}
          >
            <p className="text-meta text-text-2">
              {intake.busy
                ? "Читаю файлы и ищу объекты…"
                : "Перетащите сюда или выберите на компьютере"}
            </p>
            <Button
              variant="secondary"
              disabled={intake.busy}
              onClick={() => input.current?.click()}
              iconEnd={<Upload />}
            >
              Выбрать файлы
            </Button>
            <input
              ref={input}
              type="file"
              multiple
              accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              aria-label="Файлы смет"
              data-testid="estimate-files-input"
              onChange={(e) => {
                const list = [...(e.target.files ?? [])];
                e.target.value = "";
                void send(list);
              }}
            />
          </div>
        ) : null}
        {last.length ? (
          <ul className="flex flex-col gap-1" role="status" data-testid="estimate-upload-result">
            {last.map((r, i) => (
              <li key={`${r.name}-${i}`} className="text-meta">
                <span className="text-text-2">{r.name}</span>
                <span className={r.ok ? "text-text-3" : "text-warn"}>: {r.text}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {intake.files.length ? (
        <ul className="border-t border-line [&>li+li]:border-t [&>li+li]:border-line">
          {intake.files.map((row) => (
            <li
              key={row.file.id}
              className="flex min-h-12 flex-wrap items-center justify-between gap-2 px-row py-2"
              data-testid="estimate-file"
            >
              <button
                type="button"
                className="focus-ring min-w-0 flex-1 rounded-control text-left disabled:cursor-default"
                disabled={!row.version}
                onClick={() => row.version && setOpenId(row.version.id)}
              >
                <span className="block truncate text-body">
                  {row.object ? `${row.object.code} · ${row.object.label}` : row.file.name}
                </span>
                <span className="block text-meta text-text-3">{row.status}</span>
              </button>
              <span className="flex items-center gap-2">
                <Chip tone={TONE[row.file.status]}>{WORD[row.file.status]}</Chip>
                {canUpload && !row.version?.confirmedAt ? (
                  <Button
                    variant="quiet"
                    size="sm"
                    aria-label={`Разобрать заново ${row.file.name}`}
                    onClick={async () => {
                      const result = await intake.reparse(row.file.id);
                      if (result.ok) notify(result.value);
                      else toast.error(result.message);
                    }}
                  >
                    <RefreshCw aria-hidden />
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {openId ? (
        <CardPanel
          versionId={openId}
          canEdit={canUpload}
          onClose={() => setOpenId(null)}
          onOpenVersion={(id) => {
            setOpenId(null);
            onOpenVersion(id);
          }}
        />
      ) : null}
    </section>
  );
}

/* ---------------------------------------------------------------- Карточка */

const HEADER_ROWS: [keyof EstimateHeader, string][] = [
  ["works", "Наименование работ"],
  ["object", "Наименование объекта"],
  ["address", "Адрес"],
  ["number", "Номер сметы"],
  ["date", "Дата"],
  ["workKind", "Вид работ"],
];

function headerValue(field: HeaderField | EstimateHeader["address"]): string | null {
  if (field.value === null) return null;
  if (typeof field.value === "string") {
    return /^\d{4}-\d{2}-\d{2}$/.test(field.value)
      ? field.value.split("-").reverse().join(".")
      : field.value;
  }
  const a = field.value;
  return [
    a.settlement,
    a.street,
    a.house ? `д. ${a.house}` : null,
    a.apartment ? `кв. ${a.apartment}` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

function CardPanel({
  versionId,
  canEdit,
  onClose,
  onOpenVersion,
}: {
  versionId: string;
  canEdit: boolean;
  onClose: () => void;
  onOpenVersion: (versionId: string) => void;
}) {
  const intake = useEstimateIntake();
  const desktop = useIsDesktop();
  const [mode, setMode] = useState<PressureMode>("payroll");
  const card = intake.cardOf(versionId, mode);
  if (!card) return null;
  const title = card.object ? `${card.object.code} · ${card.object.label}` : card.draft.label;
  const footer = card.object ? (
    <Button
      variant="primary"
      className="flex-1"
      size="field"
      onClick={() => onOpenVersion(card.version.id)}
      iconEnd={<ArrowRight />}
    >
      К подтверждению стоимости
    </Button>
  ) : undefined;
  const content = <CardBody card={card} canEdit={canEdit} mode={mode} onMode={setMode} />;
  return desktop ? (
    <SidePanel
      open
      onOpenChange={(next) => (next ? undefined : onClose())}
      eyebrow={`Смета, версия ${card.version.version}`}
      title={title}
      actions={footer}
    >
      {content}
    </SidePanel>
  ) : (
    <Sheet
      open
      onOpenChange={(next) => (next ? undefined : onClose())}
      id="estimate-card"
      title={title}
      description={`Смета, версия ${card.version.version}`}
      size="full"
      actions={footer}
    >
      {content}
    </Sheet>
  );
}

function CardBody({
  card,
  canEdit,
  mode,
  onMode,
}: {
  card: EstimateCard;
  canEdit: boolean;
  mode: PressureMode;
  onMode: (mode: PressureMode) => void;
}) {
  const intake = useEstimateIntake();
  const [draft, setDraft] = useState<ObjectDraft | null>(null);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const header = card.version.header;
  const url = card.file ? intake.fileUrl(card.file) : null;
  const linesPressure = card.sections.some((s) => s.pressure?.kind === "lines");
  const confirmed = card.version.confirmedAt !== null;

  const attach = async (objectId: string) => {
    setBusy(true);
    const result = await intake.attach(card.version.id, objectId, mode);
    setBusy(false);
    if (result.ok)
      notify(`Смета прикреплена, версия ${result.value.version}. Разделы записаны в объект`);
    else toast.error(result.message);
  };

  const create = async () => {
    if (!draft) return;
    setBusy(true);
    const result = await intake.createObject(card.version.id, draft, mode);
    setBusy(false);
    if (result.ok) {
      notify(`Объект ${result.value.code} создан с разделами сметы: ${card.sections.length}`);
      setDraft(null);
    } else toast.error(result.message);
  };

  return (
    <div className="flex flex-col gap-section" data-testid="estimate-card">
      <div className="flex flex-wrap items-center gap-2">
        {card.file ? <Chip tone={TONE[card.file.status]}>{WORD[card.file.status]}</Chip> : null}
        {confirmed ? <Chip tone="sky">Стоимость подтверждена</Chip> : null}
        {url ? (
          <a className="text-meta text-text-2 underline underline-offset-4" href={url}>
            Исходный файл
          </a>
        ) : card.file ? (
          <span className="text-meta text-text-3">{card.file.name}</span>
        ) : null}
      </div>

      {card.changed && card.previousVersion ? (
        <p className="text-meta text-text-2" data-testid="estimate-changed">
          Новая версия {card.version.version} после версии {card.previousVersion}:{" "}
          {card.changed.length
            ? `изменились разделы ${card.changed.join(", ")}`
            : "разделы не изменились"}
        </p>
      ) : null}

      <section aria-labelledby="estimate-head" className="flex flex-col gap-2">
        <h3 id="estimate-head" className="text-meta-strong text-text-2">
          Из шапки сметы
        </h3>
        {header ? (
          <dl className="flex flex-col gap-2" data-testid="estimate-header">
            {HEADER_ROWS.map(([key, label]) => {
              const field = header[key];
              const value = headerValue(field);
              return (
                <div key={key} className="flex flex-col">
                  <dt className="text-meta text-text-3">{label}</dt>
                  <dd className="text-body break-words">
                    {value ?? (
                      <span className="text-text-3">
                        {"reason" in field ? field.reason : "нет"}
                      </span>
                    )}
                    {field.row !== null ? (
                      <span className="text-meta text-text-3"> · строка {field.row}</span>
                    ) : null}
                  </dd>
                </div>
              );
            })}
          </dl>
        ) : (
          <p className="text-meta text-text-3">
            Смета загружена до разбора шапки: загрузите файл снова.
          </p>
        )}
      </section>

      <section aria-labelledby="estimate-object-match" className="flex flex-col gap-2">
        <h3 id="estimate-object-match" className="text-meta-strong text-text-2">
          Объект
        </h3>
        {card.object ? (
          <p className="text-body">
            {card.object.code} · {card.object.label}
          </p>
        ) : card.matched && card.match.kind === "attach" ? (
          <p className="text-body">
            Найден объект {card.matched.code} · {card.matched.label}
            <span className="text-meta text-text-3">
              {" "}
              · совпал {card.match.by === "number" ? "номер сметы" : "адрес"}
            </span>
          </p>
        ) : card.matched ? (
          <p className="text-body">
            Возможно, это объект {card.matched.code} · {card.matched.label}
          </p>
        ) : (
          <p className="text-meta text-text-3">
            Такого объекта в справочнике нет: предлагаем создать новый.
          </p>
        )}
        {canEdit && !card.object && !draft ? (
          <div className="flex flex-wrap gap-2">
            {card.matched ? (
              <Button
                variant={card.match.kind === "attach" ? "primary" : "secondary"}
                loading={busy}
                onClick={() => void attach(card.matched!.id)}
              >
                Прикрепить к {card.matched.code}
              </Button>
            ) : null}
            <Button
              variant={card.matched ? "quiet" : "primary"}
              onClick={() => setDraft({ ...card.draft })}
              data-testid="estimate-create-object"
            >
              Создать объект
            </Button>
            <Button variant="quiet" onClick={() => setPicker(true)}>
              Выбрать объект
            </Button>
          </div>
        ) : null}
        {draft ? (
          <div className="flex flex-col gap-3 rounded-card border border-line-2 p-card">
            <p className="text-meta text-text-2">
              Проверьте поля: так объект появится в справочнике.
            </p>
            <Field
              label="Адрес или название"
              value={draft.label}
              onChange={(label) => setDraft({ ...draft, label })}
              error={draft.label.trim() ? null : "Укажите адрес"}
              showError
            />
            <Field
              label="Номер объекта"
              value={draft.code}
              onChange={(code) => setDraft({ ...draft, code })}
              hint="По умолчанию номер сметы или КП"
              error={draft.code.trim() ? null : "Укажите номер"}
              showError
            />
            <Field
              label="Вид работ"
              value={draft.workType ?? ""}
              onChange={(workType) => setDraft({ ...draft, workType: workType || null })}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                loading={busy}
                disabled={!draft.label.trim() || !draft.code.trim()}
                onClick={() => void create()}
                data-testid="estimate-create-confirm"
              >
                Создать объект
              </Button>
              <Button variant="quiet" onClick={() => setDraft(null)}>
                Отмена
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="estimate-sections-intake" className="flex flex-col gap-2">
        <h3 id="estimate-sections-intake" className="text-meta-strong text-text-2">
          Разделы
        </h3>
        {card.convergence.ok ? (
          <p className="text-meta text-text-3">
            Сумма разделов равна итогу без НДС: {rub(card.convergence.sumKopecks)}
          </p>
        ) : (
          <p
            className="flex items-start gap-2 rounded-card bg-warn-bg p-card text-meta text-warn"
            role="alert"
            data-testid="estimate-convergence"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            Сумма разделов {rub(card.convergence.sumKopecks)} не равна итогу без НДС{" "}
            {rub(card.convergence.withoutVatKopecks)}: разница {rub(card.convergence.diffKopecks)}
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {card.sections.map((s) => (
            <li
              key={s.key}
              className="rounded-card border border-line p-card"
              data-testid="estimate-section"
            >
              <p className="text-body-strong">{s.title}</p>
              <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-meta">
                <dt className="text-text-3">Итог раздела</dt>
                <dd className="tnum text-right">
                  {rub(s.totalKopecks)} <span className="text-text-3">· стр. {s.totalRow}</span>
                </dd>
                <dt className="text-text-3">Материалы</dt>
                <dd className="tnum text-right">
                  {rub(s.materialsKopecks)}
                  {s.materialsRow !== null ? (
                    <span className="text-text-3"> · стр. {s.materialsRow}</span>
                  ) : null}
                </dd>
                <dt className="text-text-2">Работы без материалов</dt>
                <dd className="tnum text-right text-body-strong">{rub(s.workKopecks)}</dd>
                <dt className="text-text-3">Нормативные чел.-ч</dt>
                <dd className="tnum text-right">
                  {s.laborHours === null
                    ? "нет в файле"
                    : s.laborHours.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
                </dd>
                {s.pressure ? (
                  <>
                    <dt className="text-text-2">
                      {s.pressure.kind === "section"
                        ? "Опрессовка: весь раздел"
                        : "В т. ч. опрессовка"}
                    </dt>
                    <dd className="tnum text-right">
                      {rub(s.pressure.workKopecks)}
                      <span className="text-text-3"> · стр. {s.pressure.rows.join(", ")}</span>
                    </dd>
                  </>
                ) : null}
                {s.pressure?.kind === "lines" && s.smrKopecks !== null ? (
                  <>
                    <dt className="text-text-3">СМР без опрессовки</dt>
                    <dd className="tnum text-right">{rub(s.smrKopecks)}</dd>
                  </>
                ) : null}
              </dl>
              {s.materialsNote ? (
                <p className="mt-1 text-meta text-text-3">{s.materialsNote}</p>
              ) : null}
              {s.pressure?.needsConfirm ? (
                <p className="mt-1 text-meta text-warn">
                  Опрессовка посчитана системой ({s.pressure.method}): требует подтверждения
                </p>
              ) : null}
            </li>
          ))}
        </ul>
        {linesPressure ? (
          <div
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label="Как считать опрессовку внутри раздела"
          >
            <span className="text-meta text-text-3">НР и СП опрессовки:</span>
            <Button
              variant={mode === "payroll" ? "secondary" : "quiet"}
              size="sm"
              aria-pressed={mode === "payroll"}
              onClick={() => onMode("payroll")}
            >
              по доле ФОТ
            </Button>
            <Button
              variant={mode === "direct" ? "secondary" : "quiet"}
              size="sm"
              aria-pressed={mode === "direct"}
              onClick={() => onMode("direct")}
            >
              по доле прямых затрат
            </Button>
          </div>
        ) : null}
      </section>

      <PickerSheet
        open={picker}
        onOpenChange={setPicker}
        title="Объект сметы"
        searchLabel="Адрес или номер"
        value={card.version.objectId}
        onPick={(id) => void attach(id)}
        options={intake.objects.map((o) => ({ value: o.id, label: o.label, meta: o.code }))}
      />
    </div>
  );
}
