/**
 * «Сегодня прораба» (ADR-057, 4): отдельный интерфейс телефона. «Новая заявка» голосом или
 * текстом, черновик строк, который прораб подтверждает, «Мои заявки» со статусом и сроком,
 * приёмка доставки. Цен поставщиков здесь нет: выборка прораба их не содержит.
 *
 * Отправка с ключом: без сети заявка «Сохранено на телефоне», после ответа «Принято
 * сервером», повтор с тем же ключом дубля не создаёт (инварианты 4 и 7).
 */
import { Check, Mic, PackageCheck, Plus, Square, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  AWAITING_RECEIPT,
  PRIORITY_LABEL,
  SUPPLY_STATUS_LABEL,
  fmtQty,
  useLimitCheck,
  useRequestDraft,
  useSiteRequests,
  useSupplyActions,
  useSupplyActor,
  useSupplyBase,
  type SiteRequest,
  type SupplyBase,
  type SupplyPriority,
} from "@/api/gas-supply";
import {
  Button,
  Card,
  EmptyState,
  FormField,
  OfflineBadge,
  SegmentedPills,
  SelectSheet,
  StatusChip,
} from "@/components/ui/mono";
import { newClientKey } from "@/lib/gas-ops/field-queue";
import { useBrowserSpeech } from "@/lib/ui/browser-speech";
import { useOffline } from "@/lib/ui/offline";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { SiteDocNeeds } from "../docs/SiteDocNeeds";
import { FilePick, short, SUPPLY_TONE } from "./common";

/** Очередь заявок без сети: своя, отдельно от записей времени бригадира */
const QUEUE_KEY = "gaika-supply-queue";

interface DraftRow {
  key: string;
  raw: string | null;
  itemId: string | null;
  qty: string;
  /** Строку с низкой уверенностью человек подтверждает отдельно (правило 1) */
  low: boolean;
  confirmed: boolean;
  note: string | null;
}

interface Draft {
  text: string;
  objectId: string | null;
  needBy: string;
  priority: SupplyPriority;
  photos: string[];
  rows: DraftRow[];
  clientKey: string;
}

type Queued = {
  clientKey: string;
  input: Parameters<ReturnType<typeof useSupplyActions>["createRequest"]>[0];
};

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readQueue(): Queued[] {
  try {
    return JSON.parse(storage()?.getItem(QUEUE_KEY) ?? "[]") as Queued[];
  } catch {
    return [];
  }
}

function writeQueue(queue: Queued[]): void {
  try {
    storage()?.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Без хранилища очередь живёт до перезагрузки
  }
}

const PRIORITIES = [
  { value: "normal", label: PRIORITY_LABEL.normal },
  { value: "urgent", label: PRIORITY_LABEL.urgent },
] as const;

const PRIORITY_RANK: Record<string, number> = { "in-transit": 0, partial: 0 };

export function SiteToday() {
  const base = useSupplyBase();
  const requests = useSiteRequests();
  const who = useSupplyActor();
  const actions = useSupplyActions();
  const network = useOffline();
  const [step, setStep] = useState<"today" | "form" | "check" | "sent" | "receive">("today");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<Queued[]>([]);
  const [sent, setSent] = useState<{ state: "local" | "server"; number: string | null } | null>(
    null,
  );
  const [receiveId, setReceiveId] = useState<string | null>(null);

  useEffect(() => setQueue(readQueue()), []);

  const flush = useCallback(
    async (item: Queued) => {
      const result = await actions.createRequest(item.input);
      if (!result.ok) return result;
      const next = readQueue().filter((q) => q.clientKey !== item.clientKey);
      writeQueue(next);
      setQueue(next);
      return result;
    },
    [actions],
  );

  useEffect(() => {
    if (network.offline || queue.length === 0) return;
    void (async () => {
      for (const item of queue) {
        const result = await flush(item);
        if (result.ok) setSent((s) => (s ? { state: "server", number: result.value.number } : s));
      }
    })();
  }, [network.offline, queue, flush]);

  const start = () => {
    setDraft({
      text: "",
      objectId: base.objects[0]?.id ?? null,
      needBy: "",
      priority: "normal",
      photos: [],
      rows: [],
      clientKey: newClientKey(),
    });
    setError(null);
    setStep("form");
  };

  if (!who.canCreate) {
    return (
      <EmptyState
        title="Экран прораба"
        text="Заявки с объекта создаёт прораб. Войдите ролью «Прораб» в меню аватара."
      />
    );
  }

  if (step === "form" && draft) {
    return (
      <RequestForm
        draft={draft}
        onChange={setDraft}
        error={error}
        onBack={() => setStep("today")}
        onCheck={() => {
          const problem = checkDraft(draft);
          setError(problem);
          if (!problem) setStep("check");
        }}
      />
    );
  }

  if (step === "check" && draft) {
    const input = inputOf(draft);
    return (
      <div className="flex flex-col gap-4">
        <h2 className="type-screen">Проверьте заявку</h2>
        <Card>
          <dl className="flex flex-col divide-y divide-line">
            <Fact term="Объект" value={base.objectLabel(input.objectId)} />
            <Fact term="Нужно к" value={input.needBy ? short(input.needBy) : "срок не указан"} />
            <Fact term="Приоритет" value={PRIORITY_LABEL[input.priority]} />
            {input.photos.length ? <Fact term="Фото" value={`${input.photos.length} шт.`} /> : null}
          </dl>
        </Card>
        <Card title="Позиции">
          <ul className="flex flex-col divide-y divide-line">
            {input.lines.map((line, i) => (
              <li key={i} className="flex items-start justify-between gap-3 py-3 first:pt-0">
                <span className="type-text">{base.itemName(line.itemId)}</span>
                <span className="shrink-0 type-text font-medium tnum">
                  {line.qty} {base.itemUnit(line.itemId)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        {error ? (
          <p role="alert" className="type-label text-down">
            {error}
          </p>
        ) : null}
        <div className="flex flex-col gap-3">
          <Button
            field
            onClick={async () => {
              const item: Queued = { clientKey: draft.clientKey, input };
              // Сначала на телефон: обрыв связи после нажатия заявку не теряет
              const next = [...readQueue().filter((q) => q.clientKey !== item.clientKey), item];
              writeQueue(next);
              setQueue(next);
              setSent({ state: "local", number: null });
              setError(null);
              if (network.offline) {
                setStep("sent");
                return;
              }
              const result = await flush(item);
              if (!result.ok) {
                const rest = readQueue().filter((q) => q.clientKey !== item.clientKey);
                writeQueue(rest);
                setQueue(rest);
                setSent(null);
                setError(result.message);
                return;
              }
              setSent({ state: "server", number: result.value.number });
              setStep("sent");
            }}
          >
            Отправить заявку
          </Button>
          <Button variant="secondary" field onClick={() => setStep("form")}>
            Исправить
          </Button>
        </div>
      </div>
    );
  }

  if (step === "sent" && sent) {
    return (
      <div className="flex flex-col items-start gap-4">
        <OfflineBadge state={sent.state} />
        <h2 className="type-screen">
          {sent.state === "server" ? `Заявка ${sent.number ?? ""} принята` : "Заявка на телефоне"}
        </h2>
        <p className="type-text text-ink-2">
          {sent.state === "server"
            ? "Снабженец возьмёт её в работу. Статус и ожидаемая дата видны в «Моих заявках»."
            : "Сети нет. Заявка отправится сама, когда телефон поймает связь. Повторно вносить не нужно."}
        </p>
        <Button field className="w-full" onClick={() => setStep("today")}>
          Готово
        </Button>
      </div>
    );
  }

  const receiving = requests.find((r) => r.id === receiveId);
  if (step === "receive" && receiving) {
    return <ReceiveForm request={receiving} onDone={() => setStep("today")} />;
  }

  const toReceive = requests.filter((r) => AWAITING_RECEIPT.includes(r.status));
  const mine = [...requests].sort(
    (a, b) => (PRIORITY_RANK[a.status] ?? 1) - (PRIORITY_RANK[b.status] ?? 1),
  );

  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Итог дня" className="flex flex-col gap-3">
        <p className="type-label text-ink-2">Прораб · {short(base.today)}</p>
        <div className="grid grid-cols-2 gap-3">
          <Card as="div" className="flex flex-col gap-1">
            <span className="type-label text-ink-2">Заявок в работе</span>
            <span className="type-kpi">
              {
                requests.filter((r) => !["closed", "rejected", "delivered"].includes(r.status))
                  .length
              }
            </span>
            <span className="type-small text-ink-3">по вашим объектам</span>
          </Card>
          <Card
            as="div"
            className={cn("flex flex-col gap-1", toReceive.length > 0 && "mono-card-inverse")}
          >
            <span className="type-label">Принять поставку</span>
            <span className="type-kpi">{toReceive.length}</span>
            <span className="type-small">
              {toReceive.length ? "едет на объект" : "ничего не едет"}
            </span>
          </Card>
        </div>
        {queue.length > 0 ? (
          <p className="flex flex-wrap items-center gap-2">
            <OfflineBadge state="local" />
            <span className="type-label text-ink-2">Ждут отправки: {queue.length}</span>
          </p>
        ) : null}
        <Button field className="w-full" onClick={start}>
          <Plus aria-hidden />
          Новая заявка
        </Button>
      </section>

      {toReceive.length ? (
        <section aria-labelledby="to-receive" className="flex flex-col gap-3">
          <h2 id="to-receive" className="type-card">
            Едет на объект
          </h2>
          <ul className="mono-card flex flex-col divide-y divide-line p-0 lg:p-0">
            {toReceive.map((r) => (
              <li key={r.id} className="flex flex-col gap-3 px-4 py-3 lg:px-5">
                <RequestLine request={r} base={base} />
                <Button
                  field
                  onClick={() => {
                    setReceiveId(r.id);
                    setStep("receive");
                  }}
                >
                  <PackageCheck aria-hidden />
                  Принять поставку {r.number}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <SiteDocNeeds />

      <section aria-labelledby="my-requests" className="flex flex-col gap-3">
        <h2 id="my-requests" className="type-card">
          Мои заявки
        </h2>
        {mine.length === 0 ? (
          <EmptyState title="Заявок пока нет" text="Создайте первую кнопкой «Новая заявка»." />
        ) : (
          <ul className="mono-card flex flex-col divide-y divide-line p-0 lg:p-0">
            {mine.slice(0, 20).map((r) => (
              <li key={r.id} className="px-4 py-3 lg:px-5">
                <RequestLine request={r} base={base} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function RequestLine({ request, base }: { request: SiteRequest; base: SupplyBase }) {
  const when = request.eta
    ? `ожидается ${short(request.eta)}`
    : request.needBy
      ? `нужно к ${short(request.needBy)}`
      : "срок не указан";
  return (
    <div className="flex flex-col gap-1">
      {/* Номер и статус в одну строку, объект ниже: на телефоне адрес не съедает номер */}
      <div className="flex items-start justify-between gap-3">
        <p className="type-text font-medium tnum">{request.number}</p>
        <StatusChip tone={SUPPLY_TONE[request.status]}>
          {SUPPLY_STATUS_LABEL[request.status]}
        </StatusChip>
      </div>
      <p className="truncate type-small text-ink-2">{base.objectLabel(request.objectId)}</p>
      <p className="type-small text-ink-3">
        {request.lines
          .map((l) => `${base.itemName(l.itemId)}: ${fmtQty(l.qty)} ${base.itemUnit(l.itemId)}`)
          .join("; ")}
      </p>
      <p className="type-small text-ink-3">
        {when}
        {request.rejectReason ? ` · ${request.rejectReason}` : ""}
      </p>
    </div>
  );
}

function Fact({ term, value }: { term: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <dt className="type-label text-ink-3">{term}</dt>
      <dd className="text-end type-text font-medium">{value}</dd>
    </div>
  );
}

function checkDraft(draft: Draft): string | null {
  if (!draft.objectId) return "Выберите объект.";
  if (draft.rows.length === 0)
    return "Добавьте хотя бы одну позицию: продиктуйте, напишите или выберите.";
  const index = draft.rows.findIndex((r) => !r.itemId);
  if (index >= 0) return `Строка ${index + 1}: выберите позицию из номенклатуры.`;
  const qty = draft.rows.findIndex((r) => !(Number(r.qty.replace(",", ".")) > 0));
  if (qty >= 0) return `Строка ${qty + 1}: укажите количество больше нуля.`;
  const low = draft.rows.findIndex((r) => r.low && !r.confirmed);
  if (low >= 0) return `Строка ${low + 1}: проверьте позицию и количество и нажмите «Верно».`;
  return null;
}

function inputOf(draft: Draft) {
  return {
    objectId: draft.objectId ?? "",
    lines: draft.rows.map((r) => ({ itemId: r.itemId ?? "", qty: r.qty })),
    needBy: draft.needBy || null,
    priority: draft.priority,
    photos: draft.photos,
    clientKey: draft.clientKey,
  };
}

let rowSeq = 0;
const rowKey = () => `row-${++rowSeq}`;

function RequestForm({
  draft,
  onChange,
  error,
  onBack,
  onCheck,
}: {
  draft: Draft;
  onChange: (draft: Draft) => void;
  error: string | null;
  onBack: () => void;
  onCheck: () => void;
}) {
  const base = useSupplyBase();
  const parse = useRequestDraft();
  const limit = useLimitCheck();
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    onChange({ ...draft, [key]: value });

  const apply = (text: string) => {
    const parsed = parse(text);
    onChange({
      ...draft,
      // Разобранный текст уходит в строки: поле пустеет под следующую диктовку
      text: "",
      rows: [
        ...draft.rows,
        ...parsed.lines.map((line) => ({
          key: rowKey(),
          raw: line.raw,
          itemId: line.itemId,
          qty: line.qty === null ? "" : String(line.qty).replace(".", ","),
          low: line.confidence === "low",
          confirmed: false,
          note: line.note,
        })),
      ],
      needBy: draft.needBy || parsed.needBy || "",
      priority: parsed.urgent ? "urgent" : draft.priority,
    });
  };

  const speech = useBrowserSpeech(apply);

  const setRow = (key: string, patch: Partial<DraftRow>) =>
    set(
      "rows",
      draft.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );

  return (
    <div className="flex flex-col gap-4">
      <h2 className="type-screen">Новая заявка</h2>
      <SelectSheet
        label="Объект"
        value={draft.objectId}
        onChange={(value) => set("objectId", value)}
        options={base.objects.map((o) => ({ value: o.id, label: o.code, meta: o.label }))}
      />
      <FormField
        label="Что нужно"
        hint="Например: труба вгп 20 50 метров, краны газовые 4 шт, к пятнице"
      >
        {(props) => (
          <textarea
            {...props}
            rows={3}
            value={draft.text}
            onChange={(event) => set("text", event.target.value)}
            className="mono-input focus-ring h-auto min-h-28 py-3"
          />
        )}
      </FormField>
      <div className="flex flex-wrap items-center gap-3">
        {speech.supported ? (
          <button
            type="button"
            onClick={speech.toggle}
            aria-pressed={speech.listening}
            aria-label={speech.listening ? "Остановить запись" : "Продиктовать заявку"}
            className={cn(
              "grid size-14 place-items-center rounded-full focus-ring",
              speech.listening ? "bg-accent text-on-accent" : "bg-inverse text-on-inverse",
            )}
          >
            {speech.listening ? (
              <Square className="size-6" aria-hidden />
            ) : (
              <Mic className="size-6" aria-hidden />
            )}
          </button>
        ) : null}
        <Button
          variant="secondary"
          field
          disabled={!draft.text.trim()}
          onClick={() => apply(draft.text)}
        >
          Разобрать текст
        </Button>
        <Button
          variant="quiet"
          field
          onClick={() =>
            set("rows", [
              ...draft.rows,
              {
                key: rowKey(),
                raw: null,
                itemId: null,
                qty: "",
                low: false,
                confirmed: false,
                note: null,
              },
            ])
          }
        >
          <Plus aria-hidden />
          Позиция
        </Button>
      </div>
      {speech.listening ? (
        <p className="type-label text-ink-2">Слушаю. Говорите позиции и срок.</p>
      ) : null}
      {speech.error ? (
        <p role="alert" className="type-label text-down">
          {speech.error}
        </p>
      ) : null}

      {draft.rows.length ? (
        <section aria-label="Позиции черновика" className="flex flex-col gap-3">
          <p className="type-label text-ink-2">
            Черновик: позиции подобраны из номенклатуры, проверьте каждую
          </p>
          {draft.rows.map((row, index) => {
            const check =
              draft.objectId && row.itemId && Number(row.qty.replace(",", ".")) > 0
                ? limit({
                    objectId: draft.objectId,
                    itemId: row.itemId,
                    qty: Number(row.qty.replace(",", ".")),
                  })
                : null;
            return (
              <Card key={row.key} as="div" className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="type-label">Строка {index + 1}</p>
                  {row.low ? (
                    row.confirmed ? (
                      <StatusChip tone="up">Проверено</StatusChip>
                    ) : (
                      <StatusChip tone="caution">Проверьте</StatusChip>
                    )
                  ) : null}
                </div>
                {row.raw ? <p className="type-small text-ink-3">Из текста: «{row.raw}»</p> : null}
                {row.note ? <p className="type-small text-ink-2">{row.note}</p> : null}
                <SelectSheet
                  label="Позиция"
                  value={row.itemId}
                  onChange={(value) => setRow(row.key, { itemId: value, confirmed: false })}
                  options={base.items.map((i) => ({
                    value: i.id,
                    label: i.name,
                    meta: `${i.category}, ${i.unit}`,
                  }))}
                />
                <FormField
                  label={`Количество${row.itemId ? `, ${base.itemUnit(row.itemId)}` : ""}`}
                >
                  {(props) => (
                    <input
                      {...props}
                      inputMode="decimal"
                      value={row.qty}
                      onChange={(event) =>
                        setRow(row.key, {
                          qty: event.target.value.replace(/[^\d,.]/g, ""),
                          confirmed: false,
                        })
                      }
                      className="mono-input focus-ring tnum"
                    />
                  )}
                </FormField>
                {check ? (
                  <p
                    className={cn("type-small", check.check.over > 0 ? "text-down" : "text-ink-3")}
                  >
                    {check.text}
                    {check.check.source === "mock" ? " (демо)" : ""}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {row.low && !row.confirmed ? (
                    <Button field onClick={() => setRow(row.key, { confirmed: true })}>
                      <Check aria-hidden />
                      Верно
                    </Button>
                  ) : null}
                  <Button
                    variant="quiet"
                    field
                    aria-label={`Убрать строку ${index + 1}`}
                    onClick={() =>
                      set(
                        "rows",
                        draft.rows.filter((r) => r.key !== row.key),
                      )
                    }
                  >
                    <Trash2 aria-hidden />
                    Убрать
                  </Button>
                </div>
              </Card>
            );
          })}
        </section>
      ) : null}

      <FormField label="Нужно на объекте к" hint="Можно сказать в тексте: «к пятнице», «до 05.11»">
        {(props) => (
          <input
            {...props}
            type="date"
            value={draft.needBy}
            onChange={(event) => set("needBy", event.target.value)}
            className="mono-input focus-ring"
          />
        )}
      </FormField>
      <SegmentedPills
        label="Приоритет"
        options={PRIORITIES}
        value={draft.priority}
        onChange={(value) => set("priority", value)}
      />
      <FilePick
        label="Фото"
        accept="image/*"
        capture
        multiple
        files={draft.photos}
        onPick={(names) => set("photos", [...draft.photos, ...names])}
      />
      {error ? (
        <p role="alert" className="type-label text-down">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-3">
        <Button field onClick={onCheck}>
          Проверить
        </Button>
        <Button variant="secondary" field onClick={onBack}>
          Назад
        </Button>
      </div>
    </div>
  );
}

function ReceiveForm({ request, onDone }: { request: SiteRequest; onDone: () => void }) {
  const base = useSupplyBase();
  const actions = useSupplyActions();
  const [qty, setQty] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      request.lines.map((l) => [l.id, String(Math.max(0, l.qty - l.received)).replace(".", ",")]),
    ),
  );
  const [certs, setCerts] = useState<Record<string, string[]>>({});
  const [invoice, setInvoice] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [key] = useState(newClientKey);

  const differs = request.lines.some(
    (l) => Number((qty[l.id] ?? "0").replace(",", ".")) !== Math.max(0, l.qty - l.received),
  );

  const submit = async (withDiscrepancy: boolean) => {
    const result = await actions.acceptDelivery({
      requestId: request.id,
      lines: request.lines.map((l) => ({ lineId: l.id, qty: qty[l.id] ?? "0" })),
      withDiscrepancy,
      discrepancy: withDiscrepancy ? note : null,
      invoicePhoto: invoice[0] ?? null,
      certificates: Object.entries(certs).flatMap(([lineId, names]) =>
        names.map((fileName) => ({ lineId, fileName })),
      ),
      clientKey: key,
    });
    if (!result.ok) return setError(result.message);
    toast.success(
      withDiscrepancy
        ? `Поставка ${request.number} принята с расхождением`
        : `Поставка ${request.number} принята`,
    );
    onDone();
  };

  return (
    <div className="flex flex-col gap-4">
      <h2 className="type-screen">Приёмка {request.number}</h2>
      <p className="type-text text-ink-2">{base.objectLabel(request.objectId)}</p>
      {request.lines.map((line) => {
        const expected = Math.max(0, line.qty - line.received);
        const unit = base.itemUnit(line.itemId);
        return (
          <Card key={line.id} as="div" className="flex flex-col gap-3">
            <p className="type-text font-medium">{base.itemName(line.itemId)}</p>
            <p className="type-small text-ink-3">
              Ждём {fmtQty(expected)} {unit}
              {line.received ? `, уже принято ${fmtQty(line.received)}` : ""}
            </p>
            <FormField label={`Привезли, ${unit}`}>
              {(props) => (
                <input
                  {...props}
                  inputMode="decimal"
                  value={qty[line.id] ?? ""}
                  onChange={(event) =>
                    setQty({ ...qty, [line.id]: event.target.value.replace(/[^\d,.]/g, "") })
                  }
                  className="mono-input focus-ring tnum"
                />
              )}
            </FormField>
            <FilePick
              label="Сертификат или паспорт"
              accept="image/*,.pdf"
              multiple
              files={certs[line.id] ?? []}
              onPick={(names) =>
                setCerts({ ...certs, [line.id]: [...(certs[line.id] ?? []), ...names] })
              }
            />
          </Card>
        );
      })}
      <FilePick
        label="Фото накладной"
        accept="image/*"
        capture
        files={invoice}
        onPick={setInvoice}
      />
      <FormField
        label="Расхождение"
        hint={
          differs
            ? "Количество не совпадает с заказом: опишите, что не так"
            : "Если что-то не так с поставкой"
        }
      >
        {(props) => (
          <textarea
            {...props}
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="mono-input focus-ring h-auto min-h-20 py-3"
            placeholder="Например, не довезли 2 м трубы"
          />
        )}
      </FormField>
      {error ? (
        <p role="alert" className="type-label text-down">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-3">
        <Button field disabled={differs} onClick={() => void submit(false)}>
          Принять
        </Button>
        <Button variant="secondary" field onClick={() => void submit(true)}>
          Принять с расхождением
        </Button>
        <Button variant="quiet" field onClick={onDone}>
          Назад
        </Button>
      </div>
    </div>
  );
}
