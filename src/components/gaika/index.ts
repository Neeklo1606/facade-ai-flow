/**
 * Компоненты ГАЙКИ (дизайн-система, раздел 9). Только вид и состояния: данные и действия
 * приходят от экрана, поэтому каждый компонент показывается на витрине без сервера и микрофона.
 */
export { AmbientField, type AmbientState } from "./AmbientField";
export { AttentionDot } from "./AttentionDot";
export { DraftReview } from "./DraftReview";
export { LiveWave } from "./LiveWave";
export { Marker } from "./Marker";
export { SourceSheet } from "./SourceSheet";
export { StageList } from "./StageList";
export { TranscriptReveal } from "./TranscriptReveal";
export { PrimaryPill } from "./PrimaryPill";
export { ResultList, type ResultItem, type ResultKind } from "./ResultList";
export { ScenarioTile, type ScenarioKind } from "./ScenarioTile";
export { SlideToConfirm } from "./SlideToConfirm";
export { SyncIndicator, type SyncState } from "./SyncIndicator";
export { VoiceCaptureButton, type VoiceState } from "./VoiceCaptureButton";
