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

function Picture({
  id,
  priority,
  sizes,
  lazy = !priority,
}: {
  id: ShotId;
  priority: boolean;
  sizes: string;
  /** Скрытая на телефоне копия грузится лениво даже на первом экране: иначе телефон скачал бы её зря */
  lazy?: boolean;
}) {
  const size = SHOT_SIZES[id]!;
  return (
    <picture>
      <source
        type="image/avif"
        srcSet={size.widths.map((w) => `/site/shots/${id}-${w}.avif ${w}w`).join(", ")}
        sizes={sizes}
      />
      <source
        type="image/webp"
        srcSet={size.widths.map((w) => `/site/shots/${id}-${w}.webp ${w}w`).join(", ")}
        sizes={sizes}
      />
      <img
        src={`/site/shots/${id}-${size.widths[0]}.webp`}
        alt={SHOT_ALT[id]}
        width={size.w}
        height={size.h}
        loading={lazy ? "lazy" : "eager"}
        decoding="async"
        {...(priority ? { fetchPriority: "high" as const } : {})}
        className="block h-auto w-full"
        data-shot={id}
      />
    </picture>
  );
}

function Fragment({ id }: { id: ShotId }) {
  return (
    <div role="img" aria-label={SHOT_ALT[id]} className="site-fragment-stage" data-fragment={id}>
      {FALLBACK[id]()}
    </div>
  );
}

/**
 * Снимок экрана (раздел 7). На телефоне уменьшенный снимок компьютера не читается
 * (раздел 5.2): до 768 вместо него стоит телефонный снимок `phone`, если он задан,
 * или живой фрагмент тех же данных. Скрытая копия грузится лениво и не мешает первому экрану
 */
export function Shot({
  id,
  phone: phoneId,
  priority = false,
  caption = true,
  className,
  sizes,
}: {
  id: ShotId;
  /** Телефонный снимок вместо снимка компьютера до 768 */
  phone?: ShotId;
  /** Визуал первого экрана: грузится сразу, fetchpriority high (раздел 9.9) */
  priority?: boolean;
  caption?: boolean;
  className?: string;
  sizes?: string;
}) {
  const size = SHOT_SIZES[id];
  const phone = PHONE_SHOTS.has(id);
  const desktopSizes = sizes ?? "(min-width: 1024px) 640px, 100vw";
  let body: ReactNode;
  if (!size) {
    body = (
      <div className={cn("site-shot", phone ? "is-phone" : "is-desktop", "is-fragment")}>
        <Fragment id={id} />
      </div>
    );
  } else if (phone) {
    body = (
      <div className="site-shot is-phone">
        <Picture id={id} priority={priority} sizes={sizes ?? "320px"} />
      </div>
    );
  } else {
    const small =
      phoneId && SHOT_SIZES[phoneId] ? (
        <div className="site-shot is-phone">
          <Picture id={phoneId} priority={false} sizes="320px" />
        </div>
      ) : (
        <div className="site-shot is-desktop is-fragment">
          <Fragment id={id} />
        </div>
      );
    body = (
      <>
        <div className="site-shot-phone">{small}</div>
        <div className="site-shot-desk site-shot is-desktop">
          <Picture id={id} priority={priority} sizes={desktopSizes} lazy />
        </div>
      </>
    );
  }
  return (
    <figure className={cn("m-0", className)}>
      {body}
      {caption ? (
        <figcaption className="site-caption mt-3 text-text-3">{SAMPLE_NOTE}</figcaption>
      ) : null}
    </figure>
  );
}
