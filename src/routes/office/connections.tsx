import { createFileRoute } from "@tanstack/react-router";
import { useConnections } from "@/api/office-client";
import { StatusBadge } from "@/components/common/StatusBadge";
import { PageHeader } from "@/components/common/PageHeader";
import { ScreenSkeleton } from "@/components/common/ScreenStates";
import { connectionStateLabel } from "@/contracts";

/**
 * Подключения (ADR-039): статус из конфигурации сервера. Значения ключей не показываются
 * никогда, даже частично; кнопок, которые ничего не делают, нет — подключение включается
 * переменными окружения, и экран называет какими.
 */
export const Route = createFileRoute("/office/connections")({
  head: () => ({ meta: [{ title: "Подключения — гайка" }] }),
  component: ConnectionsPage,
});

const tone = { demo: "warn", off: "neutral", on: "ok" } as const;

function ConnectionsPage() {
  const connections = useConnections();
  // Отказ сервера: экран не рисует статусы, которых роли видеть не положено (ADR-012)
  if (connections.error?.message === "403") {
    return (
      <p className="text-body text-text-2" data-screen="no-access">
        Кабинет компании открыт руководителю и директору.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Подключения"
        description="Что сейчас включено на сервере. Ключи хранятся только в переменных окружения и здесь не показываются."
      />
      {connections.isPending ? (
        <ScreenSkeleton kind="cards" rows={4} />
      ) : connections.isError ? (
        <p className="text-body text-text-2">Статус не загрузился: {connections.error.message}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {connections.data.map((row) => (
            <li key={row.key} className="flex flex-col gap-3 rounded-[var(--r-lg)] bg-surface p-6">
              <div className="flex items-start justify-between gap-3">
                <span className="text-card-title">{row.title}</span>
                <StatusBadge tone={tone[row.state]}>{connectionStateLabel[row.state]}</StatusBadge>
              </div>
              <p className="text-body text-text-2">{row.detail}</p>
              <p className="text-caption text-text-3">
                Включается: <span className="mono">{row.env.join(", ")}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
