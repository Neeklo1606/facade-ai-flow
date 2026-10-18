import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { currentStep, nextStep, setChain, useGuide } from "@/lib/guide/store";
import { useQuery } from "@tanstack/react-query";
import {
  Camera,
  Check,
  ChevronRight,
  FileText,
  Mic,
  PackageSearch,
  Pause,
  Play,
  RotateCcw,
  Square,
  Undo2,
} from "lucide-react";
import { EmptyState, PageHeader, WidgetCard, WidgetCardHeader } from "@/components/common";
import { BottomSheet } from "@/components/common/BottomSheet";
import { MobileActionBar } from "@/components/common/MobileActionBar";
import {
  AmbientField,
  DraftReview,
  LiveWave,
  Marker,
  SourceSheet,
  StageList,
  TranscriptReveal,
} from "@/components/gaika";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { queries } from "@/api/queries";
import {
  prepareDraft,
  useConfirmDraft,
  useDemoExamples,
  useExtract,
  useRetractCreated,
  useSaveCapture,
  useTranscribe,
} from "@/api/capture";
import {
  EXTRACT_STAGES,
  EXTRACT_STAGE_MS,
  SIMULATED_RECORDING_MS,
  captureReducer,
  capturing,
  initialFlow,
  locateQuote,
  revealSchedule,
  undoSecondsLeft,
  working,
  type CaptureEvent,
  type CaptureFlow,
} from "@/api/capture-flow";
import type { DraftField, RequestPrefill } from "@/api/types";
import { useAccess } from "@/api/access";
import { useNow } from "@/api/clock";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useRecorder } from "@/hooks/use-recorder";
import { CAPTURE_LIMIT_SEC, clock, nearLimit, newCaptureKey, remainingSec } from "@/lib/capture";
import { fmtDate } from "@/lib/format";
import { useCurrentRole, useProjectId } from "@/lib/project-scope";
import { useEnterAs } from "@/lib/persona";
import { CANON_PERSONA } from "@/lib/guide/scenarios";
import { cn } from "@/lib/utils";

/**
 * Экран «Запись» (ADR-036, ADR-040). Одна линия состояний: покой → запись → отправка →
 * расшифровка → разбор → проверка человеком → готово. Правила переходов живут в домене
 * и проверены тестами; здесь — микрофон, сеть и вид.
 *
 * Текст доступен всегда, отказ в микрофоне его не блокирует. Подготовленная расшифровка
 * и разбор помечены одной строкой рядом с результатом (правило 4).
 */
export const Route = createFileRoute("/capture")({
  /**
   * `?record=1` — удержание центральной кнопки: запись начинается сразу (ADR-036);
   * `?scenario=` — сценарий показа, который выбрала полоса шагов (D3)
   */
  validateSearch: (
    search: Record<string, unknown>,
  ): { record?: true | undefined; scenario?: string | undefined } => ({
    ...(search["record"] === "1" || search["record"] === true ? { record: true as const } : {}),
    ...(typeof search["scenario"] === "string" ? { scenario: search["scenario"] } : {}),
  }),
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

/** Удержание дольше этого — «говорю, пока держу»: отпускание завершает запись */
const HOLD_MS = 450;

interface Machine {
  flow: CaptureFlow;
  /** Номер перехода: эффекты этапов срабатывают один раз на вход в этап */
  seq: number;
}

function machine(state: Machine, event: CaptureEvent): Machine {
  const next = captureReducer(state.flow, event);
  return next === state.flow ? state : { flow: next, seq: state.seq + 1 };
}

interface Heard {
  text: string;
  segments: { text: string; startMs: number; endMs: number }[];
  demo: boolean;
}

function CapturePage() {
  const { record, scenario: scenarioParam } = Route.useSearch();
  const chipProject = useProjectId();
  const { can } = useAccess();
  const projects = useQuery(queries.projects()).data ?? [];
  const [picked, setPicked] = useState<string | null>(null);
  const projectId =
    chipProject ?? picked ?? (projects.length === 1 ? (projects[0]?.project.id ?? null) : null);
  const now = useNow();
  const today = now.slice(0, 10);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)", false);

  /* Примеры показа: в рабочем контуре их нет, и решает это слой данных (ADR-001, п. 5) */
  const examples = (useDemoExamples().data ?? []).filter(
    (example) => !projectId || example.projectId === projectId,
  );
  const [{ flow, seq }, send] = useReducer(machine, {
    flow: initialFlow(scenarioParam ?? null),
    seq: 0,
  });
  const scenario = examples.find((example) => example.id === flow.scenario) ?? examples[0] ?? null;

  const recorder = useRecorder();
  const guide = useGuide();
  const navigate = useNavigate();
  const enterAs = useEnterAs();
  const currentRole = useCurrentRole();
  // Идёт показ, и шаг «Верно» засчитан: экран «Готово» ведёт дальше по сценарию (D1, п. 7)
  const showGoing =
    !!guide.scenarioId?.startsWith("canon-") && !guide.closed && !!currentStep(guide);
  const save = useSaveCapture();
  const transcribe = useTranscribe();
  const extract = useExtract();
  const confirm = useConfirmDraft();
  const retract = useRetractCreated();

  const [captureKey, setCaptureKey] = useState(newCaptureKey);
  const [text, setText] = useState("");
  const [textOpen, setTextOpen] = useState(false);
  const [photos, setPhotos] = useState<{ takenAt: string; atMs: number | null }[]>([]);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [heard, setHeard] = useState<Heard | null>(null);
  const [instant, setInstant] = useState(false);
  const [stage, setStage] = useState(0);
  const [outcome, setOutcome] = useState<Awaited<ReturnType<typeof extract.mutateAsync>> | null>(
    null,
  );
  const [source, setSource] = useState<DraftField | null>(null);
  const [requestDraft, setRequestDraft] = useState<RequestPrefill | null>(null);
  const [editRequest, setEditRequest] = useState(false);
  const [tick, setTick] = useState(() => Date.now());

  const card = useQuery({ ...queries.project(projectId ?? ""), enabled: !!projectId }).data;
  const reports = useQuery({ ...queries.reports(projectId ?? ""), enabled: !!projectId }).data;
  const canWrite = can("field-reports", "write");

  /* ---------- Имитация записи без микрофона (только в показе) ---------- */
  const [simMs, setSimMs] = useState(0);
  const simulated = flow.input === "simulated";
  useEffect(() => {
    if (!(flow.step === "recording" && simulated)) return;
    const started = Date.now();
    setSimMs(0);
    const timer = setInterval(() => {
      const elapsed = Date.now() - started;
      setSimMs(elapsed);
      if (elapsed >= SIMULATED_RECORDING_MS) send({ type: "finish" });
    }, 100);
    return () => clearInterval(timer);
  }, [flow.step, simulated]);

  const elapsedMs = simulated ? simMs : recorder.elapsedMs;
  const level = simulated
    ? 0.35 + 0.3 * Math.abs(Math.sin(simMs / 180)) * Math.abs(Math.cos(simMs / 410))
    : recorder.level;

  /* ---------- Микрофон ---------- */
  useEffect(() => {
    if (flow.step !== "recording" || flow.input !== "voice") return;
    if (recorder.state === "idle") void recorder.start();
    // Запись дошла до предела и остановилась сама: это то же «Готово»
    else if (recorder.state === "stopped") send({ type: "finish" });
  }, [flow.step, flow.input, recorder]);

  useEffect(() => {
    if (flow.step !== "recording" || flow.input !== "voice") return;
    if (recorder.state === "denied") send({ type: "mic-unavailable", reason: "denied" });
    if (recorder.state === "unsupported") send({ type: "mic-unavailable", reason: "unsupported" });
    if (recorder.state === "error") send({ type: "mic-unavailable", reason: "failed" });
  }, [flow.step, flow.input, recorder.state]);

  /* Удержание центральной кнопки панели начинает запись сразу (ADR-036) */
  const autoStarted = useRef(false);
  useEffect(() => {
    if (record && !autoStarted.current && projectId) {
      autoStarted.current = true;
      send({ type: "start" });
    }
  }, [record, projectId]);

  /* ---------- Этапы обработки: каждый срабатывает один раз на вход ---------- */
  const handled = useRef(-1);
  const sourceText = flow.input === "text" ? text : (heard?.text ?? "");

  const runExtract = useCallback(
    async (message: string, savedId: string | null) => {
      if (!projectId) return;
      setStage(0);
      const started = Date.now();
      // Этапы идут по очереди, даже если ответ пришёл раньше: глаз успевает прочитать
      const stages = setInterval(() => {
        setStage((value) => Math.min(EXTRACT_STAGES.length - 1, value + 1));
      }, EXTRACT_STAGE_MS);
      try {
        const answer = await extract.mutateAsync({ projectId, message, sourceId: savedId });
        const left = EXTRACT_STAGES.length * EXTRACT_STAGE_MS - (Date.now() - started);
        if (left > 0 && !reduced) await new Promise((resolve) => setTimeout(resolve, left));
        clearInterval(stages);
        setStage(EXTRACT_STAGES.length);
        setOutcome(answer);
        if (answer.ok) send({ type: "extracted" });
        else send({ type: "failed", message: answer.reason, refused: true });
      } catch (error) {
        clearInterval(stages);
        send({ type: "failed", message: (error as Error).message });
      }
    },
    [projectId, extract, reduced],
  );

  useEffect(() => {
    if (handled.current === seq || !projectId) return;
    handled.current = seq;

    if (flow.step === "uploading" && flow.input === "text") {
      save
        .mutateAsync({
          projectId,
          captureKey,
          text: text.trim(),
          kind: "text",
          durationMs: null,
          photos: photoMarks(photos),
        })
        .then((saved) => {
          setSourceId(saved.source.id);
          send({ type: "uploaded" });
        })
        .catch((error: Error) => send({ type: "failed", message: error.message }));
    }

    // Имитация записи: файла нет, распознаватель показа отдаёт расшифровку сценария
    if (flow.step === "uploading" && flow.input === "simulated") sendAudio(null);
    if (flow.step === "uploading" && flow.input === "voice") voiceSent.current = false;

    if (flow.step === "extracting") void runExtract(sourceText.trim(), sourceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- этап запускается входом, а не данными
  }, [seq]);

  /*
   * Голос: запись останавливается, и только когда файл собран, уходит распознавателю.
   * Источник сохраняется уже с текстом расшифровки (ADR-040, п. 1).
   */
  const voiceSent = useRef(false);
  useEffect(() => {
    if (flow.step !== "uploading" || flow.input !== "voice") return;
    if (recorder.state === "recording" || recorder.state === "paused") recorder.stop();
    else if (recorder.state === "stopped" && !voiceSent.current) {
      voiceSent.current = true;
      sendAudio(recorder.blob);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ждём состояния микрофона
  }, [flow.step, flow.input, recorder.state]);

  function sendAudio(audio: Blob | null) {
    if (!projectId) return;
    setInstant(reduced);
    heardSaved.current = false;
    transcribe
      .mutateAsync({
        audio,
        durationMs: Math.round(elapsedMs),
        projectId,
        sourceId: null,
        scenario: scenario?.id ?? null,
      })
      .then((answer) => {
        if (!answer.ok || !answer.transcript) {
          send({ type: "failed", message: answer.reason ?? "Речь не распознана" });
          return;
        }
        setHeard({
          text: answer.transcript.text,
          segments: answer.transcript.segments,
          demo: answer.by.demo,
        });
        send({ type: "uploaded" });
      })
      .catch((error: Error) => send({ type: "failed", message: error.message }));
  }

  /* Расшифровка показана — сохраняем источник с её текстом и идём в разбор */
  const heardSaved = useRef(false);
  const onHeard = useCallback(() => {
    if (!projectId || !heard || flow.step !== "transcribing" || heardSaved.current) return;
    heardSaved.current = true;
    save
      .mutateAsync({
        projectId,
        captureKey,
        text: heard.text,
        kind: "voice",
        durationMs: Math.round(elapsedMs),
        photos: photoMarks(photos),
      })
      .then((saved) => {
        setSourceId(saved.source.id);
        send({ type: "transcribed" });
      })
      .catch((error: Error) => {
        heardSaved.current = false;
        send({ type: "failed", message: error.message });
      });
  }, [projectId, heard, flow.step, save, captureKey, elapsedMs, photos]);

  const schedule = useMemo(() => (heard ? revealSchedule(heard.segments, 2_000) : []), [heard]);
  const words = useMemo(() => heard?.segments.map((segment) => segment.text) ?? [], [heard]);

  /* ---------- Черновик для проверки ---------- */
  const draft = outcome?.ok ? outcome.draft : null;
  const prepared = useMemo(
    () =>
      draft && card && projectId
        ? prepareDraft(draft, {
            projectId,
            date: today,
            summary: sourceText,
            zones: card.zones,
            reports: (reports ?? []).map((item) => item.report),
          })
        : null,
    [draft, card, projectId, today, sourceText, reports],
  );

  // Заготовка заявки ставится один раз на разбор: обновление списка отчётов правку не стирает
  const prefillFor = useRef<unknown>(null);
  useEffect(() => {
    if (!prepared || prefillFor.current === draft) return;
    prefillFor.current = draft;
    setRequestDraft(prepared.prefill);
  }, [prepared, draft]);

  const nextDay = useMemo(() => {
    const at = new Date(`${today}T12:00:00Z`).getTime() + 86_400_000;
    return new Date(at).toISOString().slice(0, 10);
  }, [today]);
  const requestReady =
    !!requestDraft &&
    requestDraft.name.trim().length > 1 &&
    requestDraft.qty !== null &&
    requestDraft.qty > 0;
  const requestMissing = requestDraft
    ? requestDraft.qty === null
      ? "Не сказано, сколько нужно: укажите количество"
      : null
    : null;
  const nothingToCreate = !!prepared && prepared.reports.length === 0 && !requestDraft;

  const onConfirm = () => {
    if (!prepared || !projectId || flow.step !== "review") return;
    if (requestDraft && !requestReady) {
      setEditRequest(true);
      return;
    }
    send({ type: "confirm" });
    confirm
      .mutateAsync({
        sourceId,
        reports: prepared.reports,
        request:
          requestDraft && requestReady
            ? {
                projectId,
                sourceId,
                name: requestDraft.name.trim(),
                qty: requestDraft.qty!,
                unit: requestDraft.unit ?? "шт",
                neededBy:
                  requestDraft.neededBy && requestDraft.neededBy >= today
                    ? requestDraft.neededBy
                    : nextDay,
                note: requestDraft.note,
              }
            : null,
      })
      .then((entities) => {
        // Цепочка показа: отчёт пойдёт в «Проверку» ПТО, заявка — снабжению (ADR-038)
        const report = entities.find((entity) => entity.kind === "report");
        const request = entities.find((entity) => entity.kind === "request");
        setChain({
          ...(report ? { reportId: report.id } : {}),
          ...(request ? { requestId: request.id } : {}),
        });
        send({ type: "created", entities, at: Date.now() });
      })
      .catch((error: Error) => send({ type: "failed", message: error.message }));
  };

  /* Окно отмены: секунды на кнопке идут, пока экран «Готово» открыт */
  useEffect(() => {
    if (flow.step !== "done") return;
    const timer = setInterval(() => setTick(Date.now()), 250);
    return () => clearInterval(timer);
  }, [flow.step]);
  const undoLeft = undoSecondsLeft(flow, tick);

  const onUndo = () => {
    const entities = flow.created;
    const at = Date.now();
    if (undoSecondsLeft(flow, at) === 0) return;
    send({ type: "undo", at });
    void retract
      .mutateAsync(entities)
      .catch((error: Error) =>
        send({ type: "failed", message: `Отменить не удалось: ${error.message}` }),
      );
  };

  /* Новая запись: новый ключ отправки, прежние данные экрана уходят */
  const startOver = () => {
    send({ type: "reset" });
    setCaptureKey(newCaptureKey());
    setText("");
    setTextOpen(false);
    setPhotos([]);
    setSourceId(null);
    setHeard(null);
    setOutcome(null);
    setRequestDraft(null);
    setInstant(false);
    recorder.reset();
  };

  const clarify = () => {
    recorder.reset();
    setCaptureKey(newCaptureKey());
    setHeard(null);
    setOutcome(null);
    setSourceId(null);
    send({ type: "clarify" });
  };

  const runExample = (id: string, message: string) => {
    setText(message);
    setCaptureKey(newCaptureKey());
    send({ type: "pick", scenario: id });
    send({ type: "submit-text" });
  };

  /*
   * Удержание голосовой капсулы. Капсула уходит с экрана, как только запись началась, поэтому
   * отпускание ловится на окне: держал дольше HOLD_MS — отпустил, и запись закончилась.
   * Короткое касание просто начинает запись.
   */
  const onCapsuleDown = () => {
    if (!canWrite || !(flow.step === "idle" || flow.step === "error")) return;
    const pressedAt = Date.now();
    send({ type: "start" });
    const release = () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      if (Date.now() - pressedAt >= HOLD_MS) send({ type: "finish" });
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
  };

  const addPhoto = () =>
    setPhotos((prev) => [
      ...prev,
      { takenAt: now.slice(0, 19), atMs: capturing(flow.step) ? Math.round(elapsedMs) : null },
    ]);

  /* ---------- Без объекта ---------- */
  if (!projectId) {
    return (
      <>
        <PageHeader title="Запись" />
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

  const fieldState =
    flow.step === "done"
      ? "success"
      : working(flow.step)
        ? "processing"
        : flow.step === "error" && !flow.error?.refused
          ? "critical"
          : "rest";
  const limitLeft = remainingSec(elapsedMs);

  return (
    <>
      <AmbientField state={fieldState} className="-mx-[var(--content-pad)] -mt-4" />
      {capturing(flow.step) ? (
        <div aria-hidden="true" className="dot-grid pointer-events-none fixed inset-0 -z-0" />
      ) : null}
      {/* Экран «Готово» — свой заголовок: «Запись» над ним читалась бы вторым заголовком */}
      <PageHeader title={flow.step === "done" ? "Готово" : "Запись"} />

      <div className="relative flex flex-col gap-6" data-capture-step={flow.step}>
        {/* ---------- Покой ---------- */}
        {flow.step === "idle" ? (
          <section className="flex flex-col gap-6">
            {examples.length > 0 ? (
              <div className="flex flex-col gap-3">
                <Marker>Скажите, например</Marker>
                <p className="text-lead text-text">«{scenario?.message}»</p>
                {examples.length > 1 ? (
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Сценарий показа">
                    {examples.map((example) => (
                      <button
                        key={example.id}
                        type="button"
                        aria-pressed={example.id === scenario?.id}
                        onClick={() => send({ type: "pick", scenario: example.id })}
                        className={cn(
                          "focus-ring press text-list min-h-12 rounded-full px-4",
                          example.id === scenario?.id
                            ? "bg-surface-3 text-text"
                            : "bg-surface text-text-2",
                        )}
                      >
                        {example.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Marker>Скажите</Marker>
                <p className="text-lead text-text">Что сделали, где, сколько и сколько людей.</p>
              </div>
            )}
          </section>
        ) : null}

        {/* ---------- Запись ---------- */}
        {capturing(flow.step) ? (
          <section className="flex flex-col items-center gap-4 pt-4">
            <span
              className={cn("tnum text-metric", nearLimit(elapsedMs) && !simulated && "text-risk")}
            >
              {clock(elapsedMs)}
            </span>
            <span className="text-caption text-text-3">
              {simulated
                ? "Демо: имитация записи"
                : flow.step === "paused"
                  ? "Пауза"
                  : `осталось ${Math.max(0, limitLeft)} с из ${CAPTURE_LIMIT_SEC}`}
            </span>
            <LiveWave
              level={flow.step === "paused" ? 0 : level}
              active={flow.step === "recording"}
            />
            {photos.length > 0 ? (
              <span className="text-caption text-text-2">
                Фото: <span className="tnum">{photos.length}</span>
              </span>
            ) : null}
            <div className="flex flex-wrap items-center justify-center gap-2">
              {flow.input === "voice" ? (
                flow.step === "paused" ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      recorder.resume();
                      send({ type: "resume" });
                    }}
                  >
                    <Play className="size-4" /> Продолжить
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      recorder.pause();
                      send({ type: "pause" });
                    }}
                  >
                    <Pause className="size-4" /> Пауза
                  </Button>
                )
              ) : null}
              <Button variant="secondary" onClick={addPhoto}>
                <Camera className="size-4" /> Фото
              </Button>
              <Button variant="accent" onClick={() => send({ type: "finish" })}>
                <Square className="size-4" /> Готово
              </Button>
            </div>
          </section>
        ) : null}

        {/* ---------- Нет микрофона ---------- */}
        {flow.step === "no-mic" ? (
          <section className="flex flex-col gap-4">
            <p className="text-body text-text-2">
              {flow.noMic === "denied"
                ? "Доступ к микрофону запрещён. Его возвращают в настройках браузера."
                : flow.noMic === "unsupported"
                  ? "Этот браузер не записывает звук."
                  : "Микрофон не включился."}
            </p>
            {examples.length > 0 ? (
              <div className="flex flex-col items-start gap-2">
                <Button variant="accent" onClick={() => send({ type: "simulate" })}>
                  <Play className="size-4" /> Показать без микрофона
                </Button>
                <span className="text-caption text-text-3">Демо: имитация записи</span>
              </div>
            ) : null}
          </section>
        ) : null}

        {/* ---------- Отправка, расшифровка, разбор ---------- */}
        {flow.step === "uploading" ? (
          <section className="flex flex-col gap-3 pt-4" aria-live="polite">
            <Marker>{flow.input === "text" ? "Сохраняем" : "Отправляем запись"}</Marker>
            <p className="text-lead text-text-2">
              {flow.input === "text" ? "Сохраняем текст" : "Запись ушла на расшифровку"}
            </p>
          </section>
        ) : null}

        {flow.step === "transcribing" && heard ? (
          <section className="flex flex-col gap-3 pt-2">
            <div className="flex items-center justify-between gap-3">
              <Marker>Расшифровка</Marker>
              {!instant ? (
                <Button variant="ghost" size="sm" onClick={() => setInstant(true)}>
                  Показать сразу
                </Button>
              ) : null}
            </div>
            <TranscriptReveal
              words={words}
              schedule={schedule}
              instant={instant}
              onDone={onHeard}
            />
            {heard.demo ? (
              <p className="text-caption text-text-3">Демо: расшифровка подготовлена заранее</p>
            ) : null}
          </section>
        ) : null}

        {flow.step === "extracting" ? (
          <section className="flex flex-col gap-4 pt-2">
            {sourceText ? <p className="text-body text-text-2">«{sourceText}»</p> : null}
            <StageList stages={EXTRACT_STAGES} current={stage} />
          </section>
        ) : null}

        {/* ---------- Проверка человеком ---------- */}
        {flow.step === "review" && prepared ? (
          <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <Marker>Разбор</Marker>
              {outcome?.by?.demo ? (
                <p className="text-caption text-text-3">Демо: разбор подготовлен заранее</p>
              ) : null}
            </div>
            <DraftReview
              cards={prepared.cards}
              onSource={setSource}
              request={
                requestDraft
                  ? {
                      title: `Заявка снабжению: ${requestDraft.name}`,
                      detail: [
                        requestDraft.qty !== null
                          ? `${requestDraft.qty} ${requestDraft.unit ?? "шт"}`
                          : null,
                        `к ${fmtDate(
                          requestDraft.neededBy && requestDraft.neededBy >= today
                            ? requestDraft.neededBy
                            : nextDay,
                        )}`,
                        "Исправить",
                      ]
                        .filter(Boolean)
                        .join(" · "),
                      missing: requestMissing,
                      onEdit: () => setEditRequest(true),
                    }
                  : null
              }
            />
            {nothingToCreate ? (
              <p className="text-caption text-text-2">
                В разборе нет объёма и нехватки: заводить нечего. Уточните голосом.
              </p>
            ) : null}
            <div className="hidden gap-2 lg:flex">
              <Button variant="secondary" onClick={clarify}>
                <Mic className="size-4" /> Уточнить голосом
              </Button>
              <Button
                variant="accent"
                onClick={onConfirm}
                disabled={nothingToCreate || confirm.isPending || !canWrite}
              >
                <Check className="size-4" /> Верно
              </Button>
            </div>
            <MobileActionBar>
              <Button variant="secondary" onClick={clarify}>
                <Mic className="size-4" /> Уточнить голосом
              </Button>
              <Button
                variant="accent"
                onClick={onConfirm}
                disabled={nothingToCreate || confirm.isPending || !canWrite}
              >
                <Check className="size-4" /> Верно
              </Button>
            </MobileActionBar>
          </section>
        ) : null}

        {/* ---------- Готово ---------- */}
        {flow.step === "done" ? (
          <section className="flex flex-col gap-4">
            <ul className="flex flex-col gap-2">
              {flow.created.map((entity) => (
                <li key={entity.id}>
                  <Link
                    to={entity.kind === "request" ? "/inbox" : "/today"}
                    className="focus-ring press bg-surface flex min-h-12 items-center gap-3 rounded-[var(--r-md)] px-4 py-3"
                  >
                    {entity.kind === "request" ? (
                      <PackageSearch className="text-text-2 size-5 shrink-0" />
                    ) : (
                      <FileText className="text-text-2 size-5 shrink-0" />
                    )}
                    <span className="text-list min-w-0 flex-1">{entity.title}</span>
                    <ChevronRight className="text-text-3 size-4 shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              {undoLeft > 0 ? (
                <Button variant="secondary" onClick={onUndo} disabled={retract.isPending}>
                  <Undo2 className="size-4" /> Отменить · <span className="tnum">{undoLeft}</span>
                </Button>
              ) : null}
              {showGoing ? (
                <Button
                  variant="accent"
                  onClick={async () => {
                    nextStep();
                    const after = currentStep();
                    // Следующий шаг глазами другой роли: переключаемся сразу, данные вкладки те же
                    const persona = after?.role ? CANON_PERSONA[after.role] : undefined;
                    if (after?.role && persona && after.role !== currentRole) {
                      await enterAs(persona, after.role);
                    }
                    void navigate({ to: after?.to ? after.to(projectId) : "/today" });
                  }}
                >
                  Дальше по сценарию
                </Button>
              ) : null}
              <Button variant="ghost" onClick={startOver}>
                <Mic className="size-4" /> Записать ещё
              </Button>
            </div>
          </section>
        ) : null}

        {/* ---------- Ошибка или отказ ---------- */}
        {flow.step === "error" && flow.error ? (
          <section className="flex flex-col gap-3">
            <p className="text-body text-text">{flow.error.message}</p>
            {flow.error.refused && examples.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {examples.map((example) => (
                  <Button
                    key={example.id}
                    variant="secondary"
                    onClick={() => runExample(example.id, example.message)}
                  >
                    Пример: {example.label}
                  </Button>
                ))}
              </div>
            ) : null}
            {flow.error.retry ? (
              <Button
                variant="secondary"
                onClick={() => send({ type: "retry" })}
                className="self-start"
              >
                <RotateCcw className="size-4" /> Повторить
              </Button>
            ) : null}
          </section>
        ) : null}

        {/* ---------- Голосовая капсула и текст ---------- */}
        {flow.step === "idle" || flow.step === "no-mic" || flow.step === "error" ? (
          <section className="flex flex-col items-center gap-3 pt-2">
            {flow.step !== "no-mic" ? (
              <button
                type="button"
                disabled={!canWrite}
                onPointerDown={onCapsuleDown}
                onClick={(event) => {
                  // Клавиатура: Enter и пробел дают click без pointerdown
                  if (event.detail === 0 && (flow.step === "idle" || flow.step === "error")) {
                    send({ type: "start" });
                  }
                }}
                className="focus-ring press glow-ember bg-pill text-pill-text flex min-h-16 w-full max-w-sm items-center justify-center gap-3 rounded-full px-6 text-[17px] font-medium disabled:opacity-45"
              >
                <Mic className="size-5" /> Удерживайте, чтобы говорить
              </button>
            ) : null}
            {!textOpen ? (
              <button
                type="button"
                onClick={() => setTextOpen(true)}
                className="focus-ring text-caption text-text-2 min-h-12 rounded-[var(--r-xs)] px-3 underline-offset-4 hover:underline"
              >
                или напишите текстом
              </button>
            ) : (
              <div className="flex w-full flex-col gap-2">
                <Textarea
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="Что произошло на объекте"
                  rows={3}
                  aria-label="Что произошло на объекте"
                  autoFocus
                />
                <Button
                  variant="accent"
                  className="self-end"
                  disabled={!text.trim() || !canWrite}
                  onClick={() => {
                    setCaptureKey(newCaptureKey());
                    send({ type: "submit-text" });
                  }}
                >
                  Отправить
                </Button>
              </div>
            )}
          </section>
        ) : null}
      </div>

      {/* Шторка источника: фраза расшифровки с выделенным фрагментом */}
      <SourceSheet
        open={!!source}
        onOpenChange={(open) => !open && setSource(null)}
        label={source?.label ?? ""}
        value={source?.value ?? ""}
        text={sourceText}
        range={locateQuote(sourceText, source?.quote ?? null)}
        origin={flow.input === "text" ? "Текст" : `Голосовое, ${clock(elapsedMs)}`}
      />

      {/* Правка заявки: что сказано во фразе, подставлено; чего нет — вписывает человек */}
      <BottomSheet
        open={editRequest}
        onOpenChange={setEditRequest}
        title="Заявка снабжению"
        description="Ничего не заказывается автоматически: снабжение решает руками"
      >
        {requestDraft ? (
          <RequestFields
            value={requestDraft}
            fallbackDate={nextDay}
            onChange={setRequestDraft}
            onDone={() => setEditRequest(false)}
          />
        ) : null}
      </BottomSheet>
    </>
  );
}

const photoMarks = (photos: { takenAt: string }[]) =>
  photos.map((photo, index) => ({ caption: `Фото ${index + 1}`, takenAt: photo.takenAt }));

/** Поля заявки в шторке: название, количество, единица, срок */
function RequestFields({
  value,
  fallbackDate,
  onChange,
  onDone,
}: {
  value: RequestPrefill;
  fallbackDate: string;
  onChange: (next: RequestPrefill) => void;
  onDone: () => void;
}) {
  const [qty, setQty] = useState(value.qty === null ? "" : String(value.qty));
  const parsed = Number(qty.replace(",", "."));
  const ready = value.name.trim().length > 1 && Number.isFinite(parsed) && parsed > 0;
  return (
    <div className="grid gap-3 pb-2">
      <label className="grid gap-1">
        <span className="text-caption text-text-3">Что нужно</span>
        <input
          value={value.name}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
          aria-label="Название материала"
          className="focus-ring bg-surface-2 text-list min-h-12 rounded-[var(--r-sm)] px-3"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1">
          <span className="text-caption text-text-3">Сколько</span>
          <input
            value={qty}
            inputMode="decimal"
            onChange={(event) => setQty(event.target.value)}
            aria-label="Количество"
            className="focus-ring bg-surface-2 text-list tnum min-h-12 rounded-[var(--r-sm)] px-3"
          />
        </label>
        <label className="grid gap-1">
          <span className="text-caption text-text-3">Единица</span>
          <input
            value={value.unit ?? "шт"}
            onChange={(event) => onChange({ ...value, unit: event.target.value })}
            aria-label="Единица измерения"
            className="focus-ring bg-surface-2 text-list min-h-12 rounded-[var(--r-sm)] px-3"
          />
        </label>
      </div>
      <label className="grid gap-1">
        <span className="text-caption text-text-3">Нужен к дате</span>
        <input
          type="date"
          value={value.neededBy ?? fallbackDate}
          onChange={(event) => onChange({ ...value, neededBy: event.target.value })}
          aria-label="Нужен к дате"
          className="focus-ring bg-surface-2 text-list min-h-12 rounded-[var(--r-sm)] px-3"
        />
      </label>
      <Button
        variant="accent"
        disabled={!ready}
        onClick={() => {
          onChange({ ...value, qty: parsed });
          onDone();
        }}
      >
        Сохранить заявку
      </Button>
    </div>
  );
}
