import { z } from "zod";

/**
 * Подключения кабинета компании (ADR-039): что подключено, без значений ключей. Строка
 * статуса описывает только состояние и человеческое объяснение: ключ, токен и адрес
 * с секретом сюда не попадают по построению — полей для них в схеме нет.
 */
export const connectionState = z.enum(["demo", "off", "on"]);
export type ConnectionState = z.infer<typeof connectionState>;

export const connectionStateLabel: Record<ConnectionState, string> = {
  demo: "демо-режим",
  off: "не подключено",
  on: "подключено",
};

export const connectionStatus = z
  .object({
    key: z.enum(["model", "speech", "telegram", "phone-login", "leads", "client-link"]),
    title: z.string(),
    state: connectionState,
    /** Что сейчас работает вместо подключения или чем подключено: провайдер и модель, без ключа */
    detail: z.string(),
    /** Какие переменные окружения включают подключение: только имена, значений нет */
    env: z.array(z.string()),
  })
  .strict();

export type ConnectionStatus = z.infer<typeof connectionStatus>;

/**
 * Сообщение из внешнего канала (Telegram, почта) в общий конвейер источника (ADR-039).
 * Канал приносит сообщение, конвейер сохраняет источник с ключом идемпотентности
 * `channel + externalId` и дальше идёт тем же путём, что запись с экрана.
 */
export const inboundMessage = z
  .object({
    channel: z.enum(["telegram", "email"]),
    /** Идентификатор сообщения в канале: повтор доставки не создаёт второй источник */
    externalId: z.string().min(1).max(200),
    receivedAt: z.string().datetime({ offset: true, local: true }),
    /** Кто прислал: имя или идентификатор в канале, сопоставление с сотрудником — отдельно */
    author: z.string().min(1).max(200),
    text: z.string().max(4000),
    attachments: z
      .array(
        z.object({
          kind: z.enum(["photo", "voice", "file"]),
          mimeType: z.string().min(1),
          sizeBytes: z.number().int().nonnegative(),
        }),
      )
      .max(10),
  })
  .strict();

export type InboundMessage = z.infer<typeof inboundMessage>;
