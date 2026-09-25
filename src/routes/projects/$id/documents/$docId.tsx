import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  CheckCheck,
  FileSearch,
  ListTree,
  PanelsTopLeft,
  Rows3,
  Send,
  X,
  Plus,
  Upload,
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
import { PageActions, PageCaption } from "@/components/layout/PageActions";
import { MobileActionBar } from "@/components/common/MobileActionBar";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { ScreenGate, ScreenSkeleton, StateBanner } from "@/components/common/ScreenStates";
import { useScreenState } from "@/lib/screen-state";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { undoConfirmInput, undoInput, usePositionMutations } from "@/api/mutations";
import { useAccess } from "@/api/access";
import { usePositionLookup } from "@/api/positions";
import { useExtractionJobsWatch } from "@/api/extraction";
import type { PositionView } from "@/api/types";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { queries } from "@/api/queries";
import { docStatusTone, stageOfStatus } from "@/lib/project-meta";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { dataSource } from "@/api/config";
import { extractsDocuments, note } from "@/lib/contour-copy";
import { CreatePositionDialog } from "@/components/documents/CreatePositionDialog";
import { ImportSpecDialog } from "@/components/documents/ImportSpecDialog";
import { toast, toastUndo } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  isActivePosition,
  processingStatusLabel as docStatusLabel,
  type ExtractedPosition,
} from "@/contracts";
import { prefetch } from "@/api/prefetch";

export const Route = createFileRoute("/projects/$id/documents/$docId")({
  validateSearch: (search: Record<string, unknown>): { position?: string | undefined } => ({
    position: typeof search["position"] === "string" ? search["position"] : undefined,
  }),
  loader: async ({ params, context }) => {
    const [result] = await Promise.all([
      loadProject(context.queryClient, params.id),
      prefetch(context.queryClient, queries.document(params.docId)),
      prefetch(context.queryClient, queries.positionFacets({ revisionId: params.docId })),
    ]);
    return result;
  },
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

type Filter = Exclude<PositionView, "all">;

const filterLabels: Record<Filter, string> = {
  active: "Все",
  attention: "Требуют внимания",
  check: "Не удалось определить",
  pending: "Не проверены",
  verified: "Проверены",
  excluded: "Исключены",
};

/** Строк списка за один запрос: остальные подгружаются при прокрутке (P3-3) */
const PAGE_SIZE = 100;

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

function ExtractionPage({ project, overview }: ProjectPageProps): React.JSX.Element {
  const { docId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();

  const card = useQuery(queries.document(docId));
  useExtractionJobsWatch([card.data?.job]);
  // Счётчики ревизии считает сервер; список позиций приходит страницами
  const facetsQuery = useQuery(queries.positionFacets({ revisionId: docId }));
  const facets = facetsQuery.data;
  const document = card.data?.document ?? null;
  const upload = card.data?.stage === null || !card.data ? undefined : { stage: card.data.stage };
  const sentAt = card.data?.handedOverAt ?? null;
  const sheets = useMemo(() => card.data?.sheets ?? [], [card.data]);
  const sheetCounts = useMemo(
    () =>
      new Map<string, SheetCounts>(
        (facets?.sheets ?? []).map((sheet) => [
          sheet.sheetId,
          { total: sheet.total, attention: sheet.attention },
        ]),
      ),
    [facets],
  );
  const totalPositions = facets?.views.all ?? 0;

  const [filter, setFilter] = useState<Filter>("active");
  const listQuery = useInfiniteQuery(
    queries.positionPages({ revisionId: docId, view: filter, limit: PAGE_SIZE }),
  );
  const list = useMemo(
    () => listQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [listQuery.data],
  );
  const listTotal = listQuery.data?.pages[0]?.total ?? 0;
  const counts: Record<Filter, number> = {
    active: facets?.views.active ?? 0,
    attention: facets?.views.attention ?? 0,
    check: facets?.views.check ?? 0,
    pending: facets?.views.pending ?? 0,
    verified: facets?.views.verified ?? 0,
    excluded: facets?.views.excluded ?? 0,
  };
  const findPosition = usePositionLookup();

  const screen = useScreenState({
    pending: card.isPending || facetsQuery.isPending || listQuery.isPending,
    error: card.isError || facetsQuery.isError || listQuery.isError,
    empty: false,
    filtered: false,
    partial: false,
  });

  const [activeId, setActiveId] = useState<string | null>(search.position ?? null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mergeSourceId, setMergeSourceId] = useState<string | null>(null);
  const [splitId, setSplitId] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  // Заведение позиции руками и загрузка спецификации (ADR-025)
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [currentSheetId, setCurrentSheetId] = useState<string | null>(null);
  const [mobilePanel, setMobilePanel] = useState<"tree" | "viewer" | "list">("list");

  const viewer = useRef<SheetViewerHandle>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Выбранная позиция может быть не в загруженных страницах (ссылка, клик по листу) — берём отдельно
  const listed = list.find((item) => item.id === activeId) ?? null;
  const activeQuery = useQuery({
    ...queries.position(activeId ?? ""),
    enabled: !!activeId && !listed,
  });
  const active = listed ?? activeQuery.data ?? null;
  const verifiedCount = counts.verified;
  const activeTotal = counts.active;
  const blocking = counts.check;
  const autoVerified = facets?.autoVerified ?? 0;

  // Пришли по ссылке на позицию: догружаем страницы, пока она не появится в списке
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = listQuery;
  useEffect(() => {
    if (search.position && activeId === search.position && !listed && hasNextPage) {
      if (!isFetchingNextPage) void fetchNextPage();
    }
    // list.length в зависимостях: быстрый ответ адаптера не меняет isFetchingNextPage между рендерами
  }, [
    search.position,
    activeId,
    listed,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    list.length,
  ]);

  // Конец списка виден — подгрузить следующую страницу
  // Элемент появляется только после загрузки экрана, поэтому ref через состояние, а не useRef
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinel;
    if (!el || !hasNextPage) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage) {
        void fetchNextPage();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [sentinel, hasNextPage, isFetchingNextPage, fetchNextPage, list.length]);

  // Первая позиция по умолчанию: пришли по ссылке — на неё, иначе первая в списке
  useEffect(() => {
    if (!activeId && list[0]) setActiveId(list[0].id);
  }, [activeId, list]);

  // Выбранная позиция: прокрутить список и лист к ней
  // Строки в списке может ещё не быть (позиция на незагруженной странице): список прокручиваем,
  // когда она появится, лист — сразу
  const scrolledFor = useRef<string | null>(null);
  const listScrolledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!active) return;
    if (listScrolledFor.current !== active.id) {
      const row = listRef.current?.querySelector(`[data-position-id="${CSS.escape(active.id)}"]`);
      if (row) {
        row.scrollIntoView({ block: "nearest" });
        listScrolledFor.current = active.id;
      }
    }
    if (scrolledFor.current === active.id) return;
    scrolledFor.current = active.id;
    viewer.current?.scrollToPosition(active);
  }, [active, list.length]);

  // Права (ADR-012): у роли с чтением документов строки без действий, клавиши только листают
  const access = useAccess();
  const canEdit = access.can("documents", "write");
  const canMaterials = access.can("materials");
  const mutations = usePositionMutations({
    onFailed: (error) =>
      toast.error("Изменение не сохранилось", {
        description: `${error.message} Список возвращён к прежнему виду.`,
      }),
    onNothingUndone: () =>
      toast("Отменить не получилось", {
        description: "Позицию уже изменили другим действием — проверьте её вручную.",
      }),
  });
  // Свежие значения для стабильных обработчиков строк
  const live = useRef({
    list,
    findPosition,
    mergeSourceId,
    mutations,
    listQuery,
    activeId,
    canEdit,
  });
  live.current = { list, findPosition, mergeSourceId, mutations, listQuery, activeId, canEdit };

  const moveBy = useCallback((delta: number) => {
    const { list: items, listQuery: pages, activeId: current } = live.current;
    if (!items.length) return;
    const index = items.findIndex((item) => item.id === current);
    // Дошли до конца загруженного — подгружаем следующую страницу, следующее нажатие перейдёт дальше
    if (delta > 0 && index === items.length - 1 && pages.hasNextPage) {
      if (!pages.isFetchingNextPage) void pages.fetchNextPage();
      return;
    }
    const next = items[Math.min(items.length - 1, Math.max(0, (index < 0 ? 0 : index) + delta))];
    if (next) setActiveId(next.id);
  }, []);

  /** После действия, убирающего строку из текущего фильтра, переходим к соседней. */
  const advanceFrom = useCallback((id: string) => {
    const { list: items } = live.current;
    const index = items.findIndex((item) => item.id === id);
    const next = items[index + 1] ?? items[index - 1];
    if (next) setActiveId(next.id);
  }, []);

  const onActivate = useCallback((id: string) => {
    const { mergeSourceId: source, findPosition: find, mutations: m } = live.current;
    if (source && source !== id) {
      const target = find(id);
      const sourceItem = find(source);
      if (!target || !sourceItem) return;
      // Объединять можно только с действующей позицией: исключённые, объединённые и заголовки не цели
      if (!isActivePosition(target)) {
        toast("С этой позицией объединить нельзя", {
          description:
            "Выберите действующую позицию — не исключённую, не объединённую и не заголовок.",
        });
        return;
      }
      setMergeSourceId(null);
      setActiveId(id);
      m.merge.mutate(
        { sourceId: source, targetId: id },
        {
          onSuccess: (summed) =>
            toastUndo(
              `Поз. ${sourceItem.position} объединена с поз. ${target.position}`,
              () => m.undoReview.mutate(undoInput([sourceItem], "merged")),
              summed
                ? "Количество сложено."
                : "Единицы разные — количество не сложено, проверьте вручную.",
            ),
        },
      );
      return;
    }
    setActiveId(id);
  }, []);

  const onAction = useCallback(
    (id: string, action: RowAction) => {
      const { findPosition: find, mutations: m, canEdit: editable } = live.current;
      const item = find(id);
      if (!item) return;
      if (!editable && action !== "source") return;
      setActiveId(id);
      // У недействующей строки (исключена, объединена, заголовок) есть только «Вернуть» и переход к листу:
      // клавиши E, X и Enter на ней ничего не делают
      if (!isActivePosition(item) && action !== "restore" && action !== "source") return;
      switch (action) {
        case "confirm":
          if (item.review !== "pending") return;
          m.confirm.mutate([id]);
          advanceFrom(id);
          return;
        case "edit":
          setEditingId(id);
          return;
        case "exclude":
          advanceFrom(id);
          // «Отменить» — только после ответа: сервер может отказать (позиция в закупке, есть присоединённые)
          m.exclude.mutate(id, {
            onSuccess: () =>
              toastUndo(`Поз. ${item.position} исключена`, () =>
                m.undoReview.mutate(undoInput([item], "excluded")),
              ),
          });
          return;
        case "header":
          m.markHeader.mutate(id, {
            onSuccess: () =>
              toastUndo(`Поз. ${item.position} отмечена как заголовок`, () =>
                m.undoReview.mutate(undoInput([item], "header")),
              ),
          });
          return;
        case "merge":
          setMergeSourceId(id);
          return;
        case "split":
          setSplitId(id);
          return;
        case "restore":
          m.reopen.mutate(id);
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
      live.current.mutations.correct.mutate(
        { id, ...patch },
        { onSuccess: () => toast.success("Позиция исправлена и подтверждена") },
      );
      setEditingId(null);
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

  const toHandOver = facets?.handOver.count ?? 0;
  const canSend = blocking === 0 && toHandOver > 0;
  const allHandedOver = verifiedCount > 0 && toHandOver === 0;
  const summary: SendSummary = {
    create: toHandOver,
    needNormalization: facets?.handOver.needNormalization ?? 0,
    unconfirmedMatch: facets?.handOver.unconfirmedMatch ?? 0,
    withoutCharacteristics: facets?.handOver.withoutCharacteristics ?? 0,
    region: overview?.region ?? "—",
    pendingLeft: counts.pending,
    excluded: counts.excluded,
  };

  function confirmAllVerified() {
    mutations.confirmAutoVerified.mutate(docId, {
      onSuccess: (ids) => {
        if (!ids.length) return;
        toastUndo(
          `Подтверждено ${fmtNum(ids.length)} позиций`,
          () => mutations.undoReview.mutate(undoConfirmInput(ids)),
          "Позиции со статусом «Проверено» отмечены как проверенные человеком.",
        );
      },
    });
  }

  function send() {
    setSendOpen(false);
    mutations.handOver.mutate(docId, {
      onSuccess: (count) =>
        toast.success(`В закупку переданы позиции: ${fmtNum(count)}`, {
          description: summary.unconfirmedMatch
            ? `Запрашивать цены можно по позициям с подтверждённым материалом. Ждут подтверждения сопоставления: ${fmtNum(summary.unconfirmedMatch)}.`
            : "По ним можно запрашивать цены у поставщиков.",
          action: {
            label: "Открыть материалы",
            onClick: () => navigate({ to: "/projects/$id/materials", params: { id: project.id } }),
          },
        }),
      onError: () => toast.error("Не удалось передать позиции в закупку"),
    });
  }

  // Клавиатура: j/k — навигация, Enter — подтвердить, e — исправить, x — исключить, Ctrl+Enter — в закупку
  const keyState = useRef({
    canSend,
    canEdit,
    activeId,
    editingId,
    splitId,
    sendOpen,
    mergeSourceId,
  });
  keyState.current = { canSend, canEdit, activeId, editingId, splitId, sendOpen, mergeSourceId };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keyState.current;
      if (k.sendOpen || k.splitId || k.editingId || isTyping(e.target)) return;
      if (document === null) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        if (!k.canEdit) return;
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
      } else if (!k.activeId || !k.canEdit) {
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

  // «Документ обрабатывается» — только там, где его действительно обрабатывают (ADR-023, поправка):
  // в рабочем контуре разбора нет, и это ожидание не кончилось бы никогда
  const processing =
    extractsDocuments() &&
    (screen === "processing" ||
      (totalPositions === 0 &&
        (document.status === "uploaded" ||
          document.status === "recognizing" ||
          (upload && upload.stage < 3))));
  const gated =
    screen === "loading" || screen === "error" || screen === "forbidden" || screen === "empty";
  const pct = activeTotal ? Math.round((verifiedCount / activeTotal) * 100) : 0;
  const splitItem = splitId ? findPosition(splitId) : null;
  const mergeSource = mergeSourceId ? findPosition(mergeSourceId) : null;

  return (
    <div className="main-bleed flex flex-col">
      <h1 className="sr-only">{document.title}</h1>
      {/* Главное действие экрана — в шапке контента: передать в закупку или перейти к материалам */}
      <PageActions>
        {activeTotal === 0 ? (
          // Таблиц спецификации в документе нет: вместо мёртвой кнопки — путь дальше
          <Button variant="accent" asChild>
            <Link to="/projects/$id/documents" params={{ id: project.id }}>
              К документации объекта <ArrowRight className="size-4" />
            </Link>
          </Button>
        ) : allHandedOver ? (
          canMaterials ? (
            <Button variant="accent" asChild>
              <Link to="/projects/$id/materials" params={{ id: project.id }}>
                Открыть материалы <ArrowRight className="size-4" />
              </Link>
            </Button>
          ) : (
            /*
             * Роли без доступа к материалам — ПТО — оставались без действия и без объяснения:
             * экран проверки заканчивался ничем, а справка обещала здесь «Передать в закупку»
             * (находка аудита соответствия). Говорим, что передавать нечего, и ведём дальше.
             */
            <Button variant="secondary" asChild>
              <Link to="/projects/$id/documents" params={{ id: project.id }}>
                Всё проверенное передано · к документации <ArrowRight className="size-4" />
              </Link>
            </Button>
          )
        ) : (
          canEdit && (
            // Недоступное действие объясняет причину и на мышке: раньше подсказка была только на телефоне
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    variant="accent"
                    data-tour="hand-over"
                    disabled={!canSend}
                    onClick={() => setSendOpen(true)}
                  >
                    <Send className="size-4" /> Передать в закупку
                    <span className="tnum font-semibold">{fmtNum(toHandOver)}</span>
                  </Button>
                </span>
              </TooltipTrigger>
              {!canSend && (
                <TooltipContent className="max-w-72">
                  {blocking > 0
                    ? `Осталось ${fmtNum(blocking)} ${blocking === 1 ? "позиция" : "позиции"} «Не удалось определить». Исправьте или исключите их.`
                    : "Нет проверенных позиций, которые ещё не переданы в закупку."}
                </TooltipContent>
              )}
            </Tooltip>
          )
        )}
      </PageActions>
      <PageCaption>
        <span className="truncate">
          {project.code} · {document.section} · {document.version} · {document.sheetCount} л. ·
          загружен {fmtDateTime(document.uploadedAt)}
        </span>
        <span aria-hidden className="text-text-3">
          ·
        </span>
        <span className="shrink-0">{docStatusLabel[document.status]}</span>
      </PageCaption>
      {/* Шапка документа на планшете и телефоне: там подписи в шапке контента нет */}
      <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-surface px-4 py-2 md:px-5 lg:hidden">
        <Link
          to="/projects/$id/documents"
          params={{ id: project.id }}
          aria-label="К документации"
          className="focus-ring grid size-11 shrink-0 place-items-center rounded-full text-text-secondary transition-fast hover:bg-hover hover:text-text-primary lg:size-8"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold" title={document.title}>
            {document.title}
          </p>
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
                "segment min-h-11 flex-1 items-center justify-center gap-1.5 text-[12px] lg:min-h-8",
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
            onRetry={() =>
              void Promise.all([card.refetch(), facetsQuery.refetch(), listQuery.refetch()])
            }
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
            <p className="px-3 pt-3 text-caption text-text-muted">Структура документа</p>
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
              revisionId={docId}
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
            ) : totalPositions === 0 && !extractsDocuments() ? (
              // Честный тупик вместо «таблиц не найдено»: никто не искал, разбор не подключён.
              // Но тупик с выходом: строки заводят руками или загружают из файла (ADR-025)
              <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                <FileSearch className="size-8 text-text-muted" strokeWidth={1.5} />
                <p className="text-[14px] font-medium">Позиций из этого файла нет</p>
                <p className="text-caption text-text-muted">{note("extraction")}</p>
                {canEdit && (
                  <div className="mt-1 grid w-full max-w-[280px] gap-2">
                    <Button variant="accent" onClick={() => setImportOpen(true)}>
                      <Upload className="size-4" /> Загрузить спецификацию из Excel
                    </Button>
                    <Button variant="secondary" onClick={() => setCreateOpen(true)}>
                      <Plus className="size-4" /> Завести позицию
                    </Button>
                  </div>
                )}
              </div>
            ) : totalPositions === 0 && document.positionsTotal ? (
              <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                <FileSearch className="size-8 text-text-muted" strokeWidth={1.5} />
                <p className="mt-3 text-[14px] font-medium">Позиции ревизии не загружены в демо</p>
                <p className="mt-1 text-caption text-text-muted">
                  Извлечено {fmtNum(document.positionsTotal)}, проверено{" "}
                  {fmtNum(document.positionsVerified ?? 0)}. В демо построчно загружена только
                  спецификация «Северной Короны».
                </p>
              </div>
            ) : totalPositions === 0 ? (
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
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={pct}
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
                  {/* Пометка под результатом разбора, а не только в шапке (ADR-018, п. 6):
                      человек смотрит на свои позиции из своего файла */}
                  <p data-demo-extraction className="mt-2 text-[12px] leading-[1.4] text-text-3">
                    {note("extraction")}
                  </p>
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-3 h-11 w-full lg:h-8"
                      disabled={autoVerified === 0}
                      onClick={confirmAllVerified}
                    >
                      <CheckCheck className="size-4" /> Подтвердить все проверенные
                      {autoVerified > 0 && (
                        <span className="tnum text-text-muted">{fmtNum(autoVerified)}</span>
                      )}
                    </Button>
                  )}
                  {/* Строку, которой в списке нет, надо чем-то добавить: разбор её не принесёт */}
                  {canEdit && (
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-11 flex-1 lg:h-8"
                        onClick={() => setCreateOpen(true)}
                      >
                        <Plus className="size-4" /> Позиция
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-11 flex-1 lg:h-8"
                        onClick={() => setImportOpen(true)}
                      >
                        <Upload className="size-4" /> Из Excel
                      </Button>
                    </div>
                  )}
                  <div className="-mx-1 mt-2 flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none]">
                    {(
                      [
                        "active",
                        "check",
                        "attention",
                        "pending",
                        "verified",
                        "excluded",
                      ] as Filter[]
                    ).map((key) => (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={filter === key}
                        onClick={() => setFilter(key)}
                        className={cn(
                          "focus-ring inline-flex h-11 shrink-0 items-center gap-1 rounded-full px-2.5 text-[12px] transition-fast lg:h-7",
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
                  <div className="flex shrink-0 items-center gap-2 border-b border-line-2 bg-surface-2 px-4 py-2 text-caption">
                    <span className="min-w-0 flex-1">
                      Выберите позицию, с которой объединить поз. <b>{mergeSource.position}</b>
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-11 px-2 lg:h-7"
                      onClick={() => setMergeSourceId(null)}
                    >
                      <X className="size-3.5" /> Отмена
                    </Button>
                  </div>
                )}

                <div
                  ref={listRef}
                  // Список, а не listbox: у строки есть свои кнопки, а навигация J/K — клавишами экрана
                  role="list"
                  data-tour="review-list"
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
                      onAction={() => setFilter("active")}
                    />
                  ) : (
                    <>
                      {list.map((item) => (
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
                          readOnly={!canEdit}
                        />
                      ))}
                      {hasNextPage && (
                        <div
                          ref={setSentinel}
                          className="px-4 py-3 text-center text-caption text-text-muted"
                        >
                          {isFetchingNextPage
                            ? "Загружаем позиции…"
                            : `Показано ${fmtNum(list.length)} из ${fmtNum(listTotal)}`}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="shrink-0 border-t border-border p-3">
                  {allHandedOver ? (
                    <div className="flex items-center justify-between gap-3 rounded-[var(--r-md)] bg-ok-bg px-3 py-2.5 text-[13px] text-ok">
                      <span>
                        Проверенные позиции переданы в закупку
                        {sentAt ? ` · ${fmtDateTime(sentAt)}` : ""}
                      </span>
                      {canMaterials && (
                        <Link
                          to="/projects/$id/materials"
                          params={{ id: project.id }}
                          className="inline-flex min-h-11 items-center font-medium underline-offset-2 hover:underline lg:min-h-0"
                        >
                          Открыть материалы
                        </Link>
                      )}
                    </div>
                  ) : (
                    canEdit && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="block md:hidden">
                            <Button
                              variant="accent"
                              className="w-full"
                              disabled={!canSend}
                              onClick={() => setSendOpen(true)}
                            >
                              <Send className="size-4" /> Передать проверенные позиции в закупку
                              <span className="tnum opacity-80">{fmtNum(toHandOver)}</span>
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
                    )
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

      {/* Подсказки клавиатуры: только когда есть к чему их применять (находка ревью LOW) */}
      <footer
        className={cn(
          "hidden h-9 shrink-0 items-center gap-5 border-t border-border bg-surface px-5 text-caption text-text-muted",
          activeTotal > 0 && "lg:flex",
        )}
      >
        {(canEdit
          ? [
              ["J", "K", "следующая и предыдущая"],
              ["Enter", "", "подтвердить"],
              ["E", "", "исправить"],
              ["X", "", "исключить"],
              ["Ctrl", "Enter", "передать в закупку"],
              ["Esc", "", "отменить объединение"],
            ]
          : [["J", "K", "следующая и предыдущая"]]
        ).map(([a, b, label]) => (
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

      {/* На телефоне главное действие закреплено снизу над панелью навигации */}
      {!gated && (allHandedOver ? canMaterials : canEdit) && (
        <MobileActionBar>
          {allHandedOver ? (
            <Button variant="accent" asChild>
              <Link to="/projects/$id/materials" params={{ id: project.id }}>
                Открыть материалы <ArrowRight className="size-4" />
              </Link>
            </Button>
          ) : (
            <Button
              variant="accent"
              data-tour="hand-over"
              disabled={!canSend}
              onClick={() => setSendOpen(true)}
            >
              <Send className="size-4" /> Передать в закупку
            </Button>
          )}
        </MobileActionBar>
      )}

      <SplitDialog
        item={splitItem}
        onOpenChange={(open) => !open && setSplitId(null)}
        onSplit={(id, qty) => {
          setSplitId(null);
          mutations.split.mutate(
            { id, firstQty: qty },
            { onSuccess: () => toast.success("Позиция разделена на две") },
          );
        }}
      />
      <SendDialog open={sendOpen} summary={summary} onOpenChange={setSendOpen} onConfirm={send} />
      <CreatePositionDialog open={createOpen} onOpenChange={setCreateOpen} revisionId={docId} />
      <ImportSpecDialog open={importOpen} onOpenChange={setImportOpen} revisionId={docId} />
    </div>
  );
}
