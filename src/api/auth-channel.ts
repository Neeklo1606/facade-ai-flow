import { serverEnv } from "@/lib/runtime-env";

/**
 * Канал доставки кода и ссылки (ADR-021, п. 3). Порт с двумя реализациями: настоящая отправка
 * и заглушка. Выбор — переменной `AUTH_CHANNEL`. Заглушка не притворяется отправкой: она пишет
 * код в журнал сервера и возвращает его экрану входа, а экран говорит об этом прямо.
 */
export interface AuthChannel {
  kind: "log" | "sms" | "email";
  /** Код подтверждения на телефон. Возвращает код, если канал — заглушка */
  sendCode(phone: string, code: string): Promise<{ shown: string | null }>;
  /** Одноразовая ссылка на почту. Возвращает ссылку, если канал — заглушка */
  sendLink(email: string, url: string): Promise<{ shown: string | null }>;
}

const logChannel: AuthChannel = {
  kind: "log",
  async sendCode(phone, code) {
    console.info(`[вход] код для ${phone}: ${code}`);
    return { shown: code };
  },
  async sendLink(email, url) {
    console.info(`[вход] ссылка для ${email}: ${url}`);
    return { shown: url };
  },
};

/**
 * Настоящих отправителей ещё нет: ключа у нас нет, и выдумывать протокол чужого сервиса
 * до его выбора незачем. Место для них — здесь, и `AUTH_CHANNEL` уже умеет их называть.
 */
export function authChannel(): AuthChannel {
  const kind = serverEnv("AUTH_CHANNEL")?.trim() || "log";
  if (kind === "log") return logChannel;
  throw new Error(
    `AUTH_CHANNEL=${kind}: настоящий канал отправки ещё не подключён. Порядок — docs/RUNBOOK.md`,
  );
}

/** Показывать ли код на экране входа: только заглушка, и об этом там же написано */
export const channelIsStub = () => authChannel().kind === "log";
