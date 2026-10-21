import { ALTERNATIVES, PARAMETERS, POSITIONING } from "@/lib/help/alternatives";

/**
 * Сравнение с системами, которые называют на встречах (ADR-020). Читается сверху вниз:
 * параметр — как у нас — как у соседей. Где проверить не удалось, так и написано: пометка
 * «не проверено» здесь такая же обязательная, как пометка демонстрации на подготовленных данных.
 *
 * Ссылок наружу нет намеренно: показ не должен уводить покупателя на чужой сайт. Адреса
 * источников с датой обращения лежат в документе показа (`docs/SALES_DEMO.md`).
 */
export function Comparison() {
  return (
    <section aria-label="Сравнение с другими системами" className="grid gap-3">
      <p className="text-meta rounded-[var(--r-sm)] border border-line bg-surface-2 p-3 text-text">
        {POSITIONING}
      </p>

      {PARAMETERS.map((parameter) => (
        <div key={parameter.id} className="grid gap-2 border-t border-line pt-3">
          <h3 className="text-body-strong font-semibold text-text">{parameter.title}</h3>
          <p className="text-meta text-text">
            <span className="font-medium">Мы: </span>
            {parameter.us}
          </p>
          <dl className="grid gap-1.5">
            {ALTERNATIVES.map((alternative) => {
              const claim = alternative.claims[parameter.id];
              return (
                <div
                  key={alternative.id}
                  className="grid gap-0.5 sm:grid-cols-[160px_1fr] sm:gap-3"
                >
                  <dt className="text-meta-strong font-medium text-text-2">{alternative.name}</dt>
                  <dd className="text-meta text-text-3">{claim.text}</dd>
                </div>
              );
            })}
          </dl>
        </div>
      ))}

      <p className="text-meta border-t border-line pt-3 text-text-3">
        Сравнение составлено по открытым описаниям этих систем на их сайтах. Где проверить не
        удалось, написано «не проверено» — догадок здесь нет. Цены не сравниваем: они меняются и
        зависят от объёма. Адреса источников и даты обращения — в документе «Показ».
      </p>
    </section>
  );
}
