import { createFileRoute } from "@tanstack/react-router";
import { BrigadeToday } from "@/components/gas-ops/field/BrigadeToday";
import { gasTitle } from "@/lib/gas-ops/brand";
import { completePageHead } from "@/lib/page-head";

/** «Сегодня» бригадира (ADR-056, 6): отдельный интерфейс телефона, сумм в нём нет */
export const Route = createFileRoute("/gas/brigade")({
  head: () =>
    completePageHead(
      { meta: [{ title: gasTitle("Сегодня бригадира") }] },
      gasTitle("Сегодня бригадира"),
      "Бригадир вносит время бригады за день: объект, состав, начало, окончание и перерыв.",
    ),
  component: BrigadeToday,
});
