import type { SpeechPort } from "@/ports";

/**
 * Заготовка распознавателя Yandex SpeechKit (ADR-040, п. 2). Подключение ждёт ключа
 * и решения о контуре данных (правило 7): до тех пор метод честно говорит, что его нет.
 */
export class SpeechNotConnectedError extends Error {
  constructor(provider: string) {
    super(`Распознавание ${provider} не подключено: нужен ключ и решение о контуре данных`);
    this.name = "SpeechNotConnectedError";
  }
}

export function createYandexSpeech(model = "general"): SpeechPort {
  return {
    describe: { provider: "yandex", model, demo: false },
    transcribe() {
      return Promise.reject(new SpeechNotConnectedError("Yandex"));
    },
  };
}
