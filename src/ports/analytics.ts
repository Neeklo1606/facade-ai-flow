/**
 * Порт аналитики сайта (ADR-051, 01_SPEC 11.2). Внутренняя телеметрия показа (ADR-010)
 * живёт отдельно и сюда не входит.
 */
export type AnalyticsEvent =
  | "landing_view"
  | "cta_demo"
  | "cta_razbor"
  /** «Попробовать на своей неделе»: переход к форме заявки (ADR-059) */
  | "cta_lead"
  | "demo_start"
  | "demo_step"
  | "demo_finish"
  | "excel_download"
  | "lead_submit"
  | "kit_copy"
  | "kit_share"
  /** Сайт v2 (ADR-067): страница задачи, карточка задачи, шаг пути, вопрос, переход в Telegram */
  | "task_page_view"
  | "task_card_click"
  | "workflow_step_select"
  | "faq_open"
  | "telegram_click"
  /** ADR-068: карточка роли и статья */
  | "role_card_click"
  | "article_click";

export type AnalyticsParams = Record<string, string | number>;

export interface AnalyticsPort {
  readonly kind: "none" | "metrika";
  track(event: AnalyticsEvent, params?: AnalyticsParams): void;
}
