import { createFileRoute } from "@tanstack/react-router";
import {
  Boxes,
  Brain,
  FileCheck2,
  HardDrive,
  Mail,
  MessageCircle,
  Mic,
  Table2,
  Users2,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/integrations")({
  head: () => ({
    meta: [
      { title: "Интеграции — ФАСАД-РП" },
      { name: "description", content: "Telegram, корпоративная почта, Яндекс.Диск и Таблицы, языковая модель, распознавание речи." },
      { property: "og:title", content: "Интеграции — ФАСАД-РП" },
      { property: "og:description", content: "Telegram, корпоративная почта, Яндекс.Диск и Таблицы, языковая модель, распознавание речи." },
    ],
  }),
  component: IntegrationsPage,
});

interface Item {
  icon: LucideIcon;
  name: string;
  summary: string;
  details: { label: string; value: string }[];
}

const connected: Item[] = [
  {
    icon: MessageCircle,
    name: "Telegram-бот",
    summary: "Приём отчётов и фото от прорабов, уведомления по задачам",
    details: [
      { label: "Бот", value: "@fasad_rp_bot" },
      { label: "Подключено пользователей", value: "6" },
      { label: "Сообщений за неделю", value: "184" },
    ],
  },
  {
    icon: Mail,
    name: "Корпоративная почта IMAP/SMTP",
    summary: "Письма поставщикам и заказчикам, разбор ответов",
    details: [
      { label: "Ящик", value: "office@fasad-rp.ru" },
      { label: "Сервер", value: "imap.fasad-rp.ru:993 / smtp:465" },
      { label: "Писем за неделю", value: "62" },
    ],
  },
  {
    icon: HardDrive,
    name: "Яндекс.Диск",
    summary: "Хранение договоров, актов и фотоотчётов",
    details: [
      { label: "Папка", value: "/ФАСАД-РП/Объекты" },
      { label: "Файлов", value: "1 248" },
      { label: "Занято", value: "34,2 ГБ" },
    ],
  },
  {
    icon: Table2,
    name: "Яндекс.Таблицы",
    summary: "Выгрузка план-факта и реестра заявок",
    details: [
      { label: "Книга", value: "План-факт 2026" },
      { label: "Листов", value: "5" },
      { label: "Обновление", value: "Ежедневно, 07:30" },
    ],
  },
  {
    icon: Brain,
    name: "Языковая модель",
    summary: "Разбор документов, отчётов и формирование писем",
    details: [
      { label: "Модель", value: "Демо-профиль «Базовый»" },
      { label: "Токенов за неделю", value: "412 000" },
      { label: "Стоимость за неделю", value: "1 940 ₽" },
    ],
  },
  {
    icon: Mic,
    name: "Распознавание речи",
    summary: "Расшифровка голосовых отчётов с шумом стройплощадки",
    details: [
      { label: "Профиль", value: "Русский, строительная лексика" },
      { label: "Минут за неделю", value: "148" },
      { label: "Средняя уверенность", value: "89%" },
    ],
  },
];

const planned: { icon: LucideIcon; name: string; summary: string }[] = [
  { icon: Boxes, name: "1С: Бухгалтерия", summary: "Сверка актов КС-2 и платежей" },
  { icon: FileCheck2, name: "ЭДО", summary: "Обмен подписанными документами с заказчиком" },
  { icon: Users2, name: "CRM", summary: "Тендеры и коммерческие предложения" },
];

function IntegrationsPage() {
  return (
    <>
      <PageHeader
        title="Интеграции"
        description="Внешние сервисы прототипа работают в демо-режиме: реальные вызовы не выполняются."
        meta={
          <>
            <StatusBadge tone="ok" dot>Подключено: {connected.length}</StatusBadge>
            <StatusBadge tone="neutral">Запланировано: {planned.length}</StatusBadge>
            <StatusBadge tone="info">Данные синтетические</StatusBadge>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {connected.map((i) => (
          <article key={i.name} className="card-surface flex flex-col p-4">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-accent-subtle text-accent">
                <i.icon className="size-4" />
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-card-title">{i.name}</h2>
                <p className="mt-0.5 text-caption text-text-secondary">{i.summary}</p>
              </div>
            </div>
            <div className="mt-3">
              <StatusBadge tone="ok" dot>Подключено (демо)</StatusBadge>
            </div>
            <dl className="mt-3 space-y-1.5 border-t border-border pt-3">
              {i.details.map((d) => (
                <div key={d.label} className="flex items-start justify-between gap-3">
                  <dt className="text-caption text-text-muted">{d.label}</dt>
                  <dd className="tnum text-right text-table">{d.value}</dd>
                </div>
              ))}
            </dl>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 w-full"
              onClick={() => toast.info("Проверка недоступна в демо", { description: `${i.name}: внешние вызовы отключены в прототипе.` })}
            >
              Проверить
            </Button>
          </article>
        ))}
      </div>

      <h2 className="mt-6 mb-3 text-card-title">Запланировано</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {planned.map((i) => (
          <article key={i.name} className="card-surface flex flex-col p-4 opacity-60">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-subtle text-text-muted">
                <i.icon className="size-4" />
              </span>
              <div className="min-w-0">
                <h3 className="truncate text-card-title">{i.name}</h3>
                <p className="mt-0.5 text-caption text-text-secondary">{i.summary}</p>
              </div>
            </div>
            <div className="mt-3">
              <StatusBadge tone="neutral">Не подключено</StatusBadge>
            </div>
            <Button variant="outline" size="sm" className="mt-3 w-full" disabled>
              Недоступно
            </Button>
          </article>
        ))}
      </div>
    </>
  );
}
