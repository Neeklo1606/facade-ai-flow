import type { ReactNode } from "react";
import { SHOT_SIZES } from "@/lib/site/shots.gen";
import { SAMPLE_NOTE } from "@/lib/site/copy";
import { cn } from "@/lib/utils";
import {
  BotFragment,
  CalcFragment,
  DocsFragment,
  QueueFragment,
  ReportFragment,
  SupplyFragment,
  WeekTableFragment,
} from "./landing/fragments";

/**
 * Визуалы сайта (ADR-067, раздел 7): снимок настоящего экрана демо, если его снял
 * `bun run site:shots`, иначе живой фрагмент тех же данных. Под каждым подпись «Пример из
 * демо, данные вымышленные». Телефонные снимки в простой скруглённой рамке, без нарисованных
 * телефонов.
 */
export type ShotId =
  | "time-brigade"
  | "time-review"
  | "time-week"
  | "time-tabel"
  | "supply-request"
  | "supply-offers"
  | "supply-receive"
  | "supply-overview"
  | "docs-materials"
  | "docs-package"
  | "docs-act"
  | "docs-registry";

/** Телефонные снимки (390) и снимки компьютера (1280) */
export const PHONE_SHOTS: ReadonlySet<ShotId> = new Set([
  "time-brigade",
  "supply-request",
  "supply-receive",
]);

/** Подписи alt по смыслу (раздел 9.6) */
export const SHOT_ALT: Record<ShotId, string> = {
  "time-brigade": "Экран бригадира «Сегодня» в ГАЙКЕ",
  "time-review": "Проверка записей бригад в ГАЙКЕ",
  "time-week": "Неделя руководителя в ГАЙКЕ: начислено, часы и причины до закрытия",
  "time-tabel": "Табель бригад по объектам и дням в ГАЙКЕ",
  "supply-request": "Черновик заявки прораба на материал в ГАЙКЕ",
  "supply-offers": "Сравнение предложений поставщиков в ГАЙКЕ",
  "supply-receive": "Приёмка поставки на объекте в ГАЙКЕ",
  "supply-overview": "Сводка снабжения руководителя: просрочки и превышения сметы",
  "docs-materials": "Принятые материалы с сертификатами у ПТО в ГАЙКЕ",
  "docs-package": "Пакет актов АОСР с комплектностью в ГАЙКЕ",
  "docs-act": "Черновик акта АОСР с источниками полей в ГАЙКЕ",
  "docs-registry": "Реестр исполнительной документации в ГАЙКЕ",
};

/** Живой фрагмент вместо снимка: те же данные демо, что в приложении */
const FALLBACK: Record<ShotId, () => ReactNode> = {
  "time-brigade": () => <BotFragment />,
  "time-review": () => <QueueFragment />,
  "time-week": () => <CalcFragment />,
  "time-tabel": () => <WeekTableFragment />,
  "supply-request": () => <SupplyFragment />,
  "supply-offers": () => <SupplyFragment />,
  "supply-receive": () => <SupplyFragment />,
  "supply-overview": () => <SupplyFragment />,
  "docs-materials": () => <ReportFragment />,
  "docs-package": () => <DocsFragment />,
  "docs-act": () => <DocsFragment />,
  "docs-registry": () => <DocsFragment />,
};

export const hasShot = (id: ShotId) => Boolean(SHOT_SIZES[id]);

export function Shot({
  id,
  priority = false,
  caption = true,
  className,
  sizes,
}: {
  id: ShotId;
  /** Визуал первого экрана: грузится сразу, fetchpriority high (раздел 9.9) */
  priority?: boolean;
  caption?: boolean;
  className?: string;
  sizes?: string;
}) {
  const size = SHOT_SIZES[id];
  const phone = PHONE_SHOTS.has(id);
  const body = size ? (
    <picture>
      <source
        type="image/avif"
        srcSet={size.widths.map((w) => `/site/shots/${id}-${w}.avif ${w}w`).join(", ")}
        sizes={sizes ?? (phone ? "320px" : "(min-width: 1024px) 640px, 100vw")}
      />
      <source
        type="image/webp"
        srcSet={size.widths.map((w) => `/site/shots/${id}-${w}.webp ${w}w`).join(", ")}
        sizes={sizes ?? (phone ? "320px" : "(min-width: 1024px) 640px, 100vw")}
      />
      <img
        src={`/site/shots/${id}-${size.widths[0]}.webp`}
        alt={SHOT_ALT[id]}
        width={size.w}
        height={size.h}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        {...(priority ? { fetchPriority: "high" as const } : {})}
        className="block h-auto w-full"
        data-shot={id}
      />
    </picture>
  ) : (
    <div role="img" aria-label={SHOT_ALT[id]} className="site-fragment-stage" data-fragment={id}>
      {FALLBACK[id]()}
    </div>
  );
  return (
    <figure className={cn("m-0", className)}>
      <div className={cn("site-shot", phone ? "is-phone" : "is-desktop", !size && "is-fragment")}>
        {body}
      </div>
      {caption ? (
        <figcaption className="site-caption mt-3 text-text-3">{SAMPLE_NOTE}</figcaption>
      ) : null}
    </figure>
  );
}
