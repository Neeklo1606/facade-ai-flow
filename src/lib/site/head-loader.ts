import type { SiteHeadData, SitePage } from "./route-heads";

/**
 * Загрузчик меты страницы сайта для маршрута (ADR-067): тексты приходят отдельным куском
 * только на страницах сайта. В `head` маршрута: `({ loaderData }) => loaderData?.head ?? {}`
 */
export async function loadSiteHead(path: SitePage): Promise<{ head: SiteHeadData }> {
  const { headFor } = await import("./route-heads");
  return { head: headFor(path) };
}
