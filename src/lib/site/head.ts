/**
 * Мета страниц сайта (ADR-047, 01_SPEC 11.3): заголовок, описание, canonical, robots и превью
 * ссылки. Превью важнее заголовка: ссылку пересылают в Telegram, MAX и WhatsApp.
 * Картинки превью по страницам появятся в L6; до тех пор общая /og-preview.jpg.
 */
import { NEVER_INDEXED, PUBLIC_URL, seoIndexEnabled } from "./config";

export function siteHead({
  path,
  title,
  description,
  image = "/og-preview.jpg",
}: {
  path: string;
  title: string;
  description: string;
  image?: string;
}) {
  const url = PUBLIC_URL + (path === "/" ? "/" : path);
  const index = seoIndexEnabled() && !(NEVER_INDEXED as readonly string[]).includes(path);
  const picture = PUBLIC_URL + image;
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { name: "robots", content: index ? "index, follow" : "noindex, nofollow" },
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
    links: [{ rel: "canonical", href: url }],
  };
}
