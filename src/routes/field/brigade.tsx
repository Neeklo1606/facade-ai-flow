import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Адрес из документа владельца (S4). Интерфейс бригадира живёт в контуре данных `/gas`
 * (ADR-056, расхождения): этот адрес ведёт туда же
 */
export const Route = createFileRoute("/field/brigade")({
  beforeLoad: () => {
    throw redirect({ to: "/gas/brigade", replace: true });
  },
});
