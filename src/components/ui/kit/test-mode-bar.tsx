/**
 * Плашка «Тестовый режим» (ADR-062, решение владельца 3): личная ссылка заказчика и кабинет
 * без сервера держат данные во вкладке. Заказчик видит это рядом с данными, а не в сноске.
 */
import { FlaskConical } from "lucide-react";

export const TEST_MODE_TEXT = "Тестовый режим: данные хранятся в этом браузере";

export function TestModeBar() {
  return (
    <div
      role="status"
      data-testid="test-mode-bar"
      className="flex h-8 items-center gap-2 bg-info-bg px-gutter text-meta text-info"
    >
      <FlaskConical className="size-4 shrink-0" aria-hidden />
      <span className="truncate">{TEST_MODE_TEXT}</span>
    </div>
  );
}
