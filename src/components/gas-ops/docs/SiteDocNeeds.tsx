/**
 * Что не хватает актам на объектах прораба (ADR-058): «Сфотографируйте схему узла 3»,
 * «Подтвердите объём». Файл грузится с телефона камерой, кнопка 52.
 */
import { useSiteNeeds } from "@/api/gas-docs";
import { IssueAdd } from "./common";

export function SiteDocNeeds() {
  const needs = useSiteNeeds();
  if (needs.length === 0) return null;
  return (
    <section aria-labelledby="doc-needs" className="flex flex-col gap-3">
      <h2 id="doc-needs" className="type-card">
        Не хватает актам
      </h2>
      <ul className="mono-card flex flex-col divide-y divide-line p-0 lg:p-0">
        {needs.map((n) => (
          <li key={`${n.code}-${n.workNumber}`} className="flex flex-col gap-3 px-4 py-3 lg:px-5">
            <span className="flex flex-col gap-1">
              <span className="type-text font-medium">{n.ask}</span>
              <span className="type-small text-ink-3">
                {n.objectLabel} · {n.workNumber} · демо
              </span>
            </span>
            <IssueAdd issue={n} objectId={n.objectId} field />
          </li>
        ))}
      </ul>
    </section>
  );
}
