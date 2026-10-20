/**
 * Карточка записи времени: что ввёл человек, что посчитала система, откуда взята сумма
 * и что с записью делали. Используется в проверке и в журнале — чтобы цифры и пояснения
 * были одни и те же.
 */
import { fmtHours, fmtRate, fmtRub, formatClock, type EntryView } from "@/api/gas-ops";
import { EntryStatusBadge, FlagList, SourceMark } from "./marks";
import { fmtDate } from "@/lib/format";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line py-2 last:border-0">
      <dt className="text-[13px] text-text-3">{label}</dt>
      <dd className="text-[13px] text-text tabular-nums">{children}</dd>
    </div>
  );
}

const ORIGIN_TEXT: Record<EntryView["amountOrigin"], string> = {
  entry: "сумма начисления из фактического отчёта заказчика",
  estimate: "подтверждённая стоимость работ по объекту",
  manual: "ручной ввод менеджера: объект без сметы",
  none: "суммы нет",
};

export function EntryDetails({ view }: { view: EntryView }) {
  const { entry, object, brigade, employee, group, estimate } = view;
  const frame =
    entry.startMinutes !== null && entry.endMinutes !== null
      ? `${formatClock(entry.startMinutes)} — ${formatClock(entry.endMinutes)}`
      : null;

  return (
    <div className="flex flex-col gap-5">
      <section>
        <h3 className="text-[13px] font-medium text-text-2">Что ввёл человек</h3>
        <dl className="mt-2">
          <Row label="Объект">{object?.label ?? "—"}</Row>
          <Row label="Дата">{fmtDate(entry.day)}</Row>
          <Row label="Начало и окончание">
            {frame ?? <span className="text-text-3">в выгрузке заказчика нет рамки смены</span>}
          </Row>
          <Row label="Перерыв">
            {entry.breakMinutes > 0 ? `${entry.breakMinutes} мин` : "не указан"}
          </Row>
          <Row label="Кто">
            {brigade?.name ?? "—"}
            {employee ? ` · ${employee.name}` : ""}
          </Row>
          <Row label="Подразделение">{group?.name ?? "—"}</Row>
        </dl>
      </section>

      <section>
        <h3 className="text-[13px] font-medium text-text-2">Что посчитала система</h3>
        <dl className="mt-2">
          <Row label="Эффективное время">
            {entry.minutes} мин = {fmtHours(view.hours)}
          </Row>
          <Row label="Сумма начисления">
            {entry.amountRub === null ? (
              <span className="text-text-3">нет суммы</span>
            ) : (
              fmtRub(entry.amountRub)
            )}
          </Row>
          <Row label="Доходность часа">
            {view.revenue === null ? (
              <span className="text-text-3">не считается: нет суммы или нет минут</span>
            ) : (
              fmtRate(view.revenue)
            )}
          </Row>
          <Row label="Источник суммы">{ORIGIN_TEXT[view.amountOrigin]}</Row>
          {entry.revenueInFile != null && (
            <Row label="Доходность в файле заказчика">{fmtRate(entry.revenueInFile)}</Row>
          )}
          {estimate && (
            <Row label="Стоимость работ объекта">
              {estimate.status === "confirmed"
                ? `${fmtRub(estimate.amountRub)}, версия ${estimate.version}`
                : estimate.status === "manual-pending"
                  ? "ждёт ручного подтверждения менеджером"
                  : "не передана"}
            </Row>
          )}
        </dl>
      </section>

      <section className="flex flex-wrap items-center gap-2">
        <EntryStatusBadge status={entry.status} />
        <SourceMark source={entry.source} />
        <FlagList flags={view.flags} />
      </section>

      {view.flags.length > 0 && (
        <section className="rounded-[var(--r-sm)] bg-surface-2 p-4">
          <h3 className="text-[13px] font-medium text-text-2">Почему помечено</h3>
          <ul className="mt-2 flex list-disc flex-col gap-1 ps-4 text-[13px] text-text-2">
            {view.flags.includes("no-amount") && (
              <li>По записи есть часы, но нет суммы. Доходность не считается.</li>
            )}
            {view.flags.includes("overlap") && (
              <li>Время пересекается с другой записью этой же бригады в тот же день.</li>
            )}
            {view.flags.includes("duplicate") && (
              <li>По этому объекту в этот день у бригады уже есть запись.</li>
            )}
            {view.flags.includes("high-rate") && (
              <li>
                Доходность выше 20 000 ₽/ч. В фактическом отчёте такие строки есть, это повод
                посмотреть, а не ошибка.
              </li>
            )}
            {view.flags.includes("multi-day-object") && (
              <li>
                По объекту работали несколько дней. Правило распределения суммы по дням не
                согласовано, сумма не распределяется.
              </li>
            )}
            {view.flags.includes("no-estimate") && (
              <li>Подтверждённой стоимости работ по объекту нет.</li>
            )}
          </ul>
        </section>
      )}

      {(entry.comment || view.history.length > 0) && (
        <section>
          <h3 className="text-[13px] font-medium text-text-2">История</h3>
          {entry.comment && <p className="mt-2 text-[13px] text-text-2">{entry.comment}</p>}
          <ul className="mt-2 flex flex-col gap-2">
            {view.history.map((item) => (
              <li key={item.id} className="rounded-[var(--r-sm)] bg-surface-2 p-3 text-[13px]">
                <p className="text-text-2">
                  {item.action === "confirm"
                    ? "Подтверждено"
                    : item.action === "reject"
                      ? "Отклонено"
                      : item.action === "clarify"
                        ? "Отправлено на уточнение"
                        : "Исправлено"}{" "}
                  · <span className="tabular-nums">{item.at.replace("T", " ").slice(0, 16)}</span>
                </p>
                {item.comment && <p className="mt-1 text-text">{item.comment}</p>}
                {item.changes.length > 0 && (
                  <ul className="mt-1 text-text-3">
                    {item.changes.map((change) => (
                      <li key={change.field}>
                        {change.field}: {change.from} → {change.to}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
