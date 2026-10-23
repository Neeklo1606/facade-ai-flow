/**
 * Контур /gas (ADR-047): публичный «Демо-подрядчик» или личный контур заказчика.
 *
 * Публичный контур собран из публичного набора и живёт в клиентском коде. Личный приходит
 * с сервера загрузчиком маршрута `/gas` только по личной ссылке: название заказчика
 * и его отчёт в клиентском коде не лежат. Экраны читают контур хуком, а не импортом.
 */
import { createContext, useContext, type ReactNode } from "react";
import type { FactReport } from "@/data/mock/fact-report-types";
import { publicReport } from "@/data/mock/public/seed";
import { PUBLIC_SCENARIO_PLACES, type ScenarioPlaces } from "@/data/mock/public/places";
import type { GasQuestion } from "@/lib/gas-ops/questions";

export type GasContourKind = "public" | "client";

export interface GasBrand {
  /** Полное название подрядчика: «Для ...» на стартовом экране */
  client: string;
  /** Короткое имя для узких мест: шапка бота, вкладка браузера */
  clientShort: string;
  product: string;
  credit: string;
  /** Период недельного отчёта, на котором построен показ */
  periodLabel: string;
}

export interface GasContour {
  kind: GasContourKind;
  brand: GasBrand;
  report: FactReport;
  places: ScenarioPlaces;
  /** Вопросы к согласованию: только личный контур, в публичном пусто */
  questions: readonly GasQuestion[];
}

export const GAS_PRODUCT = "Учёт выработки бригад";
export const GAS_CREDIT = "Разработка neeklo.studio";

/** «28.09 – 03.10.2026» из дней отчёта */
export function periodLabelOf(report: FactReport): string {
  const [from, to] = [report.meta.week.from, report.meta.week.to];
  const short = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
  return `${short(from)} – ${short(to)}.${to.slice(0, 4)}`;
}

export const publicContour: GasContour = {
  kind: "public",
  brand: {
    client: "Демо-подрядчик",
    clientShort: "Демо-подрядчик",
    product: GAS_PRODUCT,
    credit: GAS_CREDIT,
    periodLabel: periodLabelOf(publicReport),
  },
  report: publicReport,
  places: PUBLIC_SCENARIO_PLACES,
  questions: [],
};

/** Ответ сервера о контуре: публичный без данных или личный с отчётом и брендом */
export type GasContourPayload =
  | { kind: "public" }
  | {
      kind: "client";
      brand: GasBrand;
      report: FactReport;
      places: ScenarioPlaces;
      questions: GasQuestion[];
    };

export function contourOf(payload: GasContourPayload | null | undefined): GasContour {
  if (payload?.kind !== "client") return publicContour;
  return {
    kind: "client",
    brand: payload.brand,
    report: payload.report,
    places: payload.places,
    questions: payload.questions,
  };
}

const ContourContext = createContext<GasContour>(publicContour);

export function GasContourProvider({
  value,
  children,
}: {
  value: GasContour;
  children: ReactNode;
}) {
  return <ContourContext.Provider value={value}>{children}</ContourContext.Provider>;
}

export function useGasContour(): GasContour {
  return useContext(ContourContext);
}

export function useGasBrand(): GasBrand {
  return useContext(ContourContext).brand;
}

/** Личный контур заказчика: сверка с файлом и вопросы к согласованию видны только в нём */
export function useIsClientContour(): boolean {
  return useContext(ContourContext).kind === "client";
}

/**
 * Подпись источника записи. В личном контуре записи недели перенесены из отчёта заказчика,
 * в публичном это вымышленный пример той же формы: слово «факт» там было бы неправдой.
 */
export function sourceLabel(
  source: "fact-report" | "mock" | "mixed",
  kind: GasContourKind,
): string {
  if (source === "mock") return "Демо";
  if (kind === "public") return source === "mixed" ? "Пример и демо" : "Пример";
  return source === "mixed" ? "Факт и демо" : "Факт";
}
