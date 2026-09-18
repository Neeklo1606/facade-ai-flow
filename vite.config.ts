// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";

/**
 * Витрина дизайн-системы — внутренний инструмент команды, в продукт она не едет (TASK-A5, п. 1).
 * В production-сборке модуль маршрута подменяется заглушкой: галерея виджетов не попадает
 * в бандл, а сам адрес отвечает экраном «Раздел не найден».
 * Собрать витрину намеренно: KEEP_DESIGN_SYSTEM=1 bun run build.
 */
function excludeDesignSystem(): Plugin {
  const stub = [
    'import { createFileRoute, notFound } from "@tanstack/react-router";',
    'export const Route = createFileRoute("/design-system")({',
    "  beforeLoad: () => {",
    "    throw notFound();",
    "  },",
    "});",
  ].join("\n");

  return {
    name: "neeklo:exclude-design-system",
    enforce: "pre",
    apply: "build",
    load(id) {
      if (process.env["KEEP_DESIGN_SYSTEM"] === "1") return null;
      return id.includes("/routes/design-system.tsx") ? stub : null;
    },
  };
}

export default defineConfig({
  plugins: [excludeDesignSystem()],
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
