import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  CheckCheck,
  FileSearch,
  ListTree,
  PanelsTopLeft,
  Rows3,
  Send,
  X,
} from "lucide-react";
import {
  loadProject,
  ProjectNotFound,
  withProject,
  type ProjectPageProps,
} from "@/components/project/ProjectNotFound";
import { DocumentTree, type SheetCounts } from "@/components/extraction/DocumentTree";
import { SheetViewer, type SheetViewerHandle } from "@/components/extraction/SheetViewer";
import { PositionRow, type RowAction } from "@/components/extraction/PositionRow";
import { SendDialog, SplitDialog, type SendSummary } from "@/components/extraction/Dialogs";
import { ProcessingStages } from "@/components/documents/ProcessingStages";
import { confidenceLevel } from "@/components/common/ConfidenceIndicator";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { ScreenGate, ScreenSkeleton, StateBanner } from "@/components/common/ScreenStates";
import { useScreenState } from "@/lib/screen-state";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isActive, isVerified, specActions } from "@/lib/spec-store";
import { useQuery } from "@tanstack/react-query";
import { queries } from "@/api/queries";
import { docStatusTone, stageOfStatus } from "@/lib/project-meta";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { toast, toastUndo } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { processingStatusLabel as docStatusLabel, type ExtractedPosition } from "@/contracts";

export const Route = createFileRoute("/projects/$id/documents/$docId")({
  validateSearch: (search: Record<string, unknown>): { position?: string | undefined } => ({
    position: typeof search["position"] === "string" ? search["position"] : undefined,
  }),
  loader: ({ params, context }) => loadProject(context.queryClient, params.id),
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          {
            title: `Извлечение позиций — ${loaderData.project?.name ?? "Объект"} — neeklo FieldOps`,
          },
        ]
      : [],
  }),
  notFoundComponent: ProjectNotFound,
  component: withProject(ExtractionPage),
});

type Filter = "all" | "attention" | "check" | "pending" | "verified" | "inactive";

const filterLabels: Record<Filter, string> = {
  all: "Все",
  attention: "Требуют внимания",
  check: "Не удалось определить",
  pending: "Не проверены",
  verified: "Проверены",
  inactive: "Исключены",
};

function matches(item: ExtractedPosition, filter: Filter) {
  const level = confidenceLevel(item.confidence);
  switch (filter) {
    case "all":
      return isActive(item);
    case "attention":
      return item.review === "pending" && level === "mid";
    case "check":
      return item.review === "pending" && level === "low";
    case "pending":
      return item.review === "pending";
    case "verified":
      return isVerified(item);
    case "inactive":
      return !isActive(item);
  }
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

function ExtractionPage({ project, overview }: ProjectPageProps): React.JSX.Element {
  const { docId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();

  const card = useQuery(queries.document(docId));
  // До серверного пейджинга (P3-3) позиции ревизии загружаются целиком
  const positionsQuery = useQuery(queries.positions({ revisionId: docId, limit: 5000 }));
  const document = card.data?.document ?? null;
  const upload = card.data?.stage === null || !card.data ? undefined : { stage: card.data.stage };
  const sentAt = card.data?.handedOverAt ?? null;
  const positions = useMemo(() => positionsQuery.data?.items ?? [], [positionsQuery.data]);
  const sheets = useMemo(() => card.data?.sheets ?? [], [card.data]);
  const positionsBySheet = useMemo(() => {
    const map = new Map<string, ExtractedPosition[]>();
    for (const item of positions) {
      const list = map.get(item.sheetId) ?? [];
      list.push(item);
      map.set(item.sheetId, list);
    }
    return map;
  }, [positions]);
  const sheetCounts = useMemo(() => {
    const map = new Map<string, SheetCounts>();
    for (const [sheetId, list] of positionsBySheet) {
      map.set(sheetId, {
        total: list.filter(isActive).length,
        attention: list.filter(
          (item) => item.review === "pending" && confidenceLevel(item.confidence) !== "high",
        ).length,
      });
    }
    return map;
  }, [positionsBySheet]);

  const [filter, setFilter] = useState<Filter>("all");
  const list = useMemo(
    () => positions.filter((item) => matches(item, filter)),
    [positions, filter],
  );
  const counts = useMemo(() => {
    const result = {} as Record<Filter, number>;
    (Object.keys(filterLabels) as Filter[]).forEach((key) => {
      result[key] = positions.filter((item) => matches(item, key)).length;
    });
    return result;
  }, [positions]);

  const screen = useScreenState({
    pending: card.isPending || positionsQuery.isPending,
    empty: false,
    filtered: false,
    partial: false,
  });

  const [activeId, setActiveId] = useState<string | null>(search.position ?? null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mergeSourceId, setMergeSourceId] = useState<string | null>(null);
  const [splitId, setSplitId] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [currentSheetId, setCurrentSheetId] = useState<string | null>(null);
  const [mobilePanel, setMobilePanel] = useState<"tree" | "viewer" | "list">("list");

  const viewer = useRef<SheetViewerHandle>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const active = positions.find((item) => item.id === activeId) ?? null;
  const verifiedCount = counts.verified;
  const activeTotal = counts.all;
  const blocking = counts.check;
  const autoVerified = positions.filter(
    (item) => item.review === "pending" && confidenceLevel(item.confidence) === "high",
  );

  // Первая позиция по умолчанию: пришли по ссылке — на неё, иначе первая в списке
  useEffect(() => {
    if (!activeId && list[0]) setActiveId(list[0].id);
  }, [activeId, list]);

  // Выбранная позиция: прокрутить список и лист к ней
  const scrolledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!active || scrolledFor.current === active.id) return;
    scrolledFor.current = active.id;
    listRef.current
      ?.querySelector(`[data-position-id="${CSS.escape(active.id)}"]`)
      ?.scrollIntoView({ block: "nearest" });
    viewer.current?.scrollToPosition(active);
  }, [active]);

  // Свежие значения для стабильных обработчиков строк
  const live = useRef({ list, positions, mergeSourceId });
  live.current = { list, positions, mergeSourceId };

  const moveBy = useCallback((delta: number) => {
    const { list: items } = live.current;
    if (!items.length) return;
    setActiveId((current) => {
      const index = items.findIndex((item) => item.id === current);
      const next = items[Math.min(items.length - 1, Math.max(0, (index < 0 ? 0 : index) + delta))];
      return next?.id ?? current;
    });
  }, []);

  /** После действия, убирающего строку из текущего фильтра, переходим к соседней. */
  const advanceFrom = useCallback((id: string) => {
    const { list: items } = live.current;
    const index = items.findIndex((item) => item.id === id);
    const next = items[index + 1] ?? items[index - 1];
    if (next) setActiveId(next.id);
  }, []);

  const onActivate = useCallback((id: string) => {
    const { mergeSourceId: source, positions: all } = live.current;
    if (source && source !== id) {
      const snapshot = all.filter((item) => item.id === source || item.id === id);
      const target = all.find((item) => item.id === id)!;
      const sourceItem = all.find((item) => item.id === source)!;
      const summed = specActions.merge(source, id);
      setMergeSourceId(null);
      setActiveId(id);
      toastUndo(
        `Поз. ${sourceItem.position} объединена с поз. ${target.position}`,
        () => specActions.restore(snapshot),
        summed
          ? "Количество сложено."
          : "Единицы разные — количество не сложено, проверьте вручную.",
      );
      return;
    }
    setActiveId(id);
  }, []);

  const onAction = useCallback(
    (id: string, action: RowAction) => {
      const { positions: all } = live.current;
      const item = all.find((p) => p.id === id);
      if (!item) return;
      setActiveId(id);
      switch (action) {
        case "confirm":
          if (item.review !== "pending") return;
          specActions.confirm([id]);
          advanceFrom(id);
          return;
        case "edit":
          setEditingId(id);
          return;
        case "exclude":
          advanceFrom(id);
          specActions.exclude(id);
          toastUndo(`Поз. ${item.position} исключена`, () => specActions.restore([item]));
          return;
        case "header":
          specActions.markHeader(id);
          toastUndo(`Поз. ${item.position} отмечена как заголовок`, () =>
            specActions.restore([item]),
          );
          return;
        case "merge":
          setMergeSourceId(id);
          return;
        case "split":
          setSplitId(id);
          return;
        case "restore":
          specActions.reopen(id);
          return;
        case "source":
          scrolledFor.current = null;
          viewer.current?.scrollToPosition(item);
          return;
      }
    },
    [advanceFrom],
  );

  const onSaveEdit = useCallback(
    (
      id: string,
      patch: Pick<ExtractedPosition, "projectName" | "qty" | "unit" | "characteristics">,
    ) => {
      advanceFrom(id);
      specActions.correct(id, patch);
      setEditingId(null);
      toast.success("Позиция исправлена и подтверждена");
    },
    [advanceFrom],
  );
  const onCancelEdit = useCallback(() => setEditingId(null), []);
  const onSheetChange = useCallback((sheetId: string) => setCurrentSheetId(sheetId), []);
  const onSelectSheet = useCallback((sheetId: string) => {
    viewer.current?.scrollToSheet(sheetId);
    setMobilePanel("viewer");
  }, []);
  const onSelectOnPage = useCallback((id: string) => onActivate(id), [onActivate]);

  const toHandOver = useMemo(
    () => positions.filter((item) => isVerified(item) && item.handedOverAt === null),
    [positions],
  );
  const canSend = blocking === 0 && toHandOver.length > 0;
  const allHandedOver = verifiedCount > 0 && toHandOver.length === 0;
  const summary: SendSummary = useMemo(() => {
    return {
      create: toHandOver.length,
      needNormalization: toHandOver.filter((item) => !item.normalizedName).length,
      withoutCharacteristics: toHandOver.filter((item) => item.characteristics.length === 0).length,
      region: overview?.region ?? "—",
      pendingLeft: positions.filter((item) => item.review === "pending").length,
      excluded: positions.filter((item) => !isActive(item)).length,
    };
  }, [positions, toHandOver, overview?.region]);

  function confirmAllVerified() {
    const snapshot = autoVerified;
    specActions.confirm(snapshot.map((item) => item.id));
    toastUndo(
      `Подтверждено ${fmtNum(snapshot.length)} позиций`,
      () => specActions.restore(snapshot),
      "Позиции со статусом «Проверено» отмечены как проверенные человеком.",
    );
  }

  function send() {
    specActions.sendToProcurement(docId);
    setSendOpen(false);
    toast.success(`В закупку переданы позиции: ${fmtNum(summary.create)}`, {
      description: `По ним можно запрашивать цены у поставщиков. Нормализации требуют ${fmtNum(summary.needNormalization)}.`,
      action: {
        label: "Открыть материалы",
        onClick: () => navigate({ to: "/projects/$id/materials", params: { id: project.id } }),
      },
    });
  }

  // Клавиатура: j/k — навигация, Enter — подтвердить, e — исправить, x — исключить, Ctrl+Enter — в закупку
  const keyState = useRef({ canSend, activeId, editingId, splitId, sendOpen, mergeSourceId });
  keyState.current = { canSend, activeId, editingId, splitId, sendOpen, mergeSourceId };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keyState.current;
      if (k.sendOpen || k.splitId || k.editingId || isTyping(e.target)) return;
      if (document === null) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (k.canSend) setSendOpen(true);
        else
          toast("Передача недоступна", {
            description: "Сначала разберите позиции «Не удалось определить».",
          });
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Escape" && k.mergeSourceId) {
        setMergeSourceId(null);
        return;
      }
      // Физическая клавиша, чтобы работало и в русской раскладке; e.key — запасной вариант
      const letters: Record<string, string> = {
        о: "KeyJ",
        л: "KeyK",
        у: "KeyE",
        ч: "KeyX",
        j: "KeyJ",
        k: "KeyK",
        e: "KeyE",
        x: "KeyX",
      };
      const code = e.code || letters[e.key.toLowerCase()] || "";
      if (code === "KeyJ" || e.key === "ArrowDown") {
        e.preventDefault();
        moveBy(1);
      } else if (code === "KeyK" || e.key === "ArrowUp") {
        e.preventDefault();
        moveBy(-1);
      } else if (!k.activeId) {
        return;
      } else if (e.key === "Enter") {
        const target = e.target as HTMLElement;
        if (target.closest("button")) return;
        e.preventDefault();
        onAction(k.activeId, "confirm");
      } else if (code === "KeyE") {
        e.preventDefault();
        onAction(k.activeId, "edit");
      } else if (code === "KeyX") {
        e.preventDefault();
        onAction(k.activeId, "exclude");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moveBy, onAction, document]);

  if (card.isPending) return <ScreenSkeleton kind="table" />;
  if (!document) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <h1 className="text-section-title">Документ не найден</h1>
        <p className="mt-2 text-text-secondary">Возможно, документ удалён или ссылка устарела.</p>
        <Button asChild className="mt-6" size="sm">
          <Link to="/projects/$id/documents" params={{ id: project.id }}>
            К документации объекта
          </Link>
        </Button>
      </div>
    );
  }

  const processing =
    screen === "processing" ||
    (positions.length === 0 &&
      (document.status === "uploaded" ||
        document.status === "recognizing" ||
        (upload && upload.stage < 3)));
  const gated =
    screen === "loading" || screen === "error" || screen === "forbidden" || screen === "empty";
  const pct = activeTotal ? Math.round((verifiedCount / activeTotal) * 100) : 0;
  const splitItem = positions.find((item) => item.id === splitId) ?? null;
  const mergeSource = positions.find((item) => item.id === mergeSourceId) ?? null;

  return (
    <div className="-mx-4 -mt-5 -mb-24 flex h-[calc(100dvh-52px-56px)] flex-col md:-mx-7 md:-mt-6 lg:-mb-7 lg:h-[calc(100dvh-52px-16px)]">
      {/* Шапка документа */}
      <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-surface px-4 py-2 md:px-5">
        <Link
          to="/projects/$id/documents"
          params={{ id: project.id }}
          aria-label="К документации"
          className="focus-ring grid size-8 shrink-0 place-items-center rounded-full text-text-secondary transition-fast hover:bg-hover hover:text-text-primary"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-semibold" title={document.title}>
            {document.title}
          </h1>
          <p className="truncate text-caption text-text-muted">
            {project.code} · {document.section} · {document.version} · {document.sheetCount} л. ·
            загружен {fmtDateTime(document.uploadedAt)}
          </p>
        </div>
        <StatusBadge tone={docStatusTone[document.status]}>
          {docStatusLabel[document.status]}
        </StatusBadge>
        <div className="segmented-control w-full lg:hidden" role="tablist">
          {(
            [
              { id: "tree", label: "Структура", icon: ListTree },
              { id: "viewer", label: "Документ", icon: PanelsTopLeft },
              {
                id: "list",
                label: `Позиции ${activeTotal ? fmtNum(activeTotal) : ""}`,
                icon: Rows3,
              },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={mobilePanel === tab.id}
              onClick={() => setMobilePanel(tab.id)}
              className={cn(
                "segment flex flex-1 items-center justify-center gap-1.5 text-[12px]",
                mobilePanel === tab.id && "segment-active",
              )}
            >
              <tab.icon className="size-3.5" /> {tab.label}
            </button>
          ))}
        </div>
      </header>

      {gated ? (
        <div
          className={cn(
            "min-h-0 flex-1",
            screen === "loading" ? "" : "grid place-items-center overflow-y-auto",
          )}
        >
          <ScreenGate
            state={screen}
            skeleton={<ScreenSkeleton kind="split" />}
            copy={{
              section: "Проверка позиций",
              roles: "руководителю проекта и ПТО",
              errorTitle: "Не удалось загрузить позиции документа",
              empty: {
                icon: FileSearch,
                title: "В документе не найдено позиций",
                description:
                  "Таблиц спецификации в документе нет. Загрузите лист спецификации или ведомость материалов в PDF, Word или Excel — позиции появятся здесь для проверки.",
                actionLabel: "К документации",
                onAction: () =>
                  navigate({ to: "/projects/$id/documents", params: { id: project.id } }),
              },
            }}
          >
            {null}
          </ScreenGate>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] lg:grid-cols-[260px_minmax(0,1fr)_460px]">
          {/* Структура */}
          <aside
            className={cn(
              "min-h-0 overflow-y-auto border-r border-border bg-surface",
              mobilePanel === "tree" ? "block" : "hidden lg:block",
            )}
          >
            <p className="px-3 pt-3 text-[11px] font-semibold tracking-[.04em] text-text-muted uppercase">
              Структура документа
            </p>
            <DocumentTree
              sheets={sheets}
              counts={sheetCounts}
              currentSheetId={currentSheetId}
              onSelectSheet={onSelectSheet}
            />
          </aside>

          {/* Документ */}
          <div
            className={cn(
              "min-h-0 min-w-0",
              mobilePanel === "viewer" ? "block" : "hidden lg:block",
            )}
          >
            <SheetViewer
              ref={viewer}
              document={document}
              projectCode={project.contract}
              sheets={sheets}
              positionsBySheet={positionsBySheet}
              activeId={activeId}
              activeSheetId={active?.sheetId ?? null}
              onSelect={onSelectOnPage}
              onSheetChange={onSheetChange}
            />
          </div>

          {/* Позиции */}
          <aside
            className={cn(
              "min-h-0 flex-col border-l border-border bg-surface",
              mobilePanel === "list" ? "flex" : "hidden lg:flex",
            )}
          >
            {processing ? (
              <div className="p-5">
                <p className="text-[14px] font-medium">Документ обрабатывается</p>
                <p className="mt-1 text-caption text-text-muted">
                  Позиции появятся здесь после извлечения таблиц. Страницу можно не обновлять.
                </p>
                <div className="mt-4">
                  <ProcessingStages stage={upload?.stage ?? stageOfStatus(document.status)} />
                </div>
              </div>
            ) : positions.length === 0 && document.positionsTotal ? (
              <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                <FileSearch className="size-8 text-text-muted" strokeWidth={1.5} />
                <p className="mt-3 text-[14px] font-medium">Позиции ревизии не загружены в демо</p>
                <p className="mt-1 text-caption text-text-muted">
                  Извлечено {fmtNum(document.positionsTotal)}, проверено{" "}
                  {fmtNum(document.positionsVerified ?? 0)}. В демо построчно загружена только
                  спецификация «Северной Короны».
                </p>
              </div>
            ) : positions.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                <FileSearch className="size-8 text-text-muted" strokeWidth={1.5} />
                <p className="mt-3 text-[14px] font-medium">Таблиц спецификации не найдено</p>
                <p className="mt-1 text-caption text-text-muted">
                  В документе {document.sheetCount} листов чертежей без таблиц материалов. Позиции
                  для закупки берутся из спецификаций.
                </p>
              </div>
            ) : (
              <>
                <div className="shrink-0 border-b border-border px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[15px]">
                      Проверено <b className="tnum font-semibold">{fmtNum(verifiedCount)}</b> из{" "}
                      <b className="tnum font-semibold">{fmtNum(activeTotal)}</b>
                    </p>
                    <span className="tnum text-caption text-text-muted">{pct}%</span>
                  </div>
                  <div
                    className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-subtle"
                    aria-label={`Проверено ${pct}%`}
                  >
                    <div
                      className="h-full bg-ok transition-[width] duration-300"
                      style={{ width: `${pct}%` }}
                    />
                    <div
                      className="h-full bg-warn/60"
                      style={{
                        width: `${activeTotal ? (counts.attention / activeTotal) * 100 : 0}%`,
                        minWidth: counts.attention ? 3 : 0,
                      }}
                    />
                    <div
                      className="h-full bg-danger"
                      style={{
                        width: `${activeTotal ? (counts.check / activeTotal) * 100 : 0}%`,
                        minWidth: counts.check ? 3 : 0,
                      }}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-3 h-8 w-full"
                    disabled={autoVerified.length === 0}
                    onClick={confirmAllVerified}
                  >
                    <CheckCheck className="size-4" /> Подтвердить все проверенные
                    {autoVerified.length > 0 && (
                      <span className="tnum text-text-muted">{fmtNum(autoVerified.length)}</span>
                    )}
                  </Button>
                  <div className="-mx-1 mt-2 flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none]">
                    {(
                      ["all", "check", "attention", "pending", "verified", "inactive"] as Filter[]
                    ).map((key) => (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={filter === key}
                        onClick={() => setFilter(key)}
                        className={cn(
                          "focus-ring inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-[12px] transition-fast",
                          filter === key
                            ? "bg-ink text-primary-foreground"
                            : "text-text-secondary hover:bg-hover",
                          key === "check" && counts.check > 0 && filter !== key && "text-danger",
                        )}
                      >
                        {filterLabels[key]}
                        <span
                          className={cn("tnum", filter === key ? "opacity-70" : "text-text-muted")}
                        >
                          {fmtNum(counts[key])}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {screen === "partial" && (
                  <StateBanner
                    tone="warn"
                    className="m-3 mb-0"
                    title="Листы 94–95 распознаны частично"
                  >
                    Скан плохого качества: часть строк могла не попасть в список. Сверьте количество
                    позиций с оригиналом листа.
                  </StateBanner>
                )}
                {mergeSource && (
                  <div className="flex shrink-0 items-center gap-2 border-b border-accent-border bg-accent-subtle px-4 py-2 text-caption">
                    <span className="min-w-0 flex-1">
                      Выберите позицию, с которой объединить поз. <b>{mergeSource.position}</b>
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={() => setMergeSourceId(null)}
                    >
                      <X className="size-3.5" /> Отмена
                    </Button>
                  </div>
                )}

                <div
                  ref={listRef}
                  role="listbox"
                  aria-label="Извлечённые позиции"
                  className="min-h-0 flex-1 overflow-y-auto"
                >
                  {list.length === 0 || screen === "filtered" ? (
                    <EmptyState
                      variant="filtered"
                      title="В этом фильтре позиций нет"
                      description={
                        filter === "check"
                          ? "Все позиции «Не удалось определить» разобраны — можно передавать в закупку."
                          : "Переключитесь на «Все», чтобы увидеть остальные позиции документа."
                      }
                      actionLabel="Показать все"
                      onAction={() => setFilter("all")}
                    />
                  ) : (
                    list.map((item) => (
                      <PositionRow
                        key={item.id}
                        item={item}
                        active={item.id === activeId}
                        editing={item.id === editingId}
                        mergeTarget={!!mergeSourceId && item.id !== mergeSourceId}
                        mergeSource={item.id === mergeSourceId}
                        onActivate={onActivate}
                        onAction={onAction}
                        onSaveEdit={onSaveEdit}
                        onCancelEdit={onCancelEdit}
                      />
                    ))
                  )}
                </div>

                <div className="shrink-0 border-t border-border p-3">
                  {allHandedOver ? (
                    <div className="flex items-center justify-between gap-3 rounded-[var(--r-md)] bg-ok-bg px-3 py-2.5 text-[13px] text-ok">
                      <span>
                        Проверенные позиции переданы в закупку
                        {sentAt ? ` · ${fmtDateTime(sentAt)}` : ""}
                      </span>
                      <Link
                        to="/projects/$id/materials"
                        params={{ id: project.id }}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        Открыть материалы
                      </Link>
                    </div>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="block">
                          <Button
                            variant="accent"
                            className="w-full"
                            disabled={!canSend}
                            onClick={() => setSendOpen(true)}
                          >
                            <Send className="size-4" /> Передать проверенные позиции в закупку
                            <span className="tnum opacity-80">{fmtNum(toHandOver.length)}</span>
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {!canSend && (
                        <TooltipContent className="max-w-72">
                          {blocking > 0
                            ? `Осталось ${blocking} ${blocking === 1 ? "позиция" : "позиции"} «Не удалось определить». Исправьте или исключите их.`
                            : "Нет проверенных позиций, которые ещё не переданы в закупку."}
                        </TooltipContent>
                      )}
                    </Tooltip>
                  )}
                  {!allHandedOver && blocking > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilter("check")}
                      className="mt-2 w-full text-center text-caption text-danger underline-offset-2 hover:underline"
                    >
                      Не удалось определить: {blocking} — показать
                    </button>
                  )}
                </div>
              </>
            )}
          </aside>
        </div>
      )}

      {/* Подсказки клавиатуры */}
      <footer className="hidden h-9 shrink-0 items-center gap-5 border-t border-border bg-surface px-5 text-caption text-text-muted lg:flex">
        {[
          ["J", "K", "следующая и предыдущая"],
          ["Enter", "", "подтвердить"],
          ["E", "", "исправить"],
          ["X", "", "исключить"],
          ["Ctrl", "Enter", "передать в закупку"],
          ["Esc", "", "отменить объединение"],
        ].map(([a, b, label]) => (
          <span key={label} className="inline-flex items-center gap-1.5">
            <kbd className="rounded-[var(--r-xs)] border border-border bg-subtle px-1.5 py-px font-sans text-[11px] text-text-secondary">
              {a}
            </kbd>
            {b && (
              <>
                {a === "Ctrl" ? "+" : ""}
                <kbd className="rounded-[var(--r-xs)] border border-border bg-subtle px-1.5 py-px font-sans text-[11px] text-text-secondary">
                  {b}
                </kbd>
              </>
            )}
            {label}
          </span>
        ))}
        {active && (
          <span className="ml-auto truncate">
            Поз. {active.position} · лист {active.sheetNumber}
          </span>
        )}
      </footer>

      <SplitDialog
        item={splitItem}
        onOpenChange={(open) => !open && setSplitId(null)}
        onSplit={(id, qty) => {
          specActions.split(id, qty);
          setSplitId(null);
          toast.success("Позиция разделена на две");
        }}
      />
      <SendDialog open={sendOpen} summary={summary} onOpenChange={setSendOpen} onConfirm={send} />
    </div>
  );
}
