import { useId, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { Send } from "lucide-react";
import { contactTgUrl } from "@/lib/site/config";
import { LANDING } from "@/lib/site/copy";
import { cn } from "@/lib/utils";
import { siteButton } from "@/components/site/parts";

/** «+7 (918) 123-45-67» из любых цифр: маска не мешает вставить номер целиком */
export function maskPhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (!digits.startsWith("7")) digits = `7${digits}`;
  digits = digits.slice(0, 11);
  const d = digits.slice(1);
  let out = "+7";
  if (d.length) out += ` (${d.slice(0, 3)}`;
  if (d.length >= 3) out += ")";
  if (d.length > 3) out += ` ${d.slice(3, 6)}`;
  if (d.length > 6) out += `-${d.slice(6, 8)}`;
  if (d.length > 8) out += `-${d.slice(8, 10)}`;
  return out;
}

export type LeadSource = "landing" | "razbor" | "demo-final" | "case";

/** Готовый текст заявки для Telegram: то, что человек ввёл, и откуда он пришёл */
export function leadText(fields: {
  name: string;
  company: string;
  phone: string;
  crews: string;
  source: LeadSource;
}): string {
  return [
    "Заявка с сайта ГАЙКИ: разобрать учёт выработки на наших данных.",
    `Имя: ${fields.name}`,
    `Компания: ${fields.company}`,
    `Телефон: ${fields.phone}`,
    `Бригад: ${fields.crews}`,
    `Источник: ${fields.source}`,
  ].join("\n");
}

/**
 * Заявка (01_SPEC 9.11, 11.1). Приём заявок на сайте появится в L6 через порт LeadSink.
 * До тех пор форма не делает вид, что отправила: после проверки полей говорит, что заявки
 * с сайта пока не подключены, и даёт кнопку в Telegram с готовым текстом заявки.
 */
export function LeadForm({ source = "landing" }: { source?: LeadSource }) {
  const { lead } = LANDING;
  const id = useId();
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [crews, setCrews] = useState<string>("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const digits = phone.replace(/\D/g, "");
    if (!name.trim()) return setError("Напишите имя");
    if (digits.length !== 11) return setError("Проверьте телефон: нужно 10 цифр после +7");
    if (!crews) return setError("Выберите, сколько бригад");
    if (!consent) return setError("Нужно согласие на обработку данных");
    setError(null);
    setReady(
      contactTgUrl(leadText({ name: name.trim(), company: company.trim(), phone, crews, source })),
    );
  };

  const field =
    "min-h-12 w-full rounded-control border border-line-2 bg-surface px-4 text-body text-text outline-none placeholder:text-text-3 focus-ring";

  if (ready) {
    return (
      <div
        role="status"
        className="flex flex-col gap-4 rounded-2xl bg-surface p-5 ring-1 ring-line sm:p-7"
      >
        <p className="site-h3 text-text">Заявки с сайта пока не подключены</p>
        <p className="site-body text-text-2">
          Напишите нам в Telegram, это быстрее: текст заявки уже готов, его останется отправить.
        </p>
        <a href={ready} target="_blank" rel="noopener noreferrer" className={siteButton.primary}>
          <Send className="size-4" aria-hidden />
          Открыть Telegram
        </a>
        <button
          type="button"
          onClick={() => setReady(null)}
          className="self-start text-body text-text-2 underline-offset-4 focus-ring is-hover:underline"
        >
          Изменить данные
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-describedby={error ? `${id}-error` : undefined}
      className="flex flex-col gap-4"
    >
      <label className="flex flex-col gap-1.5">
        <span className="site-caption text-text-2">{lead.name}</span>
        <input
          className={field}
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          required
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="site-caption text-text-2">{lead.company}</span>
        <input
          className={field}
          autoComplete="organization"
          value={company}
          onChange={(event) => setCompany(event.target.value)}
          maxLength={120}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="site-caption text-text-2">{lead.phone}</span>
        <input
          className={cn(field, "tnum")}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+7 (900) 000-00-00"
          value={phone}
          onChange={(event) => setPhone(maskPhone(event.target.value))}
          required
        />
      </label>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="site-caption mb-1.5 text-text-2">{lead.crews}</legend>
        <div className="grid grid-cols-3 gap-2">
          {lead.crewOptions.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={crews === option}
              onClick={() => setCrews(option)}
              className={cn(
                "min-h-12 rounded-full border text-body-strong transition-colors duration-100 focus-ring",
                crews === option
                  ? "border-transparent bg-text text-void"
                  : "border-line-2 bg-surface text-text",
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="flex min-h-12 items-start gap-3 py-1">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          className="mt-1 size-5 shrink-0 accent-[var(--orange-strong)]"
        />
        <span className="site-caption text-text-2">
          {lead.consent}{" "}
          <Link to="/privacy" className="text-text underline underline-offset-4 focus-ring">
            Политика обработки данных
          </Link>
        </span>
      </label>
      {error ? (
        <p id={`${id}-error`} role="alert" className="site-caption text-danger">
          {error}
        </p>
      ) : null}
      <button type="submit" className={siteButton.primary}>
        {lead.submit}
      </button>
    </form>
  );
}
