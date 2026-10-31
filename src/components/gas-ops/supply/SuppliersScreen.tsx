/**
 * «Поставщики» (ADR-057, 4): справочник с историей предложений и сроков. Демо-поставщики
 * помечены, реквизитов у них нет: ИНН вносит снабженец, система его не придумывает.
 */
import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { fmtKop, useSupplierList, useSupplyActions, useSupplyActor } from "@/api/gas-supply";
import { Button, Card, EmptyState, FormField, StatusChip } from "@/components/ui/mono";
import { toast } from "@/lib/toast";
import { short, SupplyGate } from "./common";

export function SuppliersScreen() {
  return (
    <SupplyGate screen="suppliers">
      <Suppliers />
    </SupplyGate>
  );
}

function Suppliers() {
  const list = useSupplierList();
  const who = useSupplyActor();
  return (
    <div className="flex flex-col gap-section">
      {list.length === 0 ? (
        <EmptyState title="Поставщиков пока нет" text="Добавьте первого формой ниже." />
      ) : (
        <ul aria-label="Поставщики" className="grid gap-4 lg:grid-cols-2">
          {list.map(({ supplier, offers, avgLeadDays }) => (
            <li key={supplier.id}>
              <Card
                as="article"
                title={supplier.name}
                action={
                  supplier.source === "mock" ? <StatusChip tone="neutral">Демо</StatusChip> : null
                }
              >
                <dl className="flex flex-col gap-1 type-small">
                  <Row term="ИНН" value={supplier.inn ?? "не указан"} />
                  <Row
                    term="Контакт"
                    value={
                      [supplier.contact, supplier.phone, supplier.email]
                        .filter(Boolean)
                        .join(", ") || "не указан"
                    }
                  />
                  <Row term="Категории" value={supplier.categories.join(", ") || "не указаны"} />
                  <Row
                    term="Средний срок"
                    value={avgLeadDays === null ? "предложений не было" : `${avgLeadDays} дн.`}
                  />
                </dl>
                {offers.length ? (
                  <ul
                    aria-label={`Предложения: ${supplier.name}`}
                    className="mt-3 flex flex-col divide-y divide-line"
                  >
                    {offers.map((o) => (
                      <li key={o.offer.id} className="flex items-center justify-between gap-3 py-2">
                        <Link
                          to="/gas/supply/$requestId"
                          params={{ requestId: o.offer.requestId }}
                          className="focus-ring rounded-tile type-text underline-offset-4 is-hover:underline"
                        >
                          {o.number}
                        </Link>
                        <span className="text-end type-small text-ink-2 tnum">
                          {o.totalKop === null ? "не все позиции" : fmtKop(o.totalKop)} ·{" "}
                          {o.offer.leadDays} дн. · {short(o.offer.at)}
                          {o.chosen ? " · выбрано" : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
      {who.canDecide ? <SupplierForm /> : null}
    </div>
  );
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-3">{term}</dt>
      <dd className="text-end">{value}</dd>
    </div>
  );
}

function SupplierForm() {
  const actions = useSupplyActions();
  const [name, setName] = useState("");
  const [inn, setInn] = useState("");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [categories, setCategories] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Card title="Новый поставщик">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
        <Field label="Название" value={name} onChange={setName} />
        <Field label="ИНН" value={inn} onChange={(v) => setInn(v.replace(/\D/g, ""))} numeric />
        <Field label="Контакт" value={contact} onChange={setContact} />
        <Field label="Телефон" value={phone} onChange={setPhone} />
        <Field
          label="Категории через запятую"
          value={categories}
          onChange={setCategories}
          placeholder="Трубы, Арматура"
        />
      </div>
      {error ? (
        <p role="alert" className="mt-3 type-label text-down">
          {error}
        </p>
      ) : null}
      <Button
        className="mt-4"
        onClick={async () => {
          const result = await actions.addSupplier({
            name,
            inn: inn || null,
            contact: contact || null,
            phone: phone || null,
            email: null,
            categories: categories
              .split(",")
              .map((c) => c.trim())
              .filter(Boolean),
          });
          if (!result.ok) return setError(result.message);
          setError(null);
          setName("");
          setInn("");
          setContact("");
          setPhone("");
          setCategories("");
          toast.success(`${result.value.name} в справочнике`);
        }}
      >
        <Plus aria-hidden />
        Добавить поставщика
      </Button>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
  numeric = false,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  numeric?: boolean;
  placeholder?: string;
}) {
  return (
    <FormField label={label}>
      {(props) => (
        <input
          {...props}
          inputMode={numeric ? "numeric" : undefined}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="mono-input focus-ring"
        />
      )}
    </FormField>
  );
}
