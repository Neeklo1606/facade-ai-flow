/**
 * Черновик заявки с первого экрана (дизайн «Тепло», шаг 4). Короткая форма первого экрана
 * собирает имя и телефон и передаёт их в общую форму заявки страницы: отправка одна,
 * через /api/leads, со всеми полями, которые требует сервер (бригады и согласие).
 */
export type LeadDraft = { name: string; phone: string };

export const LEAD_DRAFT_EVENT = "site:lead-draft";

export function sendLeadDraft(draft: LeadDraft) {
  window.dispatchEvent(new CustomEvent<LeadDraft>(LEAD_DRAFT_EVENT, { detail: draft }));
}

export function onLeadDraft(handler: (draft: LeadDraft) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<LeadDraft>).detail);
  window.addEventListener(LEAD_DRAFT_EVENT, listener);
  return () => window.removeEventListener(LEAD_DRAFT_EVENT, listener);
}
