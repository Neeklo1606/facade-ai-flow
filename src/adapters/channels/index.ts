import { leadSinkFromEnv } from "@/adapters/leads";
import { pickSpeech } from "@/adapters/speech";
import type { ConnectionStatus } from "@/contracts";
import type { ConnectionsPort, InboundChannel } from "@/ports";

/**
 * Заглушка входящего канала (ADR-039): контракт есть, канала нет. Метод не бросает:
 * вебхук, пришедший раньше подключения, просто не становится сообщением.
 */
export function createInboundStub(channel: "telegram" | "email"): InboundChannel {
  return {
    describe: { channel, connected: false },
    parse: () => Promise.resolve(null),
  };
}

/**
 * Статусы подключений по окружению сервера. Чистая функция от окружения: значения ключей
 * читаются только как «есть или нет» и в ответ не попадают никогда.
 */
export function connectionStatuses(
  env: (name: string) => string | undefined,
  options: { phoneLogin: boolean },
): ConnectionStatus[] {
  const has = (name: string) => !!env(name)?.trim();
  const live = env("AI_MODE") === "live";
  const modelReady = live && has("LLM_API_KEY") && has("LLM_MODEL");
  const speech = pickSpeech(env);
  const leads = leadSinkFromEnv(env).kind;
  return [
    {
      key: "model",
      title: "Модель разбора",
      state: modelReady ? "on" : live ? "off" : "demo",
      detail: modelReady
        ? `${env("LLM_PROVIDER") ?? "deepseek"} · ${env("LLM_MODEL")}`
        : live
          ? "Режим live включён, но ключ или модель не заданы: работают подготовленные разборы"
          : "Подготовленные разборы примеров показа",
      env: ["AI_MODE", "LLM_PROVIDER", "LLM_MODEL", "LLM_API_KEY"],
    },
    {
      key: "speech",
      title: "Распознавание речи",
      state: speech.kind === "openai" ? "on" : live ? "off" : "demo",
      detail:
        speech.kind === "openai"
          ? `${speech.provider} · ${speech.model}`
          : speech.kind === "yandex"
            ? "Yandex SpeechKit выбран, адаптер ещё не подключён"
            : live
              ? "Ключ распознавания не задан: голос записывается, текст вводится вручную"
              : "Подготовленные расшифровки примеров показа",
      env: ["STT_PROVIDER", "STT_MODEL", "STT_API_KEY"],
    },
    {
      key: "telegram",
      title: "Telegram",
      state: "off",
      detail: "Порт приёма сообщений готов, канал не подключён",
      env: ["TELEGRAM_BOT_TOKEN"],
    },
    {
      key: "phone-login",
      title: "Вход по телефону",
      state: options.phoneLogin ? "on" : "off",
      detail: options.phoneLogin
        ? "Вход по номеру и коду для сотрудников компании"
        : "В демонстрации вход — выбором роли",
      env: ["DATABASE_URL", "SESSION_SECRET"],
    },
    {
      key: "leads",
      title: "Приём заявок с сайта",
      state: leads === "none" ? "off" : "on",
      detail:
        leads === "telegram"
          ? "Заявки приходят в Telegram владельца"
          : leads === "webhook"
            ? "Заявки уходят на вебхук (таблица заявок)"
            : "Не подключён: форма честно ведёт в Telegram с готовым текстом заявки",
      env: ["LEADS_TELEGRAM_BOT_TOKEN", "LEADS_TELEGRAM_CHAT_ID", "LEADS_WEBHOOK_URL"],
    },
    {
      key: "client-link",
      title: "Личный контур заказчика",
      state: has("CLIENT_LINK_KEY") ? "on" : "off",
      detail: has("CLIENT_LINK_KEY")
        ? "Личная ссылка открывает данные заказчика, остальные видят публичный набор"
        : "Ключ личной ссылки не задан: все видят публичный набор «Демо-подрядчика»",
      env: ["CLIENT_LINK_KEY"],
    },
  ];
}

export function createConnections(
  env: (name: string) => string | undefined,
  options: { phoneLogin: boolean },
): ConnectionsPort {
  return { status: () => Promise.resolve(connectionStatuses(env, options)) };
}
