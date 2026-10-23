import { useEffect, useState } from "react";
import { metrikaAnalytics, noneAnalytics } from "@/adapters/analytics";
import type { AnalyticsEvent, AnalyticsParams, AnalyticsPort } from "@/ports/analytics";
import { METRIKA_ID } from "./config";

/**
 * Аналитика сайта через порт (ADR-051, 01_SPEC 11.2). Без согласия адаптер `none`: скрипт
 * Метрики не загружается вовсе, события отбрасываются. Решение в localStorage.
 */
const CONSENT_KEY = "gaika-analytics-consent";
export type Consent = "yes" | "no" | null;

export function readConsent(): Consent {
  try {
    const value = window.localStorage.getItem(CONSENT_KEY);
    return value === "yes" || value === "no" ? value : null;
  } catch {
    return null;
  }
}

let port: AnalyticsPort = noneAnalytics;
const listeners = new Set<() => void>();

function apply(consent: Consent) {
  port = consent === "yes" && METRIKA_ID ? metrikaAnalytics(METRIKA_ID) : noneAnalytics;
}

export function setConsent(value: "yes" | "no") {
  try {
    window.localStorage.setItem(CONSENT_KEY, value);
  } catch {
    // без хранилища решение действует до закрытия вкладки
  }
  apply(value);
  for (const listener of listeners) listener();
}

/** Согласие спрашивается, только если счётчик задан: иначе спрашивать не о чем */
export const analyticsConfigured = () => Boolean(METRIKA_ID);

let started = false;
function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  apply(readConsent());
}

export function track(event: AnalyticsEvent, params?: AnalyticsParams) {
  if (typeof window === "undefined") return;
  start();
  port.track(event, params);
}

/** Состояние согласия для строки внизу экрана; до гидратации null и строки нет */
export function useConsent(): [Consent | "unknown", (value: "yes" | "no") => void] {
  const [consent, setLocal] = useState<Consent | "unknown">("unknown");
  useEffect(() => {
    start();
    const sync = () => setLocal(readConsent());
    sync();
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, []);
  return [consent, setConsent];
}
