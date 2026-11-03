/**
 * OpenAPI учёта времени из контрактов zod (ADR-061, 14). Запуск: `bun run api:openapi`.
 * Пути — черновик API из BACKEND HANDOFF v1.1 (раздел 4) с нашими дополнениями; схемы —
 * `src/contracts/gas-api.ts` и строки таблиц `src/contracts/gas.ts`. Тест держит
 * `docs/api/openapi.yaml` равным выводу `gasOpenApi()`.
 */
import { z, type ZodTypeAny } from "zod";
import {
  gasAnswerInput,
  gasApiError,
  gasAuditItem,
  gasBrigade,
  gasCloseWeekInput,
  gasCreateEntryInput,
  gasEstimate,
  gasEstimateApprove,
  gasEstimateLine,
  gasExport,
  gasExportInput,
  gasMe,
  gasObject,
  gasQueueItem,
  gasReopenWeekInput,
  gasReview,
  gasReviewInput,
  gasTimeEntry,
  gasUpdateEntryInput,
  gasWeekVersion,
  gasWeeklyReport,
} from "../src/contracts/gas-api";

export const OPENAPI_FILE = "docs/api/openapi.yaml";

type Json = Record<string, unknown>;

/** zod → JSON Schema (OpenAPI 3.1): только те виды, что есть в контрактах */
export function schemaOf(type: ZodTypeAny): Json {
  const def = type._def as { typeName: string; description?: string } & Record<string, unknown>;
  const described = (out: Json): Json =>
    type.description ? { ...out, description: type.description } : out;
  switch (def.typeName) {
    case "ZodString": {
      const checks = (def["checks"] as { kind: string; value?: number }[]) ?? [];
      const out: Json = { type: "string" };
      for (const check of checks) {
        if (check.kind === "date") out["format"] = "date";
        if (check.kind === "datetime") out["format"] = "date-time";
        if (check.kind === "min") out["minLength"] = check.value;
        if (check.kind === "max") out["maxLength"] = check.value;
      }
      return described(out);
    }
    case "ZodNumber": {
      const checks = (def["checks"] as { kind: string; value?: number }[]) ?? [];
      const out: Json = { type: checks.some((c) => c.kind === "int") ? "integer" : "number" };
      for (const check of checks) {
        if (check.kind === "min") out["minimum"] = check.value;
        if (check.kind === "max") out["maximum"] = check.value;
      }
      return described(out);
    }
    case "ZodBoolean":
      return described({ type: "boolean" });
    case "ZodUnknown":
    case "ZodAny":
      return described({});
    case "ZodEnum":
      return described({ type: "string", enum: [...(def["values"] as string[])] });
    case "ZodLiteral":
      return described({ const: def["value"] });
    case "ZodArray":
      return described({ type: "array", items: schemaOf(def["type"] as ZodTypeAny) });
    case "ZodTuple":
      return described({
        type: "array",
        prefixItems: (def["items"] as ZodTypeAny[]).map(schemaOf),
        minItems: (def["items"] as ZodTypeAny[]).length,
      });
    case "ZodRecord":
      return described({
        type: "object",
        additionalProperties: schemaOf(def["valueType"] as ZodTypeAny),
      });
    case "ZodUnion":
      return described({ anyOf: (def["options"] as ZodTypeAny[]).map(schemaOf) });
    case "ZodNullable": {
      const inner = schemaOf(def["innerType"] as ZodTypeAny);
      return described({ anyOf: [inner, { type: "null" }] });
    }
    case "ZodOptional":
    case "ZodDefault":
      return schemaOf(def["innerType"] as ZodTypeAny);
    case "ZodEffects":
      return schemaOf(def["schema"] as ZodTypeAny);
    case "ZodObject": {
      const shape = (type as z.AnyZodObject).shape as Record<string, ZodTypeAny>;
      const required = Object.entries(shape)
        .filter(([, value]) => !value.isOptional())
        .map(([key]) => key);
      return described({
        type: "object",
        properties: Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, schemaOf(v)])),
        ...(required.length ? { required } : {}),
        additionalProperties: false,
      });
    }
    default:
      throw new Error(`gas-openapi: вид ${def.typeName} не поддержан`);
  }
}

const SCHEMAS = {
  Me: gasMe,
  Object: gasObject,
  Brigade: gasBrigade,
  TimeEntry: gasTimeEntry,
  CreateTimeEntry: gasCreateEntryInput,
  UpdateTimeEntry: gasUpdateEntryInput.omit({ id: true }),
  ReviewDecision: gasReviewInput.omit({ id: true }),
  ClarifyAnswer: gasAnswerInput.omit({ id: true }),
  Review: gasReview,
  QueueItem: gasQueueItem,
  Estimate: gasEstimate,
  EstimateLine: gasEstimateLine,
  EstimateApprove: gasEstimateApprove,
  WeeklyReport: gasWeeklyReport,
  WeekVersion: gasWeekVersion,
  CloseWeek: gasCloseWeekInput.extend({
    expectedVersion: z.number().int().min(0).describe("версия недели, по которой принято решение"),
  }),
  ReopenWeek: gasReopenWeekInput,
  ExportRequest: gasExportInput.omit({ weekFrom: true }),
  Export: gasExport,
  AuditItem: gasAuditItem,
  Error: gasApiError,
  MaxInvite: z
    .object({
      url: z.string().describe("ссылка на бота с кодом в параметре start"),
      expiresAt: z.string(),
    })
    .strict(),
} satisfies Record<string, ZodTypeAny>;

type SchemaName = keyof typeof SCHEMAS;

const ref = (name: SchemaName) => ({ $ref: `#/components/schemas/${name}` });
const list = (name: SchemaName) => ({ type: "array", items: ref(name) });
const page = (name: SchemaName) => ({
  type: "object",
  properties: { items: list(name), nextCursor: { anyOf: [{ type: "string" }, { type: "null" }] } },
  required: ["items", "nextCursor"],
});
const ok = (schema: Json, description = "Успех") => ({
  description,
  content: { "application/json": { schema } },
});
const body = (name: SchemaName) => ({
  required: true,
  content: { "application/json": { schema: ref(name) } },
});
const errors = (...codes: number[]) =>
  Object.fromEntries(
    codes.map((code) => [String(code), { $ref: `#/components/responses/E${code}` }]),
  );
const query = (name: string, schema: Json, description: string, required = false) => ({
  name,
  in: "query",
  required,
  description,
  schema,
});
const pathId = (name = "id") => ({ name, in: "path", required: true, schema: { type: "string" } });
const date = { type: "string", format: "date" };

/** Пути черновика HANDOFF v1.1 (раздел 4) и наши дополнения с пометкой */
function paths(): Json {
  return {
    "/api/v1/me": {
      get: {
        summary: "Кто вошёл: пользователь, роль, бригада",
        responses: { "200": ok(ref("Me")), ...errors(401) },
      },
    },
    "/api/v1/objects": {
      get: {
        summary: "Объекты; бригадиру только разрешённые",
        parameters: [query("assignedToMe", { type: "boolean" }, "только объекты моей бригады")],
        responses: { "200": ok(list("Object")), ...errors(401) },
      },
    },
    "/api/v1/brigades": {
      get: { summary: "Бригады", responses: { "200": ok(list("Brigade")), ...errors(401, 403) } },
    },
    "/api/v1/time-entries": {
      get: {
        summary: "Записи времени; бригадиру только своей бригады и без сумм",
        parameters: [
          query("from", date, "первый день"),
          query("to", date, "последний день"),
          query("status", { type: "string" }, "статус записи"),
          query("objectId", { type: "string" }, "объект"),
          query("cursor", { type: "string" }, "продолжение списка"),
        ],
        responses: { "200": ok(page("TimeEntry")), ...errors(400, 401) },
      },
      post: {
        summary: "Новая запись; повтор с тем же ключом возвращает ту же запись",
        parameters: [
          {
            name: "Idempotency-Key",
            in: "header",
            required: true,
            description: "ключ отправки; в порте — clientKey",
            schema: { type: "string", maxLength: 200 },
          },
        ],
        requestBody: body("CreateTimeEntry"),
        responses: {
          "201": ok(ref("TimeEntry"), "Создана"),
          "200": ok(ref("TimeEntry"), "Повтор: та же запись"),
          ...errors(400, 401, 403, 409, 422),
        },
      },
    },
    "/api/v1/time-entries/{id}": {
      patch: {
        summary: "Правка записи; проверяющему причина обязательна",
        parameters: [
          pathId(),
          {
            name: "If-Match",
            in: "header",
            required: true,
            description: "версия записи, по которой принято решение",
            schema: { type: "string" },
          },
        ],
        requestBody: body("UpdateTimeEntry"),
        responses: { "200": ok(ref("TimeEntry")), ...errors(400, 401, 403, 404, 409, 422) },
      },
    },
    "/api/v1/time-entries/{id}/review": {
      post: {
        summary: "Решение проверки: принять, отклонить, вернуть на уточнение",
        parameters: [pathId()],
        requestBody: body("ReviewDecision"),
        responses: { "200": ok(ref("TimeEntry")), ...errors(400, 401, 403, 404, 409, 422) },
      },
    },
    "/api/v1/time-entries/{id}/answer": {
      post: {
        summary: "Дополнение: ответ бригадира на уточнение",
        parameters: [pathId()],
        requestBody: body("ClarifyAnswer"),
        responses: { "200": ok(ref("TimeEntry")), ...errors(400, 401, 403, 404, 422) },
      },
    },
    "/api/v1/time-entries/{id}/reviews": {
      get: {
        summary: "Дополнение: история проверки записи",
        parameters: [pathId()],
        responses: { "200": ok(list("Review")), ...errors(401, 403, 404) },
      },
    },
    "/api/v1/reviews/queue": {
      get: {
        summary: "Очередь проверки: сначала с замечаниями",
        responses: { "200": ok(list("QueueItem")), ...errors(401, 403) },
      },
    },
    "/api/v1/estimates/import": {
      post: {
        summary: "Загрузка сметы: исходник сохраняется, разбор детерминированный",
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  file: { type: "string", format: "binary" },
                  objectId: { type: "string" },
                },
                required: ["file"],
              },
            },
          },
        },
        responses: { "201": ok(ref("Estimate"), "Загружена"), ...errors(400, 401, 403, 422) },
      },
    },
    "/api/v1/estimates/{id}/preview": {
      get: {
        summary: "Предпросмотр разбора: лист, ячейка, значение, уверенность",
        parameters: [pathId()],
        responses: {
          "200": ok({
            type: "object",
            properties: { estimate: ref("Estimate"), lines: list("EstimateLine") },
            required: ["estimate", "lines"],
          }),
          ...errors(401, 403, 404),
        },
      },
    },
    "/api/v1/estimates/{id}/approve": {
      post: {
        summary: "Подтверждение сметы человеком: неизменяемая версия",
        parameters: [pathId()],
        requestBody: body("EstimateApprove"),
        responses: { "200": ok(ref("Estimate")), ...errors(400, 401, 403, 404, 409, 422) },
      },
    },
    "/api/v1/reports/weekly": {
      get: {
        summary: "Отчёт недели; бригадиру недоступен",
        parameters: [query("weekStart", date, "понедельник недели", true)],
        responses: { "200": ok(ref("WeeklyReport")), ...errors(400, 401, 403, 404) },
      },
    },
    "/api/v1/weeks/{id}/close": {
      post: {
        summary: "Закрыть неделю: версия v1, v2 после переоткрытия",
        parameters: [pathId()],
        requestBody: body("CloseWeek"),
        responses: { "200": ok(ref("WeekVersion")), ...errors(400, 401, 403, 404, 409, 422) },
      },
    },
    "/api/v1/weeks/{id}/reopen": {
      post: {
        summary: "Переоткрыть неделю с причиной",
        parameters: [pathId()],
        requestBody: body("ReopenWeek"),
        responses: { "200": ok(ref("WeekVersion")), ...errors(400, 401, 403, 404, 409, 422) },
      },
    },
    "/api/v1/weeks/{id}/exports": {
      get: {
        summary: "Выгрузки недели по версиям",
        parameters: [pathId()],
        responses: { "200": ok(list("Export")), ...errors(401, 403, 404) },
      },
      post: {
        summary: "Собрать xlsx недели на сервере; заголовок X-Checksum-Sha256",
        parameters: [pathId()],
        requestBody: body("ExportRequest"),
        responses: {
          "200": {
            description: "Файл",
            headers: { "X-Checksum-Sha256": { schema: { type: "string" } } },
            content: {
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
                schema: { type: "string", format: "binary" },
              },
            },
          },
          ...errors(400, 401, 403, 404),
        },
      },
    },
    "/api/v1/audit": {
      get: {
        summary: "Журнал действий",
        parameters: [
          query("entity", { type: "string" }, "вид сущности"),
          query("entityId", { type: "string" }, "ключ сущности"),
        ],
        responses: { "200": ok(list("AuditItem")), ...errors(401, 403) },
      },
    },
    "/api/v1/max/invites": {
      post: {
        summary: "Дополнение: приглашение сотрудника в бота MAX одноразовым кодом",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { userId: { type: "string" } },
                required: ["userId"],
              },
            },
          },
        },
        responses: { "201": ok(ref("MaxInvite"), "Создано"), ...errors(400, 401, 403, 404) },
      },
    },
    "/api/max/webhook": {
      post: {
        summary: "События бота MAX; 501, пока канал не настроен",
        description:
          "В HANDOFF: /api/v1/integrations/max/webhook. Источник проверяется секретом подписки; формат событий сверить с dev.max.ru.",
        requestBody: { required: true, content: { "application/json": { schema: {} } } },
        responses: {
          "200": ok({
            type: "object",
            properties: { ok: { type: "boolean" }, status: { type: "string" } },
          }),
          ...errors(400, 401, 501),
        },
      },
    },
    "/health": {
      get: { summary: "Сервер жив", responses: { "200": { description: "Жив" } } },
    },
  };
}

const ERROR_TEXT: Record<number, string> = {
  400: "Неверные данные запроса",
  401: "Нет сессии",
  403: "Действие недоступно роли или чужие данные",
  404: "Не найдено",
  409: "Данные изменились: версия не совпала",
  422: "Отказ правила: код правила в поле code",
  501: "Не подключено: рабочая база или канал",
};

/**
 * YAML без библиотеки: строки в двойных кавычках по правилам JSON (их понимает YAML),
 * ключи без кавычек, если это безопасно. Порядок ключей — порядок объявления
 */
function toYaml(value: unknown, indent = ""): string {
  const key = (k: string) => (/^[A-Za-z_$/][\w$/{}.-]*$/.test(k) ? k : JSON.stringify(k));
  const scalar = (v: unknown) => (v === null || v === undefined ? "null" : JSON.stringify(v));
  const isBlock = (v: unknown) =>
    v !== null &&
    typeof v === "object" &&
    (Array.isArray(v) ? v.length > 0 : Object.keys(v).length > 0);
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (!isBlock(item))
          return `${indent}- ${Array.isArray(item) ? "[]" : typeof item === "object" && item ? "{}" : scalar(item)}`;
        const inner = toYaml(item, `${indent}  `);
        return `${indent}- ${inner.slice(indent.length + 2)}`;
      })
      .join("\n");
  }
  return Object.entries(value as Record<string, unknown>)
    .map(([k, v]) => {
      if (isBlock(v)) return `${indent}${key(k)}:\n${toYaml(v, `${indent}  `)}`;
      const empty = Array.isArray(v) ? "[]" : v && typeof v === "object" ? "{}" : scalar(v);
      return `${indent}${key(k)}: ${empty}`;
    })
    .join("\n");
}

export function gasOpenApi(): string {
  const document = {
    openapi: "3.1.0",
    info: {
      title: "ГАЙКА: учёт времени бригад",
      version: "0.7.0",
      description:
        "Черновик API по BACKEND HANDOFF v1.1 (раздел 4) и ADR-061, решение 14. Сгенерировано scripts/gas-openapi.ts из src/contracts/gas-api.ts. Не редактировать вручную.",
    },
    servers: [{ url: "/" }],
    paths: paths(),
    components: {
      schemas: Object.fromEntries(
        Object.entries(SCHEMAS).map(([name, schema]) => [name, schemaOf(schema)]),
      ),
      responses: Object.fromEntries(
        Object.entries(ERROR_TEXT).map(([code, description]) => [
          `E${code}`,
          { description, content: { "application/json": { schema: ref("Error") } } },
        ]),
      ),
    },
  };
  return `${toYaml(document)}\n`;
}

if (import.meta.main) {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  mkdirSync("docs/api", { recursive: true });
  writeFileSync(OPENAPI_FILE, gasOpenApi());
  console.log(OPENAPI_FILE);
}
