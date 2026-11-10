import { createFileRoute } from "@tanstack/react-router";
import { serverEnv } from "@/lib/runtime-env";
import { sitemapXml } from "@/lib/site/seo";

/**
 * Карта сайта (ADR-067, раздел 9.3): публичные страницы с абсолютными адресами от PUBLIC_URL.
 * Без SEO_INDEX=on её нет: закрытый сайт не раздаёт список страниц
 */
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: () =>
        serverEnv("SEO_INDEX") === "on"
          ? new Response(sitemapXml(), {
              headers: {
                "content-type": "application/xml; charset=utf-8",
                "cache-control": "public, max-age=3600",
              },
            })
          : new Response("Not found", { status: 404, headers: { "x-robots-tag": "noindex" } }),
    },
  },
});
