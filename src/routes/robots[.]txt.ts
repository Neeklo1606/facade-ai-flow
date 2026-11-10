import { createFileRoute } from "@tanstack/react-router";
import { serverEnv } from "@/lib/runtime-env";
import { robotsTxt } from "@/lib/site/seo";

/** robots.txt по правилу SEO_INDEX (ADR-067, раздел 9.2) */
export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: () =>
        new Response(robotsTxt(serverEnv("SEO_INDEX") === "on"), {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        }),
    },
  },
});
