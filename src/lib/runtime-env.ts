/**
 * Переменные окружения сервера. У Cloudflare они приходят аргументом `env` обработчика запроса,
 * у node-сервера — в переменных процесса. Обработчик запроса запоминает `env` здесь, чтобы
 * серверные функции читали секреты так же, как шлюз ключа.
 */
let runtimeEnv: Record<string, string | undefined> = {};

export function rememberEnv(env: unknown) {
  if (env && typeof env === "object") runtimeEnv = env as Record<string, string | undefined>;
}

export function serverEnv(name: string): string | undefined {
  const fromEnv = runtimeEnv[name];
  if (typeof fromEnv === "string" && fromEnv.trim()) return fromEnv.trim();
  const fromProcess = typeof process !== "undefined" ? process.env[name]?.trim() : undefined;
  return fromProcess || undefined;
}
