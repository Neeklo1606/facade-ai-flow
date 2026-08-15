import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  CalendarClock,
  HardHat,
  Mail,
  PackageX,
  Truck,
} from "lucide-react";

export type AttentionKind =
  | "task_overdue"
  | "delivery_risk"
  | "report_missing"
  | "contract_deadline"
  | "material_shortage"
  | "customer_letter";

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  severity: "danger" | "warn" | "info";
  text: string;
  projectId: string;
  time: string;
  actionLabel: string;
}

export const attentionMeta: Record<AttentionKind, { icon: LucideIcon; label: string }> = {
  task_overdue: { icon: AlertTriangle, label: "Просрочка задачи" },
  delivery_risk: { icon: Truck, label: "Поставка под угрозой" },
  report_missing: { icon: HardHat, label: "Нет отчета" },
  contract_deadline: { icon: CalendarClock, label: "Договорной срок" },
  material_shortage: { icon: PackageX, label: "Дефицит материала" },
  customer_letter: { icon: Mail, label: "Письмо заказчику" },
};

export const attentionItems: AttentionItem[] = [
  {
    id: "a-1",
    kind: "task_overdue",
    severity: "danger",
    text: "T-1051 «Передать исполнительную документацию по 5-8 этажам» просрочена на 1 день",
    projectId: "obj-severnaya-korona",
    time: "2026-08-12T07:00:00+03:00",
    actionLabel: "Открыть задачу",
  },
  {
    id: "a-2",
    kind: "delivery_risk",
    severity: "danger",
    text: "Заявка З-2026-118: 2 из 3 поставщиков не ответили, до потребности 12 дней",
    projectId: "obj-meridian",
    time: "2026-08-12T08:30:00+03:00",
    actionLabel: "Дожать поставщиков",
  },
  {
    id: "a-8",
    kind: "customer_letter",
    severity: "warn",
    text: "Агент подготовил письмо заказчику ГК «Стройинвест» о переносе срока по захватке 2 — ожидает подтверждения",
    projectId: "obj-severnaya-korona",
    time: "2026-08-12T08:05:00+03:00",
    actionLabel: "Проверить и отправить",
  },
  {
    id: "a-3",
    kind: "report_missing",
    severity: "warn",
    text: "Ким А.В. не сдал отчет за 11 августа по ТЦ «Галактика»",
    projectId: "obj-galaktika",
    time: "2026-08-12T06:15:00+03:00",
    actionLabel: "Напомнить в Telegram",
  },
  {
    id: "a-4",
    kind: "contract_deadline",
    severity: "warn",
    text: "Контрольная точка «Завершение монтажа подконструкции» через 9 дней",
    projectId: "obj-meridian",
    time: "2026-08-12T05:00:00+03:00",
    actionLabel: "К контрольной точке",
  },
  {
    id: "a-5",
    kind: "material_shortage",
    severity: "warn",
    text: "Нащельник угловой: остаток 0, потребность 320 пог. м по захватке 2",
    projectId: "obj-severnaya-korona",
    time: "2026-08-11T19:40:00+03:00",
    actionLabel: "Создать заявку",
  },
  {
    id: "a-6",
    kind: "task_overdue",
    severity: "warn",
    text: "T-1070 «Организовать выезд на замеры» просрочена на 2 дня",
    projectId: "obj-galaktika",
    time: "2026-08-11T18:00:00+03:00",
    actionLabel: "Открыть задачу",
  },
  {
    id: "a-7",
    kind: "material_shortage",
    severity: "info",
    text: "Анкер клиновой 10х100: остаток на 2 дня работ по захватке 1",
    projectId: "obj-primorskiy",
    time: "2026-08-11T17:10:00+03:00",
    actionLabel: "Создать заявку",
  },
];

export interface PlanFactPoint {
  date: string;
  plan: number;
  fact: number;
}

export const planFact30d: PlanFactPoint[] = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(2026, 6, 14 + i);
  const plan = 520 + i * 34;
  const drift = i < 8 ? 0.99 : i < 18 ? 0.95 : 0.91;
  return {
    date: d.toISOString().slice(0, 10),
    plan: Math.round(plan),
    fact: Math.round(plan * drift - (i % 4) * 12),
  };
});

export const dashboardMetrics = {
  activeProjects: { value: 5, delta: 0 },
  overdueTasks: { value: 14, delta: 3 },
  missingReports: { value: 2, delta: -1 },
  awaitingSuppliers: { value: 4, delta: 1 },
  planFactDeviation: { value: -6.2, delta: -1.4 },
};
