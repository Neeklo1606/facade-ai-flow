/**
 * Состояния экранов контура газа (ADR-045, 4.17 и V9): загрузка скелетоном, пусто с действием,
 * ошибка с «Повторить», ничего не найдено. Данные контура живут во вкладке и приходят сразу,
 * поэтому состояния показываются принудительно переключателем сборки проверки макетов
 * (VITE_SCREEN_STATES=1, адрес ?state=...), как у экранов ГАЙКИ. В обычной сборке узел прозрачен.
 */
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ClipboardList, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyBlock, ErrorBlock, SkeletonCards, SkeletonRows } from "@/components/ui/kit/states";
import type { GasScreenKey } from "@/lib/gas-ops/screens";
import { useForcedState } from "@/lib/screen-state";

const COPY: Partial<
  Record<GasScreenKey, { what: string; empty: string; text: string; action: string; to: string }>
> = {
  moderation: {
    what: "очередь проверки",
    empty: "Очередь пуста",
    text: "Новые записи бригадиров появятся здесь",
    action: "Открыть журнал",
    to: "/gas/entries",
  },
  entries: {
    what: "журнал",
    empty: "Записей пока нет",
    text: "Внесите время по первому объекту в боте бригадира",
    action: "Открыть бота",
    to: "/gas/foreman",
  },
  reports: {
    what: "отчёт",
    empty: "В отчёте пока пусто",
    text: "Подтвердите записи в проверке, и они попадут в недельный отчёт",
    action: "Открыть проверку",
    to: "/gas/moderation",
  },
  brigades: {
    what: "бригады",
    empty: "Бригад пока нет",
    text: "Добавьте первую бригаду, чтобы бригадир мог вносить время",
    action: "Открыть настройку",
    to: "/gas/admin",
  },
  objects: {
    what: "объекты",
    empty: "Объектов пока нет",
    text: "Объекты приходят из недельного графика заказчика",
    action: "Открыть стоимость работ",
    to: "/gas/estimates",
  },
  estimates: {
    what: "стоимость работ",
    empty: "Смет пока нет",
    text: "Загрузите смету или введите стоимость работ вручную",
    action: "Открыть объекты",
    to: "/gas/objects",
  },
  employees: {
    what: "сотрудников",
    empty: "Сотрудников пока нет",
    text: "Состав бригад появится после добавления бригадиров",
    action: "Открыть бригады",
    to: "/gas/brigades",
  },
  summary: {
    what: "сводку",
    empty: "Сводка пока пуста",
    text: "Цифры появятся после первых подтверждённых записей",
    action: "Открыть проверку",
    to: "/gas/moderation",
  },
  admin: {
    what: "настройку",
    empty: "Настроек пока нет",
    text: "Роли и правила появятся после подключения",
    action: "Открыть инструкцию",
    to: "/gas/guide",
  },
  questions: {
    what: "вопросы",
    empty: "Вопросов нет",
    text: "Все вопросы к согласованию закрыты",
    action: "Открыть отчёт",
    to: "/gas/reports",
  },
};

export function ScreenStateGate({
  screen,
  children,
}: {
  screen: GasScreenKey;
  children: ReactNode;
}) {
  const forced = useForcedState();
  const copy = COPY[screen];
  if (!forced || forced === "normal" || !copy) return <>{children}</>;
  if (forced === "loading" || forced === "processing")
    return (
      <div className="flex flex-col gap-block">
        {screen === "summary" || screen === "reports" ? <SkeletonCards /> : null}
        <SkeletonRows rows={5} label={`Загружаю ${copy.what}`} />
      </div>
    );
  if (forced === "error")
    return (
      <ErrorBlock
        what={`Не удалось загрузить ${copy.what}`}
        onRetry={() => window.location.reload()}
      />
    );
  if (forced === "filtered")
    return (
      <EmptyBlock
        icon={SearchX}
        title="Ничего не найдено по «ул. Лесная»"
        text="Проверьте адрес или номер записи"
        action={
          <Button variant="outline" asChild>
            <Link to=".">Сбросить поиск</Link>
          </Button>
        }
      />
    );
  return (
    <EmptyBlock
      icon={ClipboardList}
      title={copy.empty}
      text={copy.text}
      action={
        <Button variant="outline" asChild>
          <Link to={copy.to}>{copy.action}</Link>
        </Button>
      }
    />
  );
}
