/**
 * Поток экрана «Запись» для интерфейса (ADR-040, п. 1). Правила переходов живут в домене
 * и проверяются тестами; экран получает их отсюда, из слоя данных (ADR-001, п. 5).
 */
export {
  EXTRACT_STAGES,
  EXTRACT_STAGE_MS,
  SIMULATED_RECORDING_MS,
  UNDO_WINDOW_MS,
  canUndo,
  captureReducer,
  capturing,
  initialFlow,
  undoSecondsLeft,
  working,
  type CaptureEvent,
  type CaptureFlow,
  type CaptureStep,
  type CreatedEntity,
  type NoMicReason,
} from "@/domain/capture-flow";
export { locateQuote, revealSchedule, visibleWords } from "@/domain/transcript";
