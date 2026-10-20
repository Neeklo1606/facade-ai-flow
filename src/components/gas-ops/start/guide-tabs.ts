/** Вкладки инструкции (ADR-044, F2, п. 3): роли и «Как считается». Вкладка живёт в адресе */
export type GuideTab = "foreman" | "manager" | "director" | "calc";

export const GUIDE_TABS: readonly { key: GuideTab; label: string }[] = [
  { key: "foreman", label: "Бригадир" },
  { key: "manager", label: "Менеджер" },
  { key: "director", label: "Руководитель" },
  { key: "calc", label: "Как считается" },
];

export function isGuideTab(value: unknown): value is GuideTab {
  return GUIDE_TABS.some((tab) => tab.key === value);
}
