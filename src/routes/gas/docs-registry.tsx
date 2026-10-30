import { createFileRoute } from "@tanstack/react-router";
import { RegistryScreen } from "@/components/gas-ops/docs/RegistryScreen";
import { gasTitle } from "@/lib/gas-ops/brand";
import { completePageHead } from "@/lib/page-head";

/** «Реестр ИД» (ADR-058): версии, xlsx, пакет zip */
export const Route = createFileRoute("/gas/docs-registry")({
  head: () =>
    completePageHead(
      { meta: [{ title: gasTitle("Реестр ИД") }] },
      gasTitle("Реестр ИД"),
      "Подписанные документы объекта, версии реестра, выгрузка xlsx и пакет zip.",
    ),
  component: RegistryScreen,
});
