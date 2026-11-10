/**
 * Мета страниц сайта (ADR-047, ADR-067 раздел 9): заголовок, описание, canonical, robots,
 * превью ссылки, коды подтверждения поисковиков и структурированные данные JSON-LD.
 * Превью важнее заголовка: ссылку пересылают в Telegram, MAX и WhatsApp.
 * Картинки превью в public/og/ снимает scripts/og-images.ts (ADR-051).
 */
import { PUBLIC_URL, seoIndexEnabled, VERIFICATION } from "./config";
import { isIndexablePath } from "./paths";

export type JsonLd = Record<string, unknown>;
export type FaqItem = { q: string; a: string };

export const absoluteUrl = (path: string) => PUBLIC_URL + (path === "/" ? "/" : path);

/** Разработчик продукта: без выдуманных реквизитов, только имя и адрес сайта */
export function organizationLd(): JsonLd {
  return {
    "@type": "Organization",
    "@id": `${PUBLIC_URL}/#org`,
    name: "neeklo.studio",
    url: `${PUBLIC_URL}/`,
  };
}

/** Продукт: без рейтингов и цены, их нет (ADR-067, раздел 9.5) */
export function softwareLd({
  name,
  description,
  path,
}: {
  name: string;
  description: string;
  path: string;
}): JsonLd {
  return {
    "@type": "SoftwareApplication",
    name,
    description,
    url: absoluteUrl(path),
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    inLanguage: "ru",
    publisher: { "@id": `${PUBLIC_URL}/#org` },
  };
}

/** Вопросы страницы: те же тексты, что видит человек (сверяет e2e) */
export function faqLd(items: readonly FaqItem[]): JsonLd {
  return {
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

export function breadcrumbLd(items: readonly { name: string; path: string }[]): JsonLd {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

/** `<` внутри строки закрыл бы тег script: экранируется по правилам JSON */
export const jsonLdText = (graph: readonly JsonLd[]) =>
  JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");

/** Golos Text 500 и 600: заголовки и кнопки первого экрана без подмены шрифта (раздел 9.9) */
const FONT_PRELOAD = ["cyrillic-500", "cyrillic-600"].map((name) => ({
  rel: "preload",
  href: `/fonts/golos-text-${name}.woff2`,
  as: "font",
  type: "font/woff2",
  crossOrigin: "anonymous" as const,
}));

export function siteHead({
  path,
  title,
  description,
  image = "/og-preview.jpg",
  jsonLd,
}: {
  path: string;
  title: string;
  description: string;
  image?: string;
  jsonLd?: readonly JsonLd[];
}) {
  const url = absoluteUrl(path);
  const seo = seoIndexEnabled();
  const index = isIndexablePath(path, seo);
  const picture = PUBLIC_URL + image;
  const verification = [
    VERIFICATION.yandex ? { name: "yandex-verification", content: VERIFICATION.yandex } : null,
    VERIFICATION.google ? { name: "google-site-verification", content: VERIFICATION.google } : null,
  ].filter((item): item is { name: string; content: string } => item !== null);
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { name: "robots", content: index ? "index, follow" : "noindex, nofollow" },
      // Решение сервера для вкладки (config.ts, seoIndexEnabled)
      { name: "gaika-seo", content: seo ? "on" : "off" },
      ...verification,
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "ГАЙКА" },
      { property: "og:locale", content: "ru_RU" },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:url", content: url },
      { property: "og:image", content: picture },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: picture },
    ],
    links: [{ rel: "canonical", href: url }, ...FONT_PRELOAD],
    scripts: jsonLd?.length
      ? [{ type: "application/ld+json", children: jsonLdText([organizationLd(), ...jsonLd]) }]
      : [],
  };
}
