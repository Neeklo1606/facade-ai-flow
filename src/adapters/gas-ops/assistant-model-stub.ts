/** Заглушка модели помощника (ADR-061, 13): ключа нет, свободный вопрос не уходит никуда */
import type { GasAssistantModel } from "@/ports/gas-assistant";

export const assistantModelStub: GasAssistantModel = {
  available: false,
  ask: async () => {
    throw new Error("Модель помощника не подключена");
  },
};
