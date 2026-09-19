import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

const serverOnly = {
  name: "server-only",
  message:
    "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
};

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi", ".wrangler"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": ["error", { paths: [serverOnly] }],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // ADR-013, п. 5: данные фикстур — только слою данных. Импортировать их можно в самих фикстурах
    // и в демо-адаптере; остальной код получает данные через порты. Для экранов действует
    // более строгий запрет ниже — он перекрывает этот
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/adapters/fixtures/**", "src/adapters/demo/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [serverOnly],
          patterns: [
            {
              group: [
                "@/adapters/fixtures",
                "@/adapters/fixtures/*",
                "**/adapters/fixtures",
                "**/adapters/fixtures/*",
                "**/fixtures/data/*",
              ],
              message:
                "Данные фикстур импортируют только adapters/fixtures и adapters/demo (ADR-013). Берите данные через порты.",
            },
          ],
        },
      ],
    },
  },
  {
    // ADR-001, п. 5: экраны и компоненты получают данные через слой данных, а не из фикстур и адаптеров
    files: ["src/components/**/*.{ts,tsx}", "src/routes/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [serverOnly],
          patterns: [
            {
              group: ["@/mock", "@/mock/*", "**/mock/*"],
              message:
                "Демо-данные не импортируются в экраны: данные приходят из слоя данных (ADR-001).",
            },
            {
              group: ["@/adapters", "@/adapters/*", "**/adapters/*"],
              message: "Адаптеры доступны только слою данных и серверным функциям (ADR-001).",
            },
            {
              group: ["@/ports", "@/ports/*"],
              message: "Порты вызываются из серверных функций, а не из интерфейса (ADR-001).",
            },
            {
              group: ["@/domain", "@/domain/*"],
              message:
                "Формулы (деньги, статусы, сводки) считаются в слое данных и приходят готовыми (P3-1).",
            },
          ],
        },
      ],
    },
  },
  eslintPluginPrettier,
);
