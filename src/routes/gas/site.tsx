import { createFileRoute } from "@tanstack/react-router";
import { SiteToday } from "@/components/gas-ops/supply/SiteToday";
import { gasTitle } from "@/lib/gas-ops/brand";
import { completePageHead } from "@/lib/page-head";

/** «Сегодня прораба» (ADR-057, 4): отдельный интерфейс телефона, цен в нём нет */
export const Route = createFileRoute("/gas/site")({
  head: () =>
    completePageHead(
      { meta: [{ title: gasTitle("Сегодня прораба") }] },
      gasTitle("Сегодня прораба"),
      "Прораб заказывает материалы голосом или текстом и принимает поставки на объекте.",
    ),
  component: SiteToday,
});
