/**
 * Модель помощника учёта времени (ADR-061, 13; раздел 4.8). Без ключа модели нет:
 * помощник отвечает правило-движком по заготовленным вопросам (`domain/gas-ops/assistant`).
 * С ключом свободный вопрос уйдёт в модель вместе с данными недели, доступными роли.
 * Модель только отвечает текстом: записи она не принимает и не меняет.
 */
export interface GasAssistantModel {
  readonly available: boolean;
  ask(input: { question: string; context: string }): Promise<{ text: string }>;
}
