/**
 * Модель агента учёта времени (ADR-061, 13; ADR-066). Без ключа модели нет: агент отвечает
 * правило-движком по заготовленным вопросам (`domain/gas-ops/assistant`). С ключом свободный
 * вопрос уходит в модель вместе с данными недели, доступными роли (`assistant-context`).
 * Модель только отвечает текстом: записи она не принимает и не меняет.
 *
 * Две реализации: заглушка (демо без ключа) и сервер (`/api/gas/assistant`, ключ там).
 */
export interface AssistantTurn {
  question: string;
  answer: string;
}

export interface GasAssistantModel {
  /** Подключена ли модель и какая: спрашивается у сервера один раз за вкладку */
  status(): Promise<{ available: boolean; model: string | null }>;
  ask(input: {
    question: string;
    context: string;
    history: AssistantTurn[];
  }): Promise<{ text: string; model: string }>;
}
