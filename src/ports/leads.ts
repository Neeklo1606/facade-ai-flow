import { z } from "zod";
import { CREW_OPTIONS, LEAD_SOURCES } from "@/lib/site/lead-fields";

/**
 * Порт заявок с сайта (ADR-051, 01_SPEC 11.1). Адаптер выбирается на сервере по окружению:
 * Telegram владельца, вебхук (например, таблица «Лиды») или ничего.
 */
export { LEAD_SOURCES, CREW_OPTIONS, type LeadSource } from "@/lib/site/lead-fields";

export const leadInput = z
  .object({
    name: z.string().trim().min(1).max(80),
    company: z.string().trim().max(120).default(""),
    phone: z
      .string()
      .trim()
      .max(24)
      .refine((value) => value.replace(/\D/g, "").length === 11, "phone"),
    crews: z.enum(CREW_OPTIONS),
    source: z.enum(LEAD_SOURCES),
    /** Код партнёра из ?src=: латиница, цифры, дефис */
    src: z
      .string()
      .trim()
      .max(40)
      .regex(/^[\w-]*$/)
      .default(""),
    page: z.string().max(200).default(""),
    consent: z.literal(true),
    /** Поле-ловушка: человек его не видит и не заполняет */
    website: z.string().max(200).default(""),
  })
  .strict();

export type LeadInput = z.input<typeof leadInput>;
export type Lead = Omit<z.output<typeof leadInput>, "website" | "consent"> & { at: string };

export type LeadSinkKind = "telegram" | "webhook" | "none";

export type LeadSendResult = { ok: true } | { ok: false; reason: "not-configured" | "failed" };

export interface LeadSink {
  readonly kind: LeadSinkKind;
  send(lead: Lead): Promise<LeadSendResult>;
}
