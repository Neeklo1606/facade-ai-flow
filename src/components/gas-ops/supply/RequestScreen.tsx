/**
 * Деталь заявки снабженца (ADR-057, 4):
 *
 * - позиции и сверка с лимитом сметы;
 * - действия по статусу; запрос предложений файлом и текстом, писем система не отправляет;
 * - ввод и сравнение предложений;
 * - «Выбрать», отметки «заказано» и «в пути», которые ставит человек;
 * - приёмки и история.
 */
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Copy, FileSpreadsheet, Plus } from "lucide-react";
import { useState } from "react";
import {
  PRIORITY_LABEL,
  RECEIPT_RESULT_LABEL,
  SUPPLY_STATUS_LABEL,
  fmtKop,
  fmtQty,
  useRfqDownload,
  useSupplyActions,
  useSupplyActor,
  useSupplyBase,
  useSupplyRequest,
  type RequestDetail,
} from "@/api/gas-supply";
import {
  Button,
  Card,
  EmptyState,
  FormField,
  SelectSheet,
  StatusChip,
  Timeline,
} from "@/components/ui/mono";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { FilePick, ru, short, SupplyGate, SUPPLY_TONE } from "./common";

export function RequestScreen({ requestId }: { requestId: string }) {
  return (
    <SupplyGate screen="supply">
      <Detail requestId={requestId} />
    </SupplyGate>
  );
}

function Detail({ requestId }: { requestId: string }) {
  const detail = useSupplyRequest(requestId);
  const who = useSupplyActor();
  if (!detail) {
    return (
      <EmptyState
        title="Заявка не найдена"
        text="Её нет или она по объекту, который вам не доступен."
      />
    );
  }
  const { request } = detail;
  return (
    <div className="flex flex-col gap-section">
      <Link
        to="/gas/supply"
        className="mono-row focus-ring -ms-4 self-start rounded-pill type-label"
      >
        <ArrowLeft className="size-5" aria-hidden />
        Все заявки
      </Link>
      <Card>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="type-screen">Заявка {request.number}</h2>
            <StatusChip tone={SUPPLY_TONE[request.status]}>
              {SUPPLY_STATUS_LABEL[request.status]}
            </StatusChip>
            {request.priority === "urgent" ? (
              <StatusChip tone="down">{PRIORITY_LABEL.urgent}</StatusChip>
            ) : null}
            {request.source === "mock" ? <StatusChip tone="neutral">Демо</StatusChip> : null}
          </div>
          <dl className="grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-2 lg:grid-cols-4">
            <Fact term="Объект" value={detail.objectLabel} />
            <Fact
              term="Нужно к"
              value={
                request.needBy
                  ? `${ru(request.needBy)}${detail.overdue ? ", просрочено" : ""}`
                  : "срок не указан"
              }
            />
            <Fact term="Автор" value={`${request.authorName}, ${short(request.createdAt)}`} />
            <Fact
              term="Доставка"
              value={request.eta ? `ожидается ${ru(request.eta)}` : "дата не назначена"}
            />
          </dl>
          {request.photos.length ? (
            <p className="type-small text-ink-3">Фото: {request.photos.join(", ")}</p>
          ) : null}
          {request.rejectReason ? (
            <p className="type-label text-down">Отклонена: {request.rejectReason}</p>
          ) : null}
        </div>
      </Card>

      <Card title="Позиции и лимит сметы">
        <ul aria-label="Позиции заявки" className="flex flex-col divide-y divide-line">
          {detail.lines.map((line) => (
            <li key={line.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <span className="type-text font-medium">{line.name}</span>
                <span className="shrink-0 type-text tnum">
                  {fmtQty(line.qty)} {line.unit}
                </span>
              </div>
              <p
                className={cn("type-small", line.limit.check.over > 0 ? "text-down" : "text-ink-3")}
              >
                {line.limit.text}
                {line.limit.check.source === "mock" ? " (демо)" : ""}
              </p>
              {line.received ? (
                <p className="type-small text-ink-2">
                  Принято {fmtQty(line.received)} {line.unit}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      {who.canDecide ? <Actions detail={detail} /> : null}

      {["in-work", "waiting-offers"].includes(request.status) && who.canDecide ? (
        <RfqCard detail={detail} />
      ) : null}

      {detail.offers.length || request.status === "waiting-offers" ? (
        <Offers detail={detail} canDecide={who.canDecide} />
      ) : null}

      {detail.receipts.length ? (
        <Card title="Приёмка на объекте">
          <ul className="flex flex-col divide-y divide-line">
            {detail.receipts.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <p className="flex flex-wrap items-center gap-2 type-text font-medium">
                  {RECEIPT_RESULT_LABEL[r.result]}
                  <span className="type-small text-ink-3">
                    {r.acceptedBy}, {short(r.at)}
                  </span>
                </p>
                <p className="type-small text-ink-2">
                  {r.lines
                    .map((l) => {
                      const line = detail.lines.find((x) => x.id === l.lineId);
                      return `${line?.name ?? "Позиция"}: ${fmtQty(l.qty)} ${line?.unit ?? ""}`;
                    })
                    .join("; ")}
                </p>
                {r.discrepancy ? <p className="type-small text-down">{r.discrepancy}</p> : null}
                <p className="type-small text-ink-3">
                  {r.invoicePhoto ? `Накладная: ${r.invoicePhoto}` : "Фото накладной нет"}
                  {" · "}
                  {r.certificates.length
                    ? `Сертификаты: ${r.certificates.map((c) => c.fileName).join(", ")}`
                    : "Сертификатов нет"}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card title="История">
        <Timeline
          label="История заявки"
          events={[...request.history].reverse().map((h, i) => ({
            id: `${h.at}-${i}`,
            at: `${short(h.at)}, ${h.at.slice(11, 16)}`,
            who: h.actor,
            what: SUPPLY_STATUS_LABEL[h.status],
            change: h.note,
          }))}
        />
      </Card>
    </div>
  );
}

function Fact({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="type-label text-ink-3">{term}</dt>
      <dd className="type-text">{value}</dd>
    </div>
  );
}

function Actions({ detail }: { detail: RequestDetail }) {
  const actions = useSupplyActions();
  const base = useSupplyBase();
  const { request } = detail;
  const [reason, setReason] = useState("");
  const [eta, setEta] = useState(request.needBy ?? base.today);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<{ ok: boolean; message?: string }>, done: string) => {
    const result = await action();
    if (!result.ok) return setError(result.message ?? "Не выполнено. Повторите.");
    setError(null);
    toast.success(done);
  };

  const canReject = ["new", "in-work", "waiting-offers"].includes(request.status);
  const hasAction = canReject || ["ordered", "delivered"].includes(request.status);
  if (!hasAction) {
    return request.status === "in-transit" || request.status === "partial" ? (
      <Card>
        <p className="type-text text-ink-2">
          Ждёт приёмки на объекте: прораб сверит количество и приложит сертификаты.
        </p>
      </Card>
    ) : null;
  }

  return (
    <Card title="Действия">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-3">
          {request.status === "new" ? (
            <Button
              onClick={() =>
                run(() => actions.moveRequest({ id: request.id, to: "in-work" }), "Заявка в работе")
              }
            >
              Взять в работу
            </Button>
          ) : null}
          {request.status === "in-work" ? (
            <Button
              onClick={() =>
                run(
                  () => actions.moveRequest({ id: request.id, to: "waiting-offers" }),
                  "Ждём предложения поставщиков",
                )
              }
            >
              Запросить предложения
            </Button>
          ) : null}
          {request.status === "waiting-offers" ? (
            <Button
              disabled={!request.chosenOfferId}
              onClick={() =>
                run(() => actions.markOrdered({ requestId: request.id }), "Отмечено: заказано")
              }
            >
              Отметить заказано
            </Button>
          ) : null}
          {request.status === "delivered" ? (
            <Button
              onClick={() =>
                run(() => actions.moveRequest({ id: request.id, to: "closed" }), "Заявка закрыта")
              }
            >
              Закрыть заявку
            </Button>
          ) : null}
        </div>
        {request.status === "waiting-offers" ? (
          <p className="type-small text-ink-3">
            {request.chosenOfferId
              ? "Закажите у выбранного поставщика сами, затем отметьте здесь. Система заказ не отправляет."
              : "Сначала выберите предложение в сравнении ниже."}
          </p>
        ) : null}
        {request.status === "ordered" ? (
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <FormField label="Ожидаемая дата доставки">
              {(props) => (
                <input
                  {...props}
                  type="date"
                  value={eta}
                  onChange={(event) => setEta(event.target.value)}
                  className="mono-input focus-ring"
                />
              )}
            </FormField>
            <Button
              onClick={() =>
                run(
                  () => actions.markInTransit({ requestId: request.id, eta }),
                  `В пути, ожидается ${ru(eta)}`,
                )
              }
            >
              Отметить в пути
            </Button>
          </div>
        ) : null}
        {canReject ? (
          <div className="flex flex-col gap-3 mono-inset lg:flex-row lg:items-end">
            <FormField label="Причина отклонения">
              {(props) => (
                <input
                  {...props}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className="mono-input focus-ring"
                  placeholder="Например, материал есть на складе"
                />
              )}
            </FormField>
            <Button
              variant="danger"
              onClick={() =>
                run(() => actions.rejectRequest({ id: request.id, reason }), "Заявка отклонена")
              }
            >
              Отклонить с причиной
            </Button>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="type-label text-down">
            {error}
          </p>
        ) : null}
      </div>
    </Card>
  );
}

function RfqCard({ detail }: { detail: RequestDetail }) {
  const download = useRfqDownload();
  return (
    <Card title="Запрос предложений">
      <div className="flex flex-col gap-3">
        <p className="type-small text-ink-3">
          Писем система не отправляет: скачайте файл или скопируйте текст и отправьте поставщикам
          сами.
        </p>
        <pre className="mono-inset whitespace-pre-wrap type-small">{detail.rfqText}</pre>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                const name = await download(detail);
                toast.success(`Файл ${name} скачан`);
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Файл не собран. Повторите.");
              }
            }}
          >
            <FileSpreadsheet aria-hidden />
            Скачать запрос xlsx
          </Button>
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(detail.rfqText);
                toast.success("Текст запроса скопирован");
              } catch {
                toast.error("Браузер не дал скопировать. Выделите текст вручную.");
              }
            }}
          >
            <Copy aria-hidden />
            Скопировать текст
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Offers({ detail, canDecide }: { detail: RequestDetail; canDecide: boolean }) {
  const actions = useSupplyActions();
  const { request } = detail;
  const open = request.status === "waiting-offers";
  return (
    <Card title={`Предложения: ${detail.offers.length}`}>
      <div className="flex flex-col gap-4">
        {detail.offers.length === 0 ? (
          <p className="type-text text-ink-2">
            Ответов пока нет. Внесите предложение, когда поставщик ответит.
          </p>
        ) : (
          <ul aria-label="Сравнение предложений" className="grid gap-3 lg:grid-cols-2">
            {detail.offers.map((row) => {
              const chosen = request.chosenOfferId === row.offer.id;
              return (
                <li
                  key={row.offer.id}
                  className={cn("mono-inset flex flex-col gap-2", chosen && "ring-2 ring-ink")}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="type-text font-medium">
                      {detail.supplierName(row.offer.supplierId)}
                    </span>
                    <span className="flex flex-wrap gap-2">
                      {row.bestPrice ? <StatusChip tone="up">Лучшая цена</StatusChip> : null}
                      {row.bestLead ? <StatusChip tone="up">Лучший срок</StatusChip> : null}
                      {chosen ? <StatusChip tone="note">Выбрано</StatusChip> : null}
                    </span>
                  </div>
                  <dl className="flex flex-col gap-1 type-small">
                    {detail.lines.map((line, i) => (
                      <div key={line.id} className="flex justify-between gap-3">
                        <dt className="text-ink-3">{line.name}</dt>
                        <dd className="tnum">
                          {row.linesKop[i] === null ? "нет цены" : fmtKop(row.linesKop[i]!)}
                        </dd>
                      </div>
                    ))}
                    <div className="flex justify-between gap-3">
                      <dt className="text-ink-3">Доставка</dt>
                      <dd className="tnum">{fmtKop(row.offer.deliveryKop)}</dd>
                    </div>
                    <div className="flex justify-between gap-3 type-text font-medium">
                      <dt>Итог</dt>
                      <dd className="tnum">
                        {row.totalKop === null ? "не по всем позициям" : fmtKop(row.totalKop)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-ink-3">Срок</dt>
                      <dd className="tnum">{row.offer.leadDays} дн.</dd>
                    </div>
                  </dl>
                  {row.offer.terms ? (
                    <p className="type-small text-ink-2">{row.offer.terms}</p>
                  ) : null}
                  {row.offer.fileName ? (
                    <p className="type-small text-ink-3">Файл: {row.offer.fileName}</p>
                  ) : null}
                  {canDecide && open && !chosen ? (
                    <Button
                      variant="secondary"
                      aria-label={`Выбрать: ${detail.supplierName(row.offer.supplierId)}`}
                      onClick={async () => {
                        const result = await actions.chooseOffer({
                          requestId: request.id,
                          offerId: row.offer.id,
                        });
                        if (!result.ok) toast.error(result.message);
                      }}
                    >
                      Выбрать
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {canDecide && open ? <OfferForm detail={detail} /> : null}
      </div>
    </Card>
  );
}

function OfferForm({ detail }: { detail: RequestDetail }) {
  const base = useSupplyBase();
  const actions = useSupplyActions();
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [lead, setLead] = useState("");
  const [delivery, setDelivery] = useState("");
  const [terms, setTerms] = useState("");
  const [file, setFile] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3 mono-inset">
      <p className="type-label">Внести предложение</p>
      <SelectSheet
        label="Поставщик"
        value={supplierId}
        onChange={setSupplierId}
        options={base.suppliers.map((s) => ({
          value: s.id,
          label: s.name,
          meta: s.categories.join(", "),
        }))}
      />
      {detail.lines.map((line) => (
        <FormField key={line.id} label={`Цена за ${line.unit}, ₽: ${line.name}`}>
          {(props) => (
            <input
              {...props}
              inputMode="decimal"
              value={prices[line.id] ?? ""}
              onChange={(event) =>
                setPrices({ ...prices, [line.id]: event.target.value.replace(/[^\d,.\s]/g, "") })
              }
              className="mono-input focus-ring tnum"
              placeholder="Пусто, если позицию не предложили"
            />
          )}
        </FormField>
      ))}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
        <FormField label="Срок поставки, дней">
          {(props) => (
            <input
              {...props}
              inputMode="numeric"
              value={lead}
              onChange={(event) => setLead(event.target.value.replace(/\D/g, ""))}
              className="mono-input focus-ring tnum"
            />
          )}
        </FormField>
        <FormField label="Доставка, ₽" hint="Пусто, если доставка входит в цену">
          {(props) => (
            <input
              {...props}
              inputMode="decimal"
              value={delivery}
              onChange={(event) => setDelivery(event.target.value.replace(/[^\d,.\s]/g, ""))}
              className="mono-input focus-ring tnum"
            />
          )}
        </FormField>
      </div>
      <FormField label="Условия">
        {(props) => (
          <input
            {...props}
            value={terms}
            onChange={(event) => setTerms(event.target.value)}
            className="mono-input focus-ring"
            placeholder="Например, предоплата 50 %"
          />
        )}
      </FormField>
      <FilePick
        label="Файл предложения"
        accept=".pdf,.xlsx,.xls,image/*"
        files={file}
        onPick={setFile}
      />
      {error ? (
        <p role="alert" className="type-label text-down">
          {error}
        </p>
      ) : null}
      <Button
        className="self-start"
        disabled={!supplierId}
        onClick={async () => {
          if (!supplierId) return;
          const result = await actions.addOffer({
            requestId: detail.request.id,
            supplierId,
            lines: detail.lines.map((l) => ({ lineId: l.id, price: prices[l.id] ?? "" })),
            leadDays: lead,
            delivery,
            terms: terms || null,
            fileName: file[0] ?? null,
          });
          if (!result.ok) return setError(result.message);
          setError(null);
          setSupplierId(null);
          setPrices({});
          setLead("");
          setDelivery("");
          setTerms("");
          setFile([]);
          toast.success("Предложение внесено");
        }}
      >
        <Plus aria-hidden />
        Добавить предложение
      </Button>
    </div>
  );
}
