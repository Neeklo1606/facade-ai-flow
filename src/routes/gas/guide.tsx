import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { GuideScreen } from "@/components/gas-ops/start/GuideScreen";
import { isGuideTab, type GuideTab } from "@/components/gas-ops/start/guide-tabs";
import { gasTitle } from "@/lib/gas-ops/brand";
import { completePageHead } from "@/lib/page-head";

/** Инструкция по ролям (ADR-044, F2, п. 3). Вкладка в адресе: ссылка «Система считает» ведёт на расчёт */
export const Route = createFileRoute("/gas/guide")({
  validateSearch: (search: Record<string, unknown>): { tab?: GuideTab } =>
    isGuideTab(search["tab"]) ? { tab: search["tab"] } : {},
  head: () =>
    completePageHead(
      { meta: [{ title: gasTitle("Инструкция") }] },
      gasTitle("Инструкция"),
      "Инструкция по ролям: бригадир, менеджер, руководитель и как считается выработка.",
    ),
  component: GuidePage,
});

function GuidePage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: "/gas/guide" });
  return (
    <GuideScreen
      tab={tab ?? "foreman"}
      onTab={(next) => void navigate({ search: { tab: next }, replace: true, resetScroll: false })}
    />
  );
}
