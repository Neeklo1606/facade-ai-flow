import { leadSinkFromEnv } from "@/adapters/leads";
import { serverEnv } from "@/lib/runtime-env";
import { leadInput, type Lead, type LeadSink } from "@/ports/leads";

/**
 * Приём заявки с сайта (ADR-051, 01_SPEC 11.1). Ответы: 204 принято, 400 неверно, 429 лимит,
 * 501 `{"sink":"none"}` приём не подключён, 502 адаптер не доставил. В журнал хостинга
 * только факт заявки, источник и код партнёра: имя, компания и телефон туда не попадают.
 */
export const LEAD_LIMIT = 5;
export const LEAD_WINDOW_MS = 60 * 60 * 1000;

/**
 * Счётчик заявок с IP в памяти воркера. У Cloudflare память своя у каждого изолята
 * и теряется при перезапуске: лимит приблизительный, записано в ADR-051
 */
export function createRateLimiter(limit = LEAD_LIMIT, windowMs = LEAD_WINDOW_MS) {
  const hits = new Map<string, number[]>();
  return (key: string, now: number): boolean => {
    const recent = (hits.get(key) ?? []).filter((at) => now - at < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) hits.delete(hits.keys().next().value as string);
    return true;
  };
}

export type LeadDeps = {
  sink: () => LeadSink;
  allow: (key: string, now: number) => boolean;
  now: () => Date;
  log: (line: string) => void;
};

const defaultAllow = createRateLimiter();

const defaults: LeadDeps = {
  sink: () => leadSinkFromEnv(serverEnv),
  allow: defaultAllow,
  now: () => new Date(),
  log: (line) => console.info(line),
};

/**
 * Адрес отправителя: у Cloudflare `cf-connecting-ip`, за прокси `x-forwarded-for`. Без них адрес
 * неизвестен, и лимит не применяется: общий счётчик на всех «неизвестных» закрыл бы приём
 * заявок для всех после пятой (находка приёмки L9)
 */
function clientIp(request: Request): string | null {
  return (
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    null
  );
}

export async function leadResponse(request: Request, deps: LeadDeps = defaults): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const parsed = leadInput.safeParse(body);
  if (!parsed.success) return new Response(null, { status: 400 });
  const { website, consent: _consent, ...fields } = parsed.data;
  const now = deps.now();
  // Ловушка: бот получает тот же ответ, что и человек, и не узнаёт, что пойман
  if (website) return new Response(null, { status: 204 });
  const ip = clientIp(request);
  if (ip && !deps.allow(ip, now.getTime())) return new Response(null, { status: 429 });

  const lead: Lead = { ...fields, at: now.toISOString() };
  const sink = deps.sink();
  const result = await sink.send(lead);
  deps.log(
    JSON.stringify({
      channel: "lead",
      at: lead.at,
      source: lead.source,
      src: lead.src || null,
      sink: sink.kind,
      ok: result.ok,
      limited: ip !== null,
    }),
  );
  if (result.ok) return new Response(null, { status: 204 });
  if (result.reason === "not-configured") {
    return Response.json({ sink: "none" }, { status: 501 });
  }
  return new Response(null, { status: 502 });
}
