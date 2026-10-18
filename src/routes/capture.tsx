import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Camera, Check, Mic, PackageSearch, Pause, Play, Square } from "lucide-react";
import { EmptyState, PageHeader, WidgetCard, WidgetCardHeader } from "@/components/common";
import { PageCaption } from "@/components/layout/PageActions";
import { AmbientField, AttentionDot, DraftReview, SyncIndicator } from "@/components/gaika";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useQuery } from "@tanstack/react-query";
import { queries } from "@/api/queries";
import { prepareDraft, useCapture, useCreateMaterialRequest, useDemoExamples } from "@/api/capture";
import { useCreateReport } from "@/api/mutations";
import type { CreateMaterialRequestInput, RequestPrefill } from "@/api/types";
import { useAccess } from "@/api/access";
import { useNow } from "@/api/clock";
import { useRecorder } from "@/hooks/use-recorder";
import {
  CAPTURE_LIMIT_SEC,
  clock,
  emptyDraft,
  markFailed,
  markSaved,
  markSending,
  nearLimit,
  readDraft,
  readyToSend,
  remainingSec,
  submitLabel,
  writeDraft,
  type CaptureDraft,
} from "@/lib/capture";
import { note } from "@/lib/contour-copy";
import { useProjectId } from "@/lib/project-scope";
import { cn } from "@/lib/utils";

/**
 * Экран «Запись» (раздел 7 GAIKA_PRODUCT_UX; ADR-036). Главный вход факта: голос, текст, фото.
 *
 * Текст открыт всегда — и до записи, и во время, и когда микрофон запрещён: отказ в микрофоне
 * не должен оставлять прораба без способа сообщить факт.
 *
 * Чего экран не обещает: файла записи он не хранит и расшифровки без ключа не делает.
 * Про то и другое сказано на самом экране, а не в сноске.
 */
export const Route = createFileRoute("/capture")({
  /** `?record=1` — удержание центральной кнопки: запись начинается сразу (ADR-036) */
  validateSearch: (search: Record<string, unknown>): { record?: true | undefined } =>
    search["record"] === "1" || search["record"] === true ? { record: true } : {},
  head: () => ({
    meta: [
      { title: "Запись — гайка" },
      {
        name: "description",
        content: "Скажите, что произошло на объекте: голос, текст и фото в одном месте.",
      },
      { property: "og:title", content: "Запись — гайка" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: CapturePage,
});

function CapturePage() {
  const { record } = Route.useSearch();
  const chipProject = useProjectId();
  const { can } = useAccess();
  /*
   * Объект записи: выбранный в шапке, единственный объект человека или выбранный здесь
   * кнопками — тем же правилом, что и быстрая форма (ADR-029, п. 4). У прораба чипа нет вовсе,
   * и спрашивать его об объекте, когда он один, незачем.
   */
  const projects = useQuery(queries.projects()).data ?? [];
  const [picked, setPicked] = useState<string | null>(null);
  const projectId =
    chipProject ?? picked ?? (projects.length === 1 ? (projects[0]?.project.id ?? null) : null);
  const now = useNow();
  /* Примеры показа: в рабочем контуре их нет, и решает это слой данных (ADR-001, п. 5) */
  const examples = useDemoExamples().data ?? [];
  const recorder = useRecorder();
  const capture = useCapture();
  const [draft, setDraft] = useState<CaptureDraft | null>(null);

  // Черновик переживает перезагрузку: ключ отправки тот же, поэтому повтор не создаёт дубль
  useEffect(() => {
    if (!projectId) return;
    const saved = readDraft();
    setDraft(saved && saved.projectId === projectId ? saved : emptyDraft(projectId));
  }, [projectId]);

  useEffect(() => {
    if (draft) writeDraft(draft);
  }, [draft]);

  /*
   * Удержание центральной кнопки начинает запись сразу (раздел 8 дизайн-системы). Запрос
   * доступа идёт из обработчика перехода, а не из рендера: браузер показывает его один раз.
   */
  const [autoStarted, setAutoStarted] = useState(false);
  useEffect(() => {
    if (record && !autoStarted && recorder.state === "idle") {
      setAutoStarted(true);
      void recorder.start();
    }
  }, [record, autoStarted, recorder]);

  const change = (parts: Partial<CaptureDraft>) =>
    setDraft((prev) => (prev ? { ...prev, ...parts } : prev));

  const recording = recorder.state === "recording";
  const paused = recorder.state === "paused";
  const fieldState = capture.isPending ? "processing" : capture.isSuccess ? "success" : "rest";

  const outcome = capture.data ?? null;
  const outcomeDraft = outcome?.draft ?? null;
  const createReport = useCreateReport();
  const createRequest = useCreateMaterialRequest();
  const [doneReports, setDoneReports] = useState(0);
  const [request, setRequest] = useState<RequestPrefill | null>(null);
  const [requestDone, setRequestDone] = useState(false);
  const card = useQuery({ ...queries.project(projectId ?? ""), enabled: !!projectId }).data;
  const reports = useQuery({ ...queries.reports(projectId ?? ""), enabled: !!projectId }).data;
  /*
   * Дата берётся из часов продукта, а не из браузера: в демонстрации часы свои, и отчёт
   * с датой браузера уходил в будущее — порт его законно отвергал.
   */
  const today = now.slice(0, 10);
  /* Карточки и готовые записи считает слой данных: экран их только показывает */
  const prepared = useMemo(
    () =>
      outcomeDraft && card
        ? prepareDraft(outcomeDraft, {
            projectId: projectId ?? "",
            date: today,
            summary: draft?.text ?? "",
            zones: card.zones,
            reports: (reports ?? []).map((item) => item.report),
          })
        : null,
    [outcomeDraft, card, projectId, today, draft?.text, reports],
  );

  const limitLeft = remainingSec(recorder.elapsedMs);

  const photos = draft?.photos ?? [];
  const canWrite = can("field-reports", "write");

  const addPhoto = () => {
    const at = now.slice(0, 19);
    change({
      photos: [
        ...photos,
        {
          caption: "",
          takenAt: at,
          atMs: recording || paused ? recorder.elapsedMs : null,
        },
      ],
    });
  };

  const send = () => {
    if (!draft || !readyToSend(draft)) return;
    setDraft(markSending(draft, recorder.elapsedMs || draft.durationMs));
    capture.mutate(
      {
        projectId: draft.projectId,
        captureKey: draft.captureKey,
        text: draft.text,
        kind: recorder.elapsedMs > 0 ? "voice" : "text",
        durationMs: recorder.elapsedMs > 0 ? recorder.elapsedMs : draft.durationMs,
        photos: photos.map((photo, index) => ({
          caption: photo.caption.trim() || `Фото ${index + 1}`,
          takenAt: photo.takenAt,
        })),
      },
      {
        onSuccess: () => setDraft((prev) => (prev ? markSaved(prev) : prev)),
        onError: (error) => setDraft((prev) => (prev ? markFailed(prev, error.message) : prev)),
      },
    );
  };

  const summary = useMemo(() => {
    const value = outcome?.draft;
    if (!value) return null;
    return [
      { label: "работы", count: value.workRecords.length },
      { label: "задачи", count: value.tasks.length },
      { label: "запросы", count: value.risks.length },
      { label: "уточнения", count: value.clarifications.length },
    ].filter((row) => row.count > 0);
  }, [outcome]);

  if (!projectId) {
    return (
      <>
        <PageHeader title="Запись" />
        <PageCaption>
          <span className="truncate">Выберите объект — дальше можно говорить</span>
        </PageCaption>
        <WidgetCard>
          {projects.length > 0 ? (
            <>
              <WidgetCardHeader level={2} icon={Mic} title="На каком объекте" />
              <div className="mt-2 grid gap-1">
                {projects.map((row) => (
                  <Button
                    key={row.project.id}
                    variant="secondary"
                    className="justify-start"
                    onClick={() => setPicked(row.project.id)}
                  >
                    {row.project.name}
                  </Button>
                ))}
              </div>
            </>
          ) : (
            <>
              <EmptyState
                icon={Mic}
                title="Объектов пока нет"
                description="Запись привязывается к объекту: заведите объект, и можно будет говорить."
              />
              <Button asChild variant="accent" className="mt-3">
                <Link to="/projects">К объектам</Link>
              </Button>
            </>
          )}
        </WidgetCard>
      </>
    );
  }

  return (
    <>
      <AmbientField state={fieldState} className="-mx-[var(--content-pad)] -mt-4" />
      <PageHeader title="Запись" />
      <PageCaption>
        <span className="truncate">Скажите, что произошло. Текст и фото — здесь же</span>
      </PageCaption>

      <div className="flex flex-col gap-3">
        {/* ---------- Примеры показа ---------- */}
        {examples.some((example) => example.projectId === projectId) ? (
          <WidgetCard>
            <WidgetCardHeader
              level={2}
              icon={Mic}
              title="Примеры показа"
              hint="подготовленные сообщения: разбор к ним готов заранее"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {examples
                .filter((example) => example.projectId === projectId)
                .map((example) => (
                  <Button
                    key={example.id}
                    variant="secondary"
                    disabled={capture.isPending}
                    onClick={() => {
                      setDoneReports(0);
                      setRequestDone(false);
                      setRequest(null);
                      const next = { ...(draft ?? emptyDraft(projectId)), text: example.message };
                      setDraft(next);
                      capture.mutate(
                        {
                          projectId,
                          captureKey: next.captureKey,
                          text: example.message,
                          kind: "text",
                          durationMs: null,
                          photos: [],
                        },
                        {
                          onSuccess: () => setDraft((prev) => (prev ? markSaved(prev) : prev)),
                          onError: (error) =>
                            setDraft((prev) => (prev ? markFailed(prev, error.message) : prev)),
                        },
                      );
                    }}
                  >
                    {example.label}
                  </Button>
                ))}
            </div>
            <p className="text-caption text-text-3 mt-2">
              {examples
                .filter((example) => example.projectId === projectId)
                .map((example) => `${example.label} — ${example.outcome}`)
                .join("; ")}
              .
            </p>
          </WidgetCard>
        ) : null}

        {/* ---------- Запись ---------- */}
        <WidgetCard>
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="flex items-baseline gap-2">
              <span
                className={cn(
                  "tnum text-metric",
                  recording && nearLimit(recorder.elapsedMs) && "text-risk",
                )}
              >
                {clock(recorder.elapsedMs)}
              </span>
              <span className="text-caption text-text-3">
                {recording || paused
                  ? `осталось ${Math.max(0, limitLeft)} с`
                  : `предел ${CAPTURE_LIMIT_SEC} с`}
              </span>
            </div>

            {/* Живая волна громкости: двадцать полос, высота по уровню сигнала */}
            <div aria-hidden="true" className="flex h-12 items-end gap-1">
              {Array.from({ length: 20 }).map((_, index) => (
                <span
                  key={index}
                  className={cn(
                    "w-1.5 rounded-full transition-[height] duration-150",
                    recording ? "bg-ember" : "bg-surface-2",
                  )}
                  style={{
                    height: `${Math.max(
                      6,
                      Math.round(
                        recorder.level * 44 * (0.55 + 0.45 * Math.sin((index / 20) * Math.PI)),
                      ),
                    )}px`,
                  }}
                />
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              {recorder.state === "idle" || recorder.state === "stopped" ? (
                <Button variant="accent" onClick={() => void recorder.start()} disabled={!canWrite}>
                  <Mic className="size-4" />{" "}
                  {recorder.state === "stopped" ? "Записать ещё" : "Говорить"}
                </Button>
              ) : null}
              {recording ? (
                <>
                  <Button variant="secondary" onClick={recorder.pause}>
                    <Pause className="size-4" /> Пауза
                  </Button>
                  <Button variant="accent" onClick={recorder.stop}>
                    <Square className="size-4" /> Готово
                  </Button>
                </>
              ) : null}
              {paused ? (
                <>
                  <Button variant="secondary" onClick={recorder.resume}>
                    <Play className="size-4" /> Продолжить
                  </Button>
                  <Button variant="accent" onClick={recorder.stop}>
                    <Square className="size-4" /> Готово
                  </Button>
                </>
              ) : null}
              <Button variant="secondary" onClick={addPhoto} disabled={!canWrite}>
                <Camera className="size-4" /> Фото
              </Button>
            </div>

            {/* Правда про запись: файла нет, расшифровки без ключа нет (ADR-036, п. 1 и 2) */}
            <p className="text-caption text-text-2 max-w-prose text-center">
              {note("speech")} {note("captureFiles")}
            </p>

            {recorder.state === "denied" ? (
              <p className="text-caption text-risk max-w-prose text-center">
                Доступ к микрофону запрещён. Это не мешает записать факт текстом ниже, а доступ
                возвращается в настройках браузера для этого адреса.
              </p>
            ) : null}
            {recorder.state === "unsupported" ? (
              <p className="text-caption text-risk max-w-prose text-center">
                Этот браузер не умеет записывать звук. Факт можно записать текстом ниже.
              </p>
            ) : null}
            {recorder.state === "error" ? (
              <p className="text-caption text-risk max-w-prose text-center">
                Микрофон не включился. Попробуйте ещё раз или запишите факт текстом.
              </p>
            ) : null}
          </div>
        </WidgetCard>

        {/* ---------- Фото ---------- */}
        {photos.length > 0 ? (
          <WidgetCard>
            <WidgetCardHeader
              level={2}
              icon={Camera}
              title="Фото"
              hint="сохраняются метки времени, сами снимки остаются на телефоне"
            />
            <ul className="divide-line mt-2 divide-y">
              {photos.map((photo, index) => (
                <li key={`${photo.takenAt}-${index}`} className="flex items-center gap-3 py-3">
                  <span className="text-caption text-text-3 tnum shrink-0">
                    {photo.atMs === null ? photo.takenAt.slice(11, 16) : clock(photo.atMs)}
                  </span>
                  <input
                    value={photo.caption}
                    onChange={(event) =>
                      change({
                        photos: photos.map((item, position) =>
                          position === index ? { ...item, caption: event.target.value } : item,
                        ),
                      })
                    }
                    placeholder={`Фото ${index + 1}: что на нём`}
                    aria-label={`Подпись фото ${index + 1}`}
                    className="focus-ring bg-surface-2 text-list min-h-12 w-full rounded-[var(--r-sm)] px-3"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      change({ photos: photos.filter((_item, position) => position !== index) })
                    }
                  >
                    Убрать
                  </Button>
                </li>
              ))}
            </ul>
          </WidgetCard>
        ) : null}

        {/* ---------- Текст ---------- */}
        <WidgetCard>
          <WidgetCardHeader
            level={2}
            icon={Check}
            title="Что произошло"
            hint="текст доступен всегда: и вместо записи, и вместе с ней"
          />
          <Textarea
            value={draft?.text ?? ""}
            onChange={(event) => change({ text: event.target.value })}
            placeholder="Например: секция Б, смонтировали двадцать четыре метра лотка, работали втроём по восемь часов"
            rows={4}
            aria-label="Что произошло на объекте"
            className="mt-2"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <SyncIndicator
              state={
                draft?.status === "saved"
                  ? "saved"
                  : draft?.status === "sending"
                    ? "sending"
                    : draft?.status === "failed"
                      ? "conflict"
                      : "local"
              }
            />
            <div className="flex items-center gap-2">
              {draft?.status === "failed" ? (
                <Button variant="secondary" onClick={send}>
                  Повторить
                </Button>
              ) : null}
              <Button
                variant="accent"
                onClick={send}
                disabled={!draft || !readyToSend(draft) || !canWrite}
              >
                {draft?.status === "saved" ? "Отправлено" : "Готово"}
              </Button>
            </div>
          </div>
          {draft?.status === "failed" && draft.error ? (
            <p className="text-caption text-risk mt-2">
              {draft.error}. Повтор отправит ту же запись: дубля не будет.
            </p>
          ) : null}
          <p className="text-caption text-text-3 mt-2">
            Статус «{submitLabel[draft?.status ?? "draft"]}» ставится по ответу сервера, а не по
            нажатию кнопки.
          </p>
        </WidgetCard>

        {/* ---------- Черновик разбора ---------- */}
        {prepared ? (
          <DraftReview
            cards={prepared.cards}
            ready={prepared.reports}
            prefill={prepared.prefill}
            demo={outcome?.by?.demo ?? true}
            pending={createReport.isPending || createRequest.isPending}
            done={{ reports: doneReports, request: requestDone }}
            onConfirm={(rows) => {
              // Каждая запись черновика заводится отдельным отчётом: объём, люди и часы
              // проходят проверку по одному, а не пачкой
              void Promise.all(rows.map((row) => createReport.mutateAsync(row))).then(() =>
                setDoneReports(rows.length),
              );
            }}
            onRequest={(prefill) => setRequest(prefill)}
          />
        ) : null}

        {/* ---------- Заявка снабжению ---------- */}
        {request && projectId ? (
          <RequestForm
            prefill={request}
            projectId={projectId}
            sourceId={outcome?.sourceId ?? null}
            today={today}
            pending={createRequest.isPending}
            onCancel={() => setRequest(null)}
            onSend={(input) => {
              void createRequest.mutateAsync(input).then(() => {
                setRequestDone(true);
                setRequest(null);
              });
            }}
          />
        ) : null}

        {/* ---------- Что услышала система ---------- */}
        {outcome ? (
          <WidgetCard>
            <WidgetCardHeader
              level={2}
              icon={Check}
              title={outcome.repeated ? "Эта запись уже была сохранена" : "Запись сохранена"}
              hint={
                outcome.by
                  ? `разбор: ${outcome.by.demo ? "подготовлен заранее" : `${outcome.by.provider}/${outcome.by.model}`}`
                  : "разбор не запрашивался"
              }
            />
            {summary ? (
              <>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {summary.map((row) => (
                    <li
                      key={row.label}
                      className="bg-surface-2 text-badge rounded-[var(--r-xs)] px-2 py-1"
                    >
                      {row.label}: <span className="tnum font-medium">{row.count}</span>
                    </li>
                  ))}
                </ul>
                {outcome.draft?.clarifications.length ? (
                  <ul className="text-caption text-text-2 mt-3 space-y-1">
                    {outcome.draft.clarifications.map((question) => (
                      <li key={question} className="flex items-start gap-2">
                        <AttentionDot reason="Система просит уточнить" className="mt-1.5" />
                        {question}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="text-caption text-text-3 mt-3">
                  Это черновик разбора. В сводку объекта он не попадает: объём, люди и часы
                  заводятся отчётом и проходят проверку.
                </p>
                <Button asChild variant="secondary" className="mt-3">
                  <Link
                    to="/projects/$id/field-reports"
                    params={{ id: projectId }}
                    search={{ new: "report" }}
                  >
                    Завести отчёт
                  </Link>
                </Button>
              </>
            ) : (
              <p className="text-caption text-text-2 mt-2">
                {outcome.refusal ?? "Текста для разбора не было: сохранены запись и метки фото."}
              </p>
            )}
          </WidgetCard>
        ) : null}
      </div>
    </>
  );
}

/**
 * Заявка на материал из черновика (ADR-037, сценарий 3). Название, количество, единица и дата
 * подставлены из той фразы, где они сказаны; чего в тексте не было, человек вписывает сам —
 * выдумывать за него нельзя.
 */
function RequestForm({
  prefill,
  projectId,
  sourceId,
  today,
  pending,
  onCancel,
  onSend,
}: {
  prefill: RequestPrefill;
  projectId: string;
  sourceId: string | null;
  /** Рабочая дата продукта: от неё считается «завтра» для срока заявки */
  today: string;
  pending: boolean;
  onCancel: () => void;
  onSend: (input: CreateMaterialRequestInput) => void;
}) {
  const tomorrow = new Date(`${today}T12:00:00Z`).getTime() + 86_400_000;
  const nextDay = new Date(tomorrow).toISOString().slice(0, 10);
  const [name, setName] = useState(prefill.name);
  const [qty, setQty] = useState(prefill.qty === null ? "" : String(prefill.qty));
  const [unit, setUnit] = useState(prefill.unit ?? "шт");
  const [neededBy, setNeededBy] = useState(prefill.neededBy ?? nextDay);
  const value = Number(qty.replace(",", "."));
  const ready = name.trim().length > 1 && Number.isFinite(value) && value > 0 && !!neededBy;

  return (
    <WidgetCard>
      <WidgetCardHeader
        level={2}
        icon={PackageSearch}
        title="Заявка снабжению"
        hint="ничего не заказывается автоматически: снабжение решает руками"
      />
      <div className="mt-2 grid gap-3">
        <label className="grid gap-1">
          <span className="text-overline text-text-3">Что нужно</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label="Название материала"
            className="focus-ring bg-surface-2 text-list min-h-12 rounded-[var(--r-sm)] px-3"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1">
            <span className="text-overline text-text-3">Сколько</span>
            <input
              value={qty}
              inputMode="decimal"
              onChange={(event) => setQty(event.target.value)}
              aria-label="Количество"
              className="focus-ring bg-surface-2 text-list tnum min-h-12 rounded-[var(--r-sm)] px-3"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-overline text-text-3">Единица</span>
            <input
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
              aria-label="Единица измерения"
              className="focus-ring bg-surface-2 text-list min-h-12 rounded-[var(--r-sm)] px-3"
            />
          </label>
        </div>
        <label className="grid gap-1">
          <span className="text-overline text-text-3">Нужен к дате</span>
          <input
            type="date"
            value={neededBy}
            onChange={(event) => setNeededBy(event.target.value)}
            aria-label="Нужен к дате"
            className="focus-ring bg-surface-2 text-list min-h-12 rounded-[var(--r-sm)] px-3"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="accent"
            disabled={!ready || pending}
            onClick={() =>
              onSend({
                projectId,
                sourceId,
                name: name.trim(),
                qty: value,
                unit: unit.trim() || "шт",
                neededBy,
                note: prefill.note,
              })
            }
          >
            Отправить снабжению
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Не сейчас
          </Button>
        </div>
      </div>
    </WidgetCard>
  );
}
