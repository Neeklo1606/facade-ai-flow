import { completePageHead } from "@/lib/page-head";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { currentStep, nextStep, setChain, useGuide } from "@/lib/guide/store";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowUp,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  CloudOff,
  FileText,
  Mic,
  PackageSearch,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Undo2,
} from "lucide-react";
import { EmptyState, PageHeader, WidgetCard, WidgetCardHeader } from "@/components/common";
import { BottomSheet } from "@/components/common/BottomSheet";
import {
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
  UNDO_WINDOW_MS,
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
  head: () =>
    completePageHead(
      {
        meta: [
          { title: "Запись — гайка" },
          {
            name: "description",
            content: "Скажите, что произошло на объекте: голос, текст и фото в одном месте.",
          },
          { property: "og:title", content: "Запись — гайка" },
          { property: "og:type", content: "website" },
        ],
      },
      "Запись — гайка",
      "Голос, текст и фото с объекта в одном месте.",
    ),
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
  // Расшифровка в разборе раскрыта на широком экране: места хватает, на телефоне свёрнута
  const wide = useMediaQuery("(min-width: 1024px)", false);

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

  const tone: StageTone =
    flow.step === "done"
      ? "success"
      : working(flow.step)
        ? "processing"
        : capturing(flow.step)
          ? "live"
          : flow.step === "error" && !flow.error?.refused
            ? "critical"
            : "rest";
  const limitLeft = remainingSec(elapsedMs);
  const atRest = flow.step === "idle" || flow.step === "no-mic" || flow.step === "error";
  const [phraseLead, phraseRest] = splitPhrase(scenario?.message ?? "");
  const origin = flow.input === "text" ? "Текст" : `Голосовое, ${clock(elapsedMs)}`;

  return (
    <>
      {/* Экран «Готово» — свой заголовок крупно в поле: «Запись» над ним читалась бы вторым */}
      {flow.step !== "done" ? <PageHeader title="Запись" /> : null}

      <div className="relative flex flex-col gap-6" data-capture-step={flow.step}>
        {/* ---------- Покой, нет микрофона, ошибка: поле-герой и голосовая капсула ---------- */}
        {atRest ? (
          <Stage tone={tone} className={STAGE_HEIGHT}>
            {flow.step === "idle" ? (
              examples.length > 0 ? (
                <>
                  <Marker className="order-1 lg:order-3">Скажите, например</Marker>
                  <p className="text-title order-2 lg:order-4 lg:max-w-[36ch]">
                    «<span className="text-text">{phraseLead}</span>
                    {phraseRest ? " " : null}
                    {phraseRest ? <span className="tone-2">{phraseRest}</span> : null}»
                  </p>
                  {examples.length > 1 ? (
                    <div
                      className="order-3 -mx-1 flex overflow-x-auto px-1 lg:order-1"
                      role="group"
                      aria-label="Сценарий показа"
                    >
                      <div className="seg bg-surface/60 backdrop-blur-md">
                        {examples.map((example) => (
                          <button
                            key={example.id}
                            type="button"
                            aria-pressed={example.id === scenario?.id}
                            data-active={example.id === scenario?.id}
                            onClick={() => send({ type: "pick", scenario: example.id })}
                            className="text-body seg-item focus-ring press min-h-12 px-5"
                          >
                            {example.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <Marker className="order-1">Скажите</Marker>
                  <p className="text-title order-2">
                    <span className="text-text">Что сделали и где.</span>{" "}
                    <span className="tone-2">Сколько, сколько людей и что нужно на завтра.</span>
                  </p>
                </>
              )
            ) : null}

            {/* ---------- Нет микрофона ---------- */}
            {flow.step === "no-mic" ? (
              <div className="order-1 flex flex-col gap-3">
                <Marker>Нет микрофона</Marker>
                <p className="text-title">
                  {flow.noMic === "denied"
                    ? "Доступ к микрофону запрещён. Его возвращают в настройках браузера."
                    : flow.noMic === "unsupported"
                      ? "Этот браузер не записывает звук."
                      : "Микрофон не включился."}
                </p>
              </div>
            ) : null}

            {/* ---------- Ошибка или отказ ---------- */}
            {flow.step === "error" && flow.error ? (
              <div className="order-1 flex flex-col gap-4">
                <Marker>{flow.error.refused ? "Не разобрали" : "Не получилось"}</Marker>
                <p className="text-title">{flow.error.message}</p>
                {flow.error.refused && examples.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {examples.map((example) => (
                      <button
                        key={example.id}
                        type="button"
                        onClick={() => runExample(example.id, example.message)}
                        className="text-body-strong focus-ring press bg-surface/70 text-text is-hover:bg-surface min-h-12 rounded-full px-5 font-medium backdrop-blur-md"
                      >
                        Пример: {example.label}
                      </button>
                    ))}
                  </div>
                ) : null}
                {flow.error.retry ? (
                  <button
                    type="button"
                    onClick={() => send({ type: "retry" })}
                    className="text-body-strong focus-ring press bg-surface/70 text-text is-hover:bg-surface inline-flex min-h-12 items-center gap-2 self-start rounded-full px-5 font-medium backdrop-blur-md"
                  >
                    <RotateCcw className="size-4" /> Повторить
                  </button>
                ) : null}
              </div>
            ) : null}

            {/* ---------- Голосовая капсула и текст ---------- */}
            <div className="order-4 mt-auto flex flex-col items-center gap-2 pt-4 lg:order-2 lg:my-auto lg:py-6">
              {/* Текст: строка ввода над капсулой, отправка круглой кнопкой, как у Catalist */}
              {textOpen ? (
                <div className="bg-surface/85 ring-line mb-1 flex w-full max-w-[560px] items-end gap-2 rounded-[28px] p-2 pl-4 ring-1 backdrop-blur-xl">
                  <Textarea
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder="Что произошло на объекте"
                    rows={2}
                    aria-label="Что произошло на объекте"
                    autoFocus
                    className="text-body min-h-12 flex-1 resize-none border-0 bg-transparent px-0 py-3 shadow-none focus-visible:ring-0"
                  />
                  <button
                    type="button"
                    aria-label="Отправить"
                    className="focus-ring press bg-pill text-pill-text grid size-12 shrink-0 place-items-center rounded-full disabled:opacity-40"
                    disabled={!text.trim() || !canWrite}
                    onClick={() => {
                      setCaptureKey(newCaptureKey());
                      send({ type: "submit-text" });
                    }}
                  >
                    <ArrowUp className="size-5" strokeWidth={2.25} />
                  </button>
                </div>
              ) : null}
              {flow.step === "no-mic" ? (
                examples.length > 0 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => send({ type: "simulate" })}
                      className="text-heading pill-action focus-ring press glow-ember w-full max-w-[420px] lg:min-h-14"
                    >
                      <Play className="size-5" /> Показать без микрофона
                    </button>
                    <span className="text-caption text-text-2">Демо: имитация записи</span>
                  </>
                ) : null
              ) : (
                <div className={CAPSULE}>
                  <button
                    type="button"
                    onClick={addPhoto}
                    disabled={!canWrite}
                    aria-label="Добавить фото"
                    className="focus-ring press is-hover:bg-[color-mix(in_oklab,currentColor_10%,transparent)] grid size-12 shrink-0 place-items-center rounded-full opacity-80 disabled:opacity-40"
                  >
                    <Plus className="size-5" />
                  </button>
                  <span
                    aria-hidden="true"
                    className="h-6 w-px shrink-0 bg-[color-mix(in_oklab,currentColor_18%,transparent)]"
                  />
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
                    className="focus-ring press flex min-h-14 min-w-0 flex-1 touch-none items-center justify-between gap-3 rounded-full py-1 pr-1 pl-3 text-left select-none disabled:opacity-45"
                  >
                    <span className="text-body-strong font-medium">
                      Удерживайте, чтобы говорить
                    </span>
                    <span
                      aria-hidden="true"
                      className="bg-ember text-on-orange glow-ember grid size-12 shrink-0 place-items-center rounded-full"
                    >
                      <Mic className="size-[22px]" strokeWidth={2} />
                    </span>
                  </button>
                </div>
              )}
              {photos.length > 0 && flow.step !== "no-mic" ? (
                <span className="text-caption text-text-2">
                  Фото к записи: <span className="tnum">{photos.length}</span>
                </span>
              ) : null}
              {!textOpen ? (
                <button
                  type="button"
                  onClick={() => setTextOpen(true)}
                  className="focus-ring text-caption text-text-2 is-hover:text-text min-h-12 rounded-full px-4 underline-offset-4 hover:underline"
                >
                  или напишите текстом
                </button>
              ) : null}
            </div>
          </Stage>
        ) : null}

        {/* ---------- Запись ---------- */}
        {capturing(flow.step) ? (
          <Stage tone="live" className={STAGE_HEIGHT}>
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-2.5 rounded-full",
                    flow.step === "paused" ? "bg-text-3" : "bg-risk motion-safe:animate-pulse",
                  )}
                />
                <Marker>{flow.step === "paused" ? "На паузе" : "Идёт запись"}</Marker>
              </span>
              {photos.length > 0 ? (
                <span className="text-caption text-text-2 bg-surface/60 rounded-full px-3 py-1 backdrop-blur-md">
                  Фото: <span className="tnum">{photos.length}</span>
                </span>
              ) : null}
            </div>

            <div className="my-auto flex flex-col items-center gap-4 py-6">
              <div className="bg-surface/55 ring-line flex flex-col items-center rounded-full px-10 py-4 ring-1 backdrop-blur-xl sm:px-14 sm:py-5">
                <span className="text-caption text-text-2">
                  {simulated
                    ? "Демо: имитация записи"
                    : flow.step === "paused"
                      ? "Пауза"
                      : `осталось ${Math.max(0, limitLeft)} с из ${CAPTURE_LIMIT_SEC}`}
                </span>
                <span
                  className={cn(
                    "text-hero tnum",
                    nearLimit(elapsedMs) && !simulated && "text-risk",
                  )}
                >
                  {clock(elapsedMs)}
                </span>
              </div>
              <LiveWave
                level={flow.step === "paused" ? 0 : level}
                active={flow.step === "recording"}
              />
              <span className="text-caption text-text-2 inline-flex items-center gap-2">
                <CloudOff className="size-4" /> Запись сохранится даже без сети
              </span>
            </div>

            <div className="mx-auto grid w-full max-w-[420px] grid-cols-3 items-end justify-items-center gap-2">
              <button type="button" onClick={addPhoto} className={ROUND_ACTION}>
                <span className={ROUND_ICON}>
                  <Camera className="size-6" />
                </span>
                Фото
              </button>
              <button
                type="button"
                onClick={() => send({ type: "finish" })}
                className="focus-ring press text-list flex flex-col items-center gap-2 rounded-[var(--r-xl)] px-2 pt-1 font-semibold"
              >
                <span
                  className={cn(
                    "bg-orange-strong text-on-orange glow-ember grid size-[76px] place-items-center rounded-full",
                    flow.step === "recording" && "breathe",
                  )}
                >
                  <Check className="size-8" strokeWidth={2.5} />
                </span>
                Готово
              </button>
              {flow.input === "voice" ? (
                flow.step === "paused" ? (
                  <button
                    type="button"
                    onClick={() => {
                      recorder.resume();
                      send({ type: "resume" });
                    }}
                    className={ROUND_ACTION}
                  >
                    <span className={ROUND_ICON}>
                      <Play className="size-6" />
                    </span>
                    Продолжить
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      recorder.pause();
                      send({ type: "pause" });
                    }}
                    className={ROUND_ACTION}
                  >
                    <span className={ROUND_ICON}>
                      <Pause className="size-6" />
                    </span>
                    Пауза
                  </button>
                )
              ) : (
                <span aria-hidden="true" />
              )}
            </div>
          </Stage>
        ) : null}

        {/* ---------- Отправка, расшифровка, разбор: поле песочное, этапы текстом ---------- */}
        {working(flow.step) ? (
          <Stage tone="processing" className={STAGE_HEIGHT}>
            {flow.step === "uploading" ? (
              <div className="flex flex-col gap-3" aria-live="polite">
                <Marker>{flow.input === "text" ? "Сохраняем" : "Отправляем запись"}</Marker>
                <p className="text-title">
                  {flow.input === "text" ? "Сохраняем текст" : "Запись ушла на расшифровку"}
                </p>
              </div>
            ) : null}

            {flow.step === "transcribing" && heard ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between gap-3">
                  <Marker>Расшифровка</Marker>
                  {!instant ? (
                    <button
                      type="button"
                      onClick={() => setInstant(true)}
                      className="text-body-strong focus-ring press bg-surface/60 text-text is-hover:bg-surface min-h-12 rounded-full px-4 font-medium backdrop-blur-md"
                    >
                      Показать сразу
                    </button>
                  ) : null}
                </div>
                <TranscriptReveal
                  words={words}
                  schedule={schedule}
                  instant={instant}
                  onDone={onHeard}
                  className="text-title lg:max-w-[38ch]"
                />
                {heard.demo ? (
                  <p className="text-caption text-text-2">Демо: расшифровка подготовлена заранее</p>
                ) : null}
              </div>
            ) : null}

            {flow.step === "extracting" ? (
              <>
                <div className="flex flex-col gap-3">
                  <Marker>Разбираю</Marker>
                  {sourceText ? (
                    <p className="text-heading lg:max-w-[44ch]">
                      <span className="tone-2">«{sourceText}»</span>
                    </p>
                  ) : null}
                </div>
                <StageList stages={EXTRACT_STAGES} current={stage} className="mt-auto pt-8" />
              </>
            ) : null}
          </Stage>
        ) : null}

        {/* ---------- Проверка человеком: лист деталей ---------- */}
        {flow.step === "review" && prepared ? (
          <section className="card-v3 rounded-[var(--r-sheet)] p-4 sm:p-6 lg:p-8">
            <span
              aria-hidden="true"
              className="bg-text/15 mx-auto mb-4 block h-1 w-10 rounded-full lg:hidden"
            />
            <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-8">
              <div className="flex flex-col gap-4 lg:sticky lg:top-4">
                <div className="flex flex-col items-start gap-3">
                  <span className="bg-sand-dim text-text-2 text-badge inline-flex h-8 items-center gap-2 rounded-full px-3">
                    <span aria-hidden="true" className="bg-warn size-2 rounded-full" />
                    Черновик
                  </span>
                  <h2 className="text-hero">
                    Разбор. <span className="tone-2">Проверьте, что поняли верно</span>
                  </h2>
                  {outcome?.by?.demo ? (
                    <p className="text-caption text-text-3">Демо: разбор подготовлен заранее</p>
                  ) : null}
                </div>
                <details className="group bg-surface-2 rounded-[var(--r-xl)]" open={wide}>
                  <summary className="focus-ring flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-[var(--r-xl)] px-4 py-2 [&::-webkit-details-marker]:hidden">
                    <span
                      aria-hidden="true"
                      className="bg-surface text-text-2 grid size-10 shrink-0 place-items-center rounded-full"
                    >
                      <FileText className="size-[18px]" strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-list block">Расшифровка</span>
                      <span className="text-caption text-text-3 block">{origin}</span>
                    </span>
                    <ChevronDown className="text-text-3 size-5 shrink-0 transition-transform duration-200 group-open:rotate-180" />
                  </summary>
                  <p className="text-body text-text-2 px-4 pt-1 pb-4">«{sourceText}»</p>
                </details>
              </div>
              <div className="flex flex-col gap-3">
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
                  <p className="text-caption text-text-2 px-1">
                    В разборе нет объёма и нехватки: заводить нечего. Уточните голосом.
                  </p>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}
        {flow.step === "review" && prepared ? (
          <>
            {/* Закреплено над плавающей панелью оболочки: место под капсулой оставлено */}
            <div className="h-20 lg:hidden" aria-hidden="true" />
            <div className="fixed inset-x-4 bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom)+16px)] z-30 sm:inset-x-0 sm:mx-auto sm:w-[480px] lg:sticky lg:bottom-6 lg:-mt-2">
              <div className="glass ring-line flex items-center gap-2 rounded-full p-2 ring-1">
                <button
                  type="button"
                  onClick={clarify}
                  className="text-body-strong focus-ring press bg-surface-2 text-text is-hover:bg-surface-3 inline-flex min-h-14 shrink-0 items-center gap-2 rounded-full px-4 font-medium sm:px-5"
                >
                  <Mic className="size-4" /> Уточнить голосом
                </button>
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={nothingToCreate || confirm.isPending || !canWrite}
                  className="text-body pill-action focus-ring press min-h-14 flex-1 px-4 disabled:opacity-45 lg:min-h-14"
                >
                  <Check className="size-5" strokeWidth={2.25} /> Верно
                </button>
              </div>
            </div>
          </>
        ) : null}

        {/* ---------- Готово ---------- */}
        {flow.step === "done" ? (
          <Stage tone="success" className="gap-6">
            <div className="flex flex-col items-start gap-4">
              <span
                aria-hidden="true"
                className="bg-ok-bg text-ok ring-ok/25 grid size-16 place-items-center rounded-full ring-1 backdrop-blur-md"
              >
                <Check className="size-8" strokeWidth={2.25} />
              </span>
              <div className="flex flex-col gap-1">
                <h1 className="text-hero">Готово</h1>
                <p className="text-heading">
                  Создано: <span className="tnum">{flow.created.length}</span>.{" "}
                  <span className="tone-2">Касание строки откроет её</span>
                </p>
              </div>
            </div>
            <ul className="flex flex-col gap-2 lg:max-w-[640px]">
              {flow.created.map((entity) => (
                <li key={entity.id}>
                  <Link
                    to={entity.kind === "request" ? "/inbox" : "/today"}
                    className="focus-ring press bg-surface/75 is-hover:bg-surface flex min-h-16 items-center gap-3 rounded-[var(--r-xl)] px-3 py-3 backdrop-blur-md"
                  >
                    <span
                      aria-hidden="true"
                      className="bg-surface-2 text-text-2 grid size-10 shrink-0 place-items-center rounded-full"
                    >
                      {entity.kind === "request" ? (
                        <PackageSearch className="size-[18px]" strokeWidth={1.75} />
                      ) : (
                        <FileText className="size-[18px]" strokeWidth={1.75} />
                      )}
                    </span>
                    <span className="text-list min-w-0 flex-1">{entity.title}</span>
                    <ChevronRight className="text-text-3 size-4 shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-2">
              {showGoing ? (
                <button
                  type="button"
                  className="pill-action focus-ring press lg:min-h-14"
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
                  Дальше по сценарию <ArrowRight className="size-4" />
                </button>
              ) : null}
              {undoLeft > 0 ? (
                <button
                  type="button"
                  onClick={onUndo}
                  disabled={retract.isPending}
                  className="text-body-strong focus-ring press bg-surface/75 text-text is-hover:bg-surface relative isolate inline-flex min-h-14 items-center gap-2 overflow-hidden rounded-full px-5 font-medium backdrop-blur-md disabled:opacity-45"
                >
                  <Undo2 className="size-4" /> Отменить · <span className="tnum">{undoLeft}</span>
                  <span
                    aria-hidden="true"
                    className="bg-text/10 absolute inset-y-0 left-0 -z-10 rounded-full transition-[width] duration-300 ease-linear"
                    style={{ width: `${(undoLeft * 1000 * 100) / UNDO_WINDOW_MS}%` }}
                  />
                </button>
              ) : null}
              <button
                type="button"
                onClick={startOver}
                className="text-body-strong focus-ring press text-text-2 is-hover:text-text inline-flex min-h-14 items-center gap-2 rounded-full px-4 font-medium"
              >
                <Mic className="size-4" /> Записать ещё
              </button>
            </div>
          </Stage>
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
        origin={origin}
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

/* ---------------------------------------------------------------- Вид v3 (ADR-044) */

/**
 * Поле-сцена экрана: тёплое пятно `hero-field`, шар света и точечная сетка. Одно на экран
 * (правило одного большого градиента): сетка нарисована псевдоэлементом, а шар меньше
 * четверти кадра, поэтому проверка кадра видит один градиент. Цвет поля — состояние:
 * покой и запись оранжевые, обработка песочная, готово зелёное, ошибка красная.
 */
type StageTone = "rest" | "live" | "processing" | "success" | "critical";

/*
 * Переменные поля переопределены с `!`: светлая тема задаёт свои внутри `hero-field`
 * селектором темы, и без важности песочное поле в светлой теме осталось бы оранжевым.
 */
const toneField: Record<StageTone, string> = {
  rest: "",
  live: "[--hero-a:rgba(241,96,1,0.5)]! [--hero-c:rgba(143,29,11,0.5)]! [[data-theme=light]_&]:[--hero-a:rgba(255,138,76,0.42)]! [[data-theme=light]_&]:[--hero-c:rgba(241,96,1,0.2)]!",
  processing:
    "[--hero-a:rgba(217,195,171,0.3)]! [--hero-b:rgba(217,195,171,0.16)]! [--hero-c:rgba(158,132,104,0.32)]! [[data-theme=light]_&]:[--hero-a:rgba(217,195,171,0.55)]! [[data-theme=light]_&]:[--hero-c:rgba(217,195,171,0.4)]!",
  success:
    "[--hero-a:color-mix(in_oklab,var(--ok)_26%,transparent)]! [--hero-b:rgba(217,195,171,0.14)]! [--hero-c:color-mix(in_oklab,var(--ok)_16%,transparent)]!",
  critical:
    "[--hero-a:color-mix(in_oklab,var(--risk)_30%,transparent)]! [--hero-c:color-mix(in_oklab,var(--risk)_18%,transparent)]!",
};

const toneOrb: Record<StageTone, string> = {
  rest: "bottom-[-56px] left-1/2 size-[240px] -translate-x-1/2 [[data-theme=light]_&]:opacity-75! sm:size-[320px] lg:top-1/2 lg:bottom-auto lg:size-[400px] lg:-translate-y-1/2",
  live: "top-1/2 left-1/2 size-[260px] -translate-x-1/2 -translate-y-1/2 opacity-75! [[data-theme=light]_&]:opacity-80! motion-safe:animate-[gaika-field_2s_ease-in-out_infinite] sm:size-[340px] lg:size-[420px]",
  processing:
    "top-[12%] right-[-60px] size-[240px] bg-[radial-gradient(circle_at_40%_40%,#ead8c2_0%,#d9c3ab_45%,transparent_70%)]! opacity-30! [[data-theme=light]_&]:opacity-70! motion-safe:animate-[gaika-field_6s_ease-in-out_infinite] sm:size-[320px] lg:size-[400px]",
  success:
    "top-[-40px] right-[-40px] size-[220px] bg-[radial-gradient(circle,color-mix(in_oklab,var(--ok)_70%,transparent)_0%,transparent_70%)]! opacity-35! sm:size-[300px]",
  critical:
    "top-[-40px] right-[-40px] size-[220px] bg-[radial-gradient(circle,color-mix(in_oklab,var(--risk)_70%,transparent)_0%,transparent_70%)]! opacity-30! sm:size-[300px]",
};

function Stage({
  tone,
  className,
  children,
}: {
  tone: StageTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      data-stage={tone}
      className={cn(
        "hero-field flex flex-col gap-5 rounded-[var(--r-sheet)] p-5 sm:p-8 lg:p-10",
        "transition-[background] duration-500",
        // Точечная сетка: точки 1 px, шаг 16 px, к низу поля растворяются
        "before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:bg-[radial-gradient(circle,var(--stage-dot)_1px,transparent_1.2px)] before:bg-[length:16px_16px] before:[mask-image:linear-gradient(to_bottom,black,transparent_80%)] before:content-['']",
        "[--stage-dot:rgba(247,243,239,0.08)] [[data-theme=light]_&]:[--stage-dot:rgba(28,24,20,0.08)]",
        toneField[tone],
        className,
      )}
    >
      <div aria-hidden="true" className={cn("orb", toneOrb[tone])} />
      {children}
    </section>
  );
}

/** Высота поля: до нижней панели оболочки, капсула ложится под большой палец */
const STAGE_HEIGHT =
  "min-h-[max(500px,calc(100dvh-var(--topbar-h)-var(--bottom-nav-h)-env(safe-area-inset-bottom)-104px))] lg:min-h-[min(720px,calc(100dvh-150px))]";

/*
 * Капсула ввода, как у Catalist: тёмное стекло на поле в обеих темах. В тёмной — уголь
 * с размытием, в светлой — тёмная капсула главной кнопки на светлом поле.
 */
const CAPSULE =
  "flex w-full max-w-[560px] items-center gap-1 rounded-full p-1.5 pl-1.5 ring-1 ring-line-2 backdrop-blur-xl bg-[color-mix(in_oklab,var(--void)_70%,transparent)] text-text [[data-theme=light]_&]:bg-pill [[data-theme=light]_&]:text-pill-text [[data-theme=light]_&]:ring-transparent";

/** Круглая кнопка записи: «Фото», «Пауза», «Продолжить» — круг 56 px и подпись под ним */
const ROUND_ACTION =
  "focus-ring press text-caption text-text flex flex-col items-center gap-2 rounded-[var(--r-xl)] px-2 pt-1 font-medium";
const ROUND_ICON =
  "bg-surface/70 ring-line grid size-14 place-items-center rounded-full ring-1 backdrop-blur-md";

/**
 * Фраза примера двумя тонами: первое предложение основным цветом, продолжение тише.
 * Нет точки — делим по первой запятой; текст и кавычки те же, что сказаны в примере.
 */
function splitPhrase(message: string): [string, string] {
  const sentence = message.match(/^(.+?[.!?])\s+(.+)$/su);
  if (sentence?.[1] && sentence[2]) return [sentence[1], sentence[2]];
  const clause = message.match(/^(.+?,)\s+(.+)$/su);
  if (clause?.[1] && clause[2]) return [clause[1], clause[2]];
  return [message, ""];
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
