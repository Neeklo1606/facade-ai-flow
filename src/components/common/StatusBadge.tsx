import { cn } from "@/lib/utils";

export type Tone = "ok" | "warn" | "danger" | "info" | "neutral" | "accent";

const tones: Record<Tone, string> = {
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  danger: "bg-danger-bg text-danger",
  info: "bg-info-bg text-info",
  neutral: "bg-subtle text-text-secondary",
  accent: "bg-accent-subtle text-accent",
};

export function StatusBadge({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-caption font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export const processingStatusMeta: Record<string, { label: string; tone: Tone }> = {
  received: { label: "Получено", tone: "neutral" },
  recognizing: { label: "Распознаётся", tone: "info" },
  extracted: { label: "Извлечено", tone: "info" },
  review: { label: "На проверке", tone: "warn" },
  confirmed: { label: "Подтверждено", tone: "ok" },
  rejected: { label: "Отклонено", tone: "danger" },
};

export const siteStatusMeta: Record<string, { label: string; tone: Tone }> = {
  active: { label: "В работе", tone: "ok" },
  risk: { label: "Риск", tone: "danger" },
  paused: { label: "Приостановлен", tone: "warn" },
  done: { label: "Завершён", tone: "neutral" },
};

export const taskStatusMeta: Record<string, { label: string; tone: Tone }> = {
  open: { label: "Открыта", tone: "neutral" },
  in_progress: { label: "В работе", tone: "info" },
  review: { label: "На проверке", tone: "warn" },
  done: { label: "Выполнена", tone: "ok" },
  overdue: { label: "Просрочена", tone: "danger" },
};

export const eventTypeLabels: Record<string, string> = {
  field_report: "Отчёт с площадки",
  supplier_reply: "Ответ поставщика",
  contract: "Договор",
  checklist: "Чек-лист",
  invoice: "Счёт",
  other: "Прочее",
};

export const channelLabels: Record<string, string> = {
  telegram: "Telegram",
  email: "Почта",
  upload: "Загрузка",
  web: "Веб",
  telephony: "Телефония",
};
