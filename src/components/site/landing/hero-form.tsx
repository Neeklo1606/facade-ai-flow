import { useId, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { LANDING } from "@/lib/site/copy";
import { track } from "@/lib/site/analytics";
import { prefersReducedMotion } from "../motion";
import { maskPhone } from "./LeadForm";
import { sendLeadDraft } from "./lead-draft";

/**
 * Форма первого экрана «Тепло» (макет Landing-Desktop): имя, телефон и «Показать на моём
 * процессе». Отдельной отправки нет: имя и телефон переходят в общую форму заявки внизу
 * страницы, где человек выбирает число бригад и даёт согласие, и уходят через /api/leads.
 * Без скриптов форма ведёт на страницу разбора с той же формой заявки.
 */
type Field = "name" | "phone";

export function HeroForm() {
  const { hero } = LANDING;
  const id = useId();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [invalid, setInvalid] = useState<{ field: Field; text: string } | null>(null);

  const fail = (field: Field, text: string) => {
    setInvalid({ field, text });
    document.getElementById(`${id}-${field}`)?.focus();
  };
  const errorFor = (field: Field) =>
    invalid?.field === field
      ? { "aria-invalid": true as const, "aria-describedby": `${id}-error` }
      : {};

  const submit = (event: FormEvent) => {
    const target = document.getElementById("lead");
    // Формы заявки на странице нет: браузер уходит на /razbor обычной отправкой
    if (!target) return;
    event.preventDefault();
    if (!name.trim()) return fail("name", hero.form.noName);
    if (phone.replace(/\D/g, "").length !== 11) return fail("phone", hero.form.badPhone);
    setInvalid(null);
    track("cta_lead", { place: "hero" });
    sendLeadDraft({ name: name.trim(), phone });
    target.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };

  return (
    <div className="site-hero-form">
      <form
        action="/razbor"
        method="get"
        noValidate
        onSubmit={submit}
        aria-label={hero.form.label}
        className="site-hero-fields"
      >
        <label className="sr-only" htmlFor={`${id}-name`}>
          {hero.form.name}
        </label>
        <input
          id={`${id}-name`}
          {...errorFor("name")}
          className="site-hero-input focus-ring"
          placeholder={hero.form.name}
          autoComplete="name"
          maxLength={80}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <label className="sr-only" htmlFor={`${id}-phone`}>
          {hero.form.phone}
        </label>
        <input
          id={`${id}-phone`}
          {...errorFor("phone")}
          className="site-hero-input tnum focus-ring"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder={hero.form.phone}
          value={phone}
          onChange={(event) => setPhone(maskPhone(event.target.value))}
        />
        <button type="submit" className="site-btn mono-btn-primary site-hero-submit focus-ring">
          {hero.primary}
        </button>
      </form>
      {invalid ? (
        <p id={`${id}-error`} role="alert" className="site-caption site-hero-error">
          {invalid.text}
        </p>
      ) : null}
      <Link
        to="/demo"
        data-cta="demo"
        onClick={() => track("cta_demo", { place: "hero" })}
        className="site-hero-demo focus-ring"
      >
        {hero.demo}
      </Link>
      <p className="site-caption site-hero-note" data-hero-note>
        {hero.note}
      </p>
    </div>
  );
}
