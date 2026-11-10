import { createFileRoute, notFound } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  BotFragment,
  CalcFragment,
  DocsFragment,
  QueueFragment,
  ReportFragment,
  SupplyFragment,
  WeekTableFragment,
} from "@/components/site/landing/fragments";
import { BRAND } from "@/lib/site/copy";

/**
 * Кадр превью ссылки 1200 x 630 (ADR-051, 01_SPEC 11.3). Только для `scripts/og-images.ts`
 * в разработке: в production адрес отвечает 404 (src/lib/access.ts). Картинки собраны
 * из живых фрагментов лендинга, а не нарисованы руками.
 */
const FRAMES: Record<string, { eyebrow: string; title: string; text: string; art: ReactNode }> = {
  // ADR-059 (S7): кадр повторяет первый экран лендинга, фрагменты те же
  landing: {
    eyebrow: "Помощник подрядчика",
    title: "Табель, снабжение и документы ПТО из данных с объекта",
    text: "Бригадир отмечает время, прораб пишет, чего не хватает. Проверяет человек.",
    art: (
      <>
        <QueueFragment />
        <DocsFragment />
      </>
    ),
  },
  // ADR-067: превью трёх страниц задач, H1 страницы и один фрагмент продукта
  "task-time": {
    eyebrow: "Учёт времени бригад",
    title: "Учёт времени бригад и выработки по смете",
    text: "Бригадир вносит время с телефона. Менеджер проверяет замечания.",
    art: (
      <>
        <QueueFragment />
        <ReportFragment />
      </>
    ),
  },
  "task-supply": {
    eyebrow: "Снабжение объекта",
    title: "Снабжение объекта: от заявки до приёмки",
    text: "Прораб пишет, что нужно. Снабженец сравнивает предложения.",
    art: <SupplyFragment />,
  },
  "task-docs": {
    eyebrow: "Исполнительная документация",
    title: "Исполнительная документация из подтверждённых данных объекта",
    text: "Черновики АОСР и реестр ИД. Подписывают ваши специалисты.",
    art: <DocsFragment />,
  },
  demo: {
    eyebrow: "Демо, 3 минуты, без регистрации",
    title: "Пройдите неделю бригады с телефона",
    text: "Бот бригадира, проверка менеджером, недельный отчёт и выгрузка в Excel.",
    art: (
      <>
        <BotFragment />
        <ReportFragment />
      </>
    ),
  },
  case: {
    eyebrow: "Кейс",
    title: "Учёт выработки бригад у газового подрядчика",
    text: "Бот для бригадиров, проверка менеджером, недельный отчёт в формате заказчика.",
    art: (
      <>
        <WeekTableFragment />
        <ReportFragment />
      </>
    ),
  },
  razbor: {
    eyebrow: "Экспресс-разбор",
    title: "Ваша неделя в ГАЙКЕ на ваших данных",
    text: "Пришлите сообщения бригадиров и свой отчёт. Через 3 рабочих дня покажем результат.",
    art: (
      <>
        <QueueFragment />
        <CalcFragment />
      </>
    ),
  },
};

export const Route = createFileRoute("/og/$name")({
  ssr: true,
  beforeLoad: ({ params }) => {
    if (!import.meta.env.DEV || !FRAMES[params.name]) throw notFound();
  },
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: OgFrame,
});

function OgFrame() {
  const { name } = Route.useParams();
  const frame = FRAMES[name];
  if (!frame) return null;
  return (
    <div
      data-og-frame
      style={{ width: 1200, height: 630 }}
      className="site-dark grid grid-cols-[1fr_460px] items-center gap-14 overflow-hidden bg-void px-20 text-text"
    >
      <div className="flex flex-col">
        <p className="text-title leading-none tracking-tight">{BRAND.mark}</p>
        <p className="site-body mt-14 text-text-2">{frame.eyebrow}</p>
        <h1 className="site-h1 mt-4">{frame.title}</h1>
        <p className="site-lead mt-6 text-text-2">{frame.text}</p>
      </div>
      <div className="flex flex-col gap-4">{frame.art}</div>
    </div>
  );
}
