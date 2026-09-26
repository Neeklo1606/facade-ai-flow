import { useEffect, useId, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCatalog } from "@/api/catalog";
import { useSaveSupplier } from "@/api/mutations";
import { queries } from "@/api/queries";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";

/**
 * Завести поставщика с экрана (ADR-023, п. 1). Регион и категории обязательны: без них
 * поставщик не попадёт ни в один подбор, и человек будет искать причину в письмах, а не здесь.
 */
export function SupplierForm({
  open,
  onOpenChange,
  supplierId,
  region,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null — новый поставщик */
  supplierId: string | null;
  /** Регион объекта: подставляем новому поставщику — чаще всего он тот же */
  region: string;
}) {
  const { categories } = useCatalog();
  // Правим по карточке, а не по строке списка: в ней есть ИНН, и пустое поле не затрёт его
  const card = useQuery({
    ...queries.supplier(supplierId ?? ""),
    enabled: open && supplierId !== null,
  }).data;
  const save = useSaveSupplier();
  const ids = {
    name: useId(),
    inn: useId(),
    region: useId(),
    contact: useId(),
    phone: useId(),
    email: useId(),
  };
  const [name, setName] = useState("");
  const [inn, setInn] = useState("");
  const [area, setArea] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(card?.supplier.name ?? "");
    setInn(card?.supplier.inn ?? "");
    setArea(card?.profile.region ?? region);
    setPicked(card?.profile.categories ?? []);
    setContactName(card?.profile.contactName ?? "");
    setPhone(card?.profile.phone ?? "");
    setEmail(card?.profile.email ?? "");
  }, [open, card, region]);

  const loading = supplierId !== null && !card;

  // Профиль подбора держит категории верхнего уровня: ими поставщик объявляет, что поставляет
  const tops = categories.filter((item) => item.parentId === null);
  const toggle = (id: string) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));

  const trimmedInn = inn.trim();
  const innOk = trimmedInn === "" || /^\d{10}$|^\d{12}$/.test(trimmedInn);
  const valid =
    name.trim().length >= 2 &&
    area.trim().length >= 2 &&
    picked.length > 0 &&
    contactName.trim().length >= 2 &&
    phone.trim().length >= 6 &&
    /.+@.+\..+/.test(email.trim()) &&
    innOk;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid || loading) return;
    save.mutate(
      {
        id: supplierId,
        name: name.trim(),
        inn: trimmedInn === "" ? null : trimmedInn,
        region: area.trim(),
        categories: picked,
        contactName: contactName.trim(),
        phone: phone.trim(),
        email: email.trim(),
      },
      {
        onSuccess: () => {
          toast.success(supplierId ? "Поставщик изменён" : "Поставщик заведён", {
            description: `${name.trim()}, ${area.trim()}. Контакт помечен проверенным сегодня, изменение — в журнале справочников.`,
          });
          onOpenChange(false);
        },
        onError: (error) => toast.error("Не сохранено", { description: error.message }),
      },
    );
  };

  const field =
    "focus-ring w-full rounded-[var(--r-sm)] border border-line bg-surface-2 px-3 py-2 text-[14px] text-text placeholder:text-text-3";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-dvh flex-col sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{supplierId ? "Изменить поставщика" : "Новый поставщик"}</DialogTitle>
          <DialogDescription>
            Регион и категории решают, попадёт ли поставщик в подбор по позициям объекта. Почта —
            адрес, на который уйдёт запрос.
          </DialogDescription>
        </DialogHeader>
        <form id="supplier-form" onSubmit={submit} className="grid min-h-0 gap-4 overflow-y-auto">
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <div className="grid gap-1.5">
              <label htmlFor={ids.name} className="text-[13px] text-text-2">
                Наименование
              </label>
              <input
                id={ids.name}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={200}
                className={field}
              />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor={ids.inn} className="text-[13px] text-text-2">
                ИНН — можно позже
              </label>
              <input
                id={ids.inn}
                value={inn}
                onChange={(event) => setInn(event.target.value)}
                inputMode="numeric"
                maxLength={12}
                aria-invalid={innOk ? undefined : true}
                className={field}
              />
              {!innOk && <span className="text-caption text-danger">10 или 12 цифр</span>}
            </div>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={ids.region} className="text-[13px] text-text-2">
              Регион поставки
            </label>
            <input
              id={ids.region}
              value={area}
              onChange={(event) => setArea(event.target.value)}
              maxLength={120}
              className={field}
            />
          </div>
          <fieldset className="grid gap-1.5">
            <legend className="mb-1 text-[13px] text-text-2">Что поставляет</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {tops.map((item) => (
                <label key={item.id} className="flex items-center gap-2 text-[13px] text-text">
                  <input
                    type="checkbox"
                    checked={picked.includes(item.id)}
                    onChange={() => toggle(item.id)}
                    className="focus-ring size-4 accent-[var(--accent)]"
                  />
                  {item.name}
                </label>
              ))}
            </div>
            {picked.length === 0 && (
              <span className="text-caption text-text-2">
                Отметьте хотя бы одну: иначе поставщик не попадёт в подбор.
              </span>
            )}
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <label htmlFor={ids.contact} className="text-[13px] text-text-2">
                Контактное лицо
              </label>
              <input
                id={ids.contact}
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
                maxLength={120}
                className={field}
              />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor={ids.phone} className="text-[13px] text-text-2">
                Телефон
              </label>
              <input
                id={ids.phone}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                inputMode="tel"
                maxLength={32}
                className={field}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={ids.email} className="text-[13px] text-text-2">
              Почта для запросов
            </label>
            <input
              id={ids.email}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={120}
              className={field}
            />
          </div>
        </form>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            type="submit"
            form="supplier-form"
            variant="accent"
            disabled={!valid || loading || save.isPending}
          >
            {supplierId ? "Сохранить" : "Завести"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
