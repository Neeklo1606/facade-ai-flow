import { useId, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Send } from "lucide-react";
import { contactTgUrl } from "@/lib/site/config";
import { LANDING } from "@/lib/site/copy";
import { cn } from "@/lib/utils";
import { siteButton } from "@/components/site/parts";
import { track } from "@/lib/site/analytics";
import { partnerSrc } from "@/lib/site/partner";
import type { LeadSource } from "@/lib/site/lead-fields";

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

export type { LeadSource };

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
 * Что показала форма после нажатия. «Заявка отправлена» только при 204 от сервера:
 * 501 честно ведёт в Telegram, всё остальное просит повторить (ADR-051, 01_SPEC 11.1)
 */
export type LeadOutcome = "sent" | "telegram" | "error";

export function outcomeOf(status: number | null): LeadOutcome {
  if (status === 204) return "sent";
  if (status === 501) return "telegram";
  return "error";
}

/**
 * Заявка (01_SPEC 9.11, 11.1). Сервер принимает её через порт LeadSink. Если приём
 * не подключён, форма не делает вид, что отправила: говорит об этом и даёт кнопку
 * в Telegram с готовым текстом заявки.
 */
type Field = "name" | "phone" | "crews" | "consent";

export function LeadForm({ source = "landing" }: { source?: LeadSource }) {
  const { lead } = LANDING;
  const id = useId();
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [crews, setCrews] = useState<string>("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  /** Ошибка проверки и поле, к которому она относится: читалка объявит её у поля */
  const [invalid, setInvalid] = useState<{ field: Field; text: string } | null>(null);
  const error = invalid?.text ?? null;
  const fail = (field: Field, text: string) => {
    setInvalid({ field, text });
    document.getElementById(`${id}-${field}`)?.focus();
  };
  const errorFor = (field: Field) =>
    invalid?.field === field
      ? { "aria-invalid": true as const, "aria-describedby": `${id}-error` }
      : {};
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<LeadOutcome | null>(null);

  const telegramUrl = contactTgUrl(
    leadText({ name: name.trim(), company: company.trim(), phone, crews, source }),
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending) return;
    const digits = phone.replace(/\D/g, "");
    if (!name.trim()) return fail("name", "Напишите имя");
    if (digits.length !== 11) return fail("phone", "Проверьте телефон: нужно 10 цифр после +7");
    if (!crews) return fail("crews", "Выберите, сколько бригад");
    if (!consent) return fail("consent", "Нужно согласие на обработку данных");
    setInvalid(null);
    setSending(true);
    let status: number | null = null;
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          company: company.trim(),
          phone,
          crews,
          source,
          src: partnerSrc(),
          page: window.location.pathname,
          consent: true,
          website,
        }),
      });
      status = response.status;
    } catch {
      status = null;
    }
    setSending(false);
    const next = outcomeOf(status);
    if (next === "sent") track("lead_submit", { source });
    setOutcome(next);
  };

  const field =
    "min-h-12 w-full rounded-control border border-line-2 bg-surface px-4 text-body text-text outline-none placeholder:text-text-3 focus-ring";

  if (outcome === "sent") {
    return (
      <div
        role="status"
        className="flex flex-col gap-3 rounded-2xl bg-surface p-5 ring-1 ring-line sm:p-7"
      >
        <span className="grid size-10 place-items-center rounded-full bg-ok-bg text-ok">
          <Check className="size-5" strokeWidth={2.5} aria-hidden />
        </span>
        <p className="site-h3 text-text">Заявка отправлена</p>
        <p className="site-body text-text-2">
          Свяжемся в течение рабочего дня и пришлём, куда отправить сообщения бригадиров и отчёт.
        </p>
      </div>
    );
  }

  if (outcome === "telegram") {
    return (
      <div
        role="status"
        className="flex flex-col gap-4 rounded-2xl bg-surface p-5 ring-1 ring-line sm:p-7"
      >
        <p className="site-h3 text-text">Заявки с сайта пока не подключены</p>
        <p className="site-body text-text-2">
          Напишите нам в Telegram, это быстрее: текст заявки уже готов, его останется отправить.
        </p>
        <a
          href={telegramUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={siteButton.primary}
        >
          <Send className="size-4" aria-hidden />
          Открыть Telegram
        </a>
        <button
          type="button"
          onClick={() => setOutcome(null)}
          className="self-start text-body text-text-2 underline-offset-4 focus-ring is-hover:underline"
        >
          Изменить данные
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate aria-busy={sending} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="site-caption text-text-2">{lead.name}</span>
        <input
          id={`${id}-name`}
          {...errorFor("name")}
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
          id={`${id}-phone`}
          {...errorFor("phone")}
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
      <fieldset
        className="flex flex-col gap-1.5"
        aria-describedby={invalid?.field === "crews" ? `${id}-error` : undefined}
      >
        <legend className="site-caption mb-1.5 text-text-2">{lead.crews}</legend>
        <div className="grid grid-cols-3 gap-2">
          {lead.crewOptions.map((option, index) => (
            <button
              key={option}
              id={index === 0 ? `${id}-crews` : undefined}
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
          id={`${id}-consent`}
          {...errorFor("consent")}
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
      {/* Ловушка для ботов: человек поле не видит, клавиатура его пропускает */}
      <div aria-hidden className="sr-only">
        <label>
          Сайт
          <input
            tabIndex={-1}
            autoComplete="off"
            name="website"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
          />
        </label>
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="site-caption text-danger">
          {error}
        </p>
      ) : null}
      {outcome === "error" ? (
        <div role="alert" className="flex flex-col gap-1 rounded-control bg-danger-bg px-4 py-3">
          <p className="text-body-strong text-danger">Не отправилось</p>
          <p className="site-caption text-text-2">
            Нажмите ещё раз или{" "}
            <a
              href={telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-text underline underline-offset-4 focus-ring"
            >
              напишите в Telegram
            </a>
            .
          </p>
        </div>
      ) : null}
      <button type="submit" disabled={sending} className={siteButton.primary}>
        {sending ? "Отправляю" : outcome === "error" ? "Отправить ещё раз" : lead.submit}
      </button>
    </form>
  );
}
