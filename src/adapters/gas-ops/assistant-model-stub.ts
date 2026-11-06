/** Заглушка модели агента (ADR-061, 13): ключа нет, свободный вопрос не уходит никуда */
import type { GasAssistantModel } from "@/ports/gas-assistant";

export const assistantModelStub: GasAssistantModel = {
  status: async () => ({ available: false, model: null }),
  ask: async () => {
    throw new Error("Модель агента не подключена");
  },
};
