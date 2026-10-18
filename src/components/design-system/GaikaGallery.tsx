import { useState, type ReactNode } from "react";
import { FileText, ListChecks, TriangleAlert } from "lucide-react";
import {
  AmbientField,
  AttentionDot,
  PrimaryPill,
  ResultList,
  ScenarioTile,
  SlideToConfirm,
  SyncIndicator,
  VoiceCaptureButton,
  type AmbientState,
  type ResultItem,
  type SyncState,
  type VoiceState,
} from "@/components/gaika";
import { cn } from "@/lib/utils";

/**
 * Витрина компонентов ГАЙКИ (дизайн-система, раздел 9). Каждое состояние видно без сервера,
 * без микрофона и без данных: витрина существует, чтобы состояние можно было проверить глазами,
 * а не ловить на живом экране.
 */

function Block({
  title,
  caption,
  children,
}: {
  title: string;
  caption: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-card-title">{title}</h3>
        <p className="text-text-2 mt-1 text-[13px]">{caption}</p>
      </div>
      {children}
    </section>
  );
}

function State({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col items-start gap-2", className)}>
      {children}
      <span className="text-text-3 text-[12px]">{label}</span>
    </div>
  );
}

const voiceStates: { state: VoiceState; label: string }[] = [
  { state: "idle", label: "покой" },
  { state: "recording", label: "запись" },
  { state: "paused", label: "пауза" },
  { state: "uploading", label: "отправка" },
  { state: "processing", label: "разбор" },
  { state: "offline", label: "нет сети" },
  { state: "error", label: "ошибка" },
  { state: "denied", label: "нет доступа к микрофону" },
];

const fieldStates: { state: AmbientState; label: string }[] = [
  { state: "rest", label: "покой" },
  { state: "processing", label: "ИИ обрабатывает" },
  { state: "success", label: "подтверждено" },
  { state: "critical", label: "критично" },
];

const syncStates: SyncState[] = ["local", "queued", "sending", "saved", "conflict"];

const resultSeed: ResultItem[] = [
  { id: "r1", kind: "report", title: "Лоток кабельный, 24 пог. м, секция Б" },
  { id: "r2", kind: "task", title: "Огнезащита опоры 14 до пятницы" },
  { id: "r3", kind: "risk", title: "Нащельник, 12 шт: нужен ответ снабжения" },
];

export function GaikaGallery() {
  const [result, setResult] = useState(resultSeed);
  const [released, setReleased] = useState(false);

  return (
    <div className="space-y-10">
      <Block
        title="Голосовая кнопка"
        caption="Главный вход продукта. Касание открывает ввод, удержание сразу пишет. В покое светится одна она, при записи дышит; prefers-reduced-motion выключает дыхание."
      >
        <div className="flex flex-wrap gap-8">
          {voiceStates.map(({ state, label }) => (
            <State key={state} label={label}>
              <VoiceCaptureButton state={state} seconds={47} />
            </State>
          ))}
        </div>
      </Block>

      <Block
        title="Цветовое поле"
        caption="Верх экранов «Сегодня», «Запись» и «Ассистент». Единственный большой градиент рабочего экрана: состояние меняет цвет, а не яркость."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {fieldStates.map(({ state, label }) => (
            <State key={state} label={label} className="w-full">
              <div className="bg-bg relative h-32 w-full overflow-hidden rounded-[var(--r-lg)]">
                <AmbientField state={state} />
              </div>
            </State>
          ))}
        </div>
      </Block>

      <Block
        title="Плитки сценариев"
        caption="Три входа на «Сегодня». Оттенок типа появляется только на плитке, чипе и шапке карточки своего типа."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <ScenarioTile kind="report" hint="Что сделали за смену" icon={FileText} />
          <ScenarioTile kind="task" hint="Замечание с обхода" icon={ListChecks} />
          <ScenarioTile kind="problem" hint="Что мешает работать" icon={TriangleAlert} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <ScenarioTile kind="report" hint="Неактивно: нет объекта" icon={FileText} disabled />
        </div>
      </Block>

      <Block
        title="Главное действие и подтверждение"
        caption="Капсула с круглой кнопкой-стрелкой — одна на кадр. «Сдвиньте, чтобы подтвердить» только для необратимого: выпуска сводки и отправки наружу."
      >
        <div className="flex flex-wrap items-end gap-8">
          <State label="покой">
            <PrimaryPill label="Верно" />
          </State>
          <State label="загрузка">
            <PrimaryPill label="Сохраняю" loading />
          </State>
          <State label="неактивно">
            <PrimaryPill label="Верно" disabled />
          </State>
        </div>
        <State
          label={released ? "подтверждено" : "сдвиньте вправо или нажмите End"}
          className="w-full max-w-md"
        >
          <SlideToConfirm
            label="Сдвиньте, чтобы выпустить сводку"
            confirmedLabel="Сводка выпущена"
            onConfirm={() => setReleased(true)}
            className="w-full"
          />
        </State>
      </Block>

      <Block
        title="Янтарная отметка и состояние записи"
        caption="Точка стоит только у сомнительного поля и всегда называет причину. «Сохранено» ставится после ответа сервера, не раньше."
      >
        <div className="flex flex-wrap items-center gap-6">
          <span className="text-list inline-flex items-center gap-2">
            24 пог. м <AttentionDot reason="«метра» сопоставлено с «пог. м», проверьте" />
          </span>
          {syncStates.map((state) => (
            <SyncIndicator key={state} state={state} />
          ))}
        </div>
      </Block>

      <Block
        title="Что создано"
        caption="Одно голосовое может дать отчёт, задачу и запрос. Любой элемент исключается до подтверждения и возвращается обратно."
      >
        <ResultList
          items={result}
          onToggle={(id) =>
            setResult((items) =>
              items.map((item) =>
                item.id === id ? { ...item, excluded: item.excluded !== true } : item,
              ),
            )
          }
          className="max-w-xl"
        />
      </Block>
    </div>
  );
}
