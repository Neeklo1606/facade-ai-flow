import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { ChevronLeft, ChevronRight, Maximize2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confidenceLevel } from "@/components/common/ConfidenceIndicator";
import { fmtNum } from "@/lib/format";
import { cn } from "@/lib/utils";
import { type DocumentSheet, type ExtractedPosition, type ProjectDocument } from "@/contracts";
import { SHEET_TABLE } from "@/lib/sheet-geometry";
import { useQuery } from "@tanstack/react-query";
import { queries } from "@/api/queries";

/** Пропорции листа A4, книжная ориентация. */
const PAGE_RATIO = 297 / 210;
const PAGE_GAP = 24;
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export interface SheetViewerHandle {
  scrollToSheet: (sheetId: string) => void;
  scrollToPosition: (position: ExtractedPosition) => void;
}

interface Props {
  document: ProjectDocument;
  projectCode: string;
  sheets: DocumentSheet[];
  /** Ревизия: позиции листа загружаются, когда лист близко к видимой области */
  revisionId: string;
  activeId: string | null;
  /** Лист активной позиции: перерисовывается только он, а не весь документ */
  activeSheetId: string | null;
  onSelect: (id: string) => void;
  onSheetChange: (sheetId: string) => void;
}

/**
 * Просмотрщик листов документа. Лист отрисовывается из распознанной разметки:
 * таблица строк спецификации и штамп. Области строк совпадают с координатами извлечения,
 * поэтому выбранная позиция подсвечивается рамкой ровно там, где она стоит в оригинале.
 */
export const SheetViewer = forwardRef<SheetViewerHandle, Props>(function SheetViewer(
  { document, projectCode, sheets, revisionId, activeId, activeSheetId, onSelect, onSheetChange },
  ref,
) {
  const scroller = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(760);
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [current, setCurrent] = useState(0);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setContainerWidth(el.clientWidth));
    observer.observe(el);
    setContainerWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const fitWidth = Math.max(320, Math.min(containerWidth - 48, 980));
  const pageWidth = zoom === "fit" ? fitWidth : Math.round(760 * zoom);
  const pageHeight = Math.round(pageWidth * PAGE_RATIO);
  const pitch = pageHeight + PAGE_GAP;

  const scrollTo = useCallback(
    (top: number, smooth = true) =>
      scroller.current?.scrollTo({ top: Math.max(0, top), behavior: smooth ? "smooth" : "auto" }),
    [],
  );

  useImperativeHandle(
    ref,
    () => ({
      scrollToSheet: (sheetId) => {
        const index = sheets.findIndex((sheet) => sheet.id === sheetId);
        if (index >= 0) scrollTo(PAGE_GAP + index * pitch - 8);
      },
      scrollToPosition: (position) => {
        const index = sheets.findIndex((sheet) => sheet.id === position.sheetId);
        const el = scroller.current;
        if (index < 0 || !el) return;
        const regionTop = PAGE_GAP + index * pitch + position.region.y * pageHeight;
        const regionBottom = regionTop + position.region.h * pageHeight;
        // Не дёргаем страницу, если строка уже видна
        if (regionTop > el.scrollTop + 48 && regionBottom < el.scrollTop + el.clientHeight - 48)
          return;
        scrollTo(regionTop - el.clientHeight / 3);
      },
    }),
    [sheets, pitch, pageHeight, scrollTo],
  );

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onScroll = () => {
      const index = Math.min(
        sheets.length - 1,
        Math.max(0, Math.floor((el.scrollTop + el.clientHeight / 3) / pitch)),
      );
      setCurrent((prev) => (prev === index ? prev : index));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [pitch, sheets.length]);

  useEffect(() => {
    const sheet = sheets[current];
    if (sheet) onSheetChange(sheet.id);
  }, [current, sheets, onSheetChange]);

  const effectiveZoom = pageWidth / 760;
  const stepZoom = (dir: 1 | -1) => {
    const index = ZOOM_STEPS.findIndex((step) => step >= effectiveZoom - 0.01);
    const next =
      ZOOM_STEPS[
        Math.min(
          ZOOM_STEPS.length - 1,
          Math.max(0, (index < 0 ? ZOOM_STEPS.length - 1 : index) + dir),
        )
      ]!;
    setZoom(next);
  };
  const goPage = (index: number) => {
    const clamped = Math.min(sheets.length - 1, Math.max(0, index));
    scrollTo(PAGE_GAP + clamped * pitch - 8);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[color-mix(in_oklab,var(--bg-subtle)_70%,var(--bg-page))]">
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-3">
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            onClick={() => goPage(current - 1)}
            disabled={current === 0}
            aria-label="Предыдущий лист"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="tnum min-w-[112px] text-center text-caption text-text-secondary">
            Лист <b className="font-semibold text-text-primary">{sheets[current]?.number}</b> ·{" "}
            {current + 1} из {sheets.length}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            onClick={() => goPage(current + 1)}
            disabled={current >= sheets.length - 1}
            aria-label="Следующий лист"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <p className="hidden min-w-0 truncate text-caption text-text-muted xl:block">
          {document.fileName}
        </p>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            onClick={() => stepZoom(-1)}
            aria-label="Уменьшить"
          >
            <Minus className="size-4" />
          </Button>
          <span className="tnum w-11 text-center text-caption text-text-secondary">
            {Math.round(effectiveZoom * 100)}%
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            onClick={() => stepZoom(1)}
            aria-label="Увеличить"
          >
            <Plus className="size-4" />
          </Button>
          <Button
            size="sm"
            variant={zoom === "fit" ? "secondary" : "ghost"}
            className="h-8 px-2.5 text-caption"
            onClick={() => setZoom("fit")}
            aria-pressed={zoom === "fit"}
            aria-label="По ширине"
          >
            {/* На телефоне — только значок: подпись не помещалась в панель листа */}
            <Maximize2 className="size-3.5" /> <span className="hidden sm:inline">По ширине</span>
          </Button>
        </div>
      </div>

      {/* Лист прокручивается и с клавиатуры: область в порядке табуляции и подписана */}
      <div
        ref={scroller}
        className="focus-ring min-h-0 flex-1 overflow-auto"
        tabIndex={0}
        role="region"
        aria-label="Листы документа"
      >
        <div
          className="mx-auto flex flex-col items-center"
          style={{
            width: pageWidth + 48,
            paddingTop: PAGE_GAP,
            gap: PAGE_GAP,
            paddingBottom: PAGE_GAP,
          }}
        >
          {sheets.map((sheet, index) => (
            <Page
              key={sheet.id}
              sheet={sheet}
              index={index}
              total={sheets.length}
              document={document}
              projectCode={projectCode}
              width={pageWidth}
              height={pageHeight}
              revisionId={revisionId}
              activeId={sheet.id === activeSheetId ? activeId : null}
              onSelect={onSelect}
              visible={Math.abs(index - current) <= 2}
            />
          ))}
        </div>
      </div>
    </div>
  );
});

const Page = memo(function Page({
  sheet,
  index,
  total,
  document,
  projectCode,
  width,
  height,
  revisionId,
  activeId,
  onSelect,
  visible,
}: {
  sheet: DocumentSheet;
  index: number;
  total: number;
  document: ProjectDocument;
  projectCode: string;
  width: number;
  height: number;
  revisionId: string;
  activeId: string | null;
  onSelect: (id: string) => void;
  visible: boolean;
}) {
  const u = width / 100;
  // Все строки листа, включая исключённые: разметка повторяет оригинал документа
  const positions = useQuery({
    ...queries.positions({ revisionId, sheetId: sheet.id, view: "all", limit: 200 }),
    enabled: visible,
  }).data?.items;
  const active = positions?.find((item) => item.id === activeId) ?? null;

  return (
    <section
      aria-label={`Лист ${sheet.number}`}
      className="relative shrink-0 overflow-hidden bg-white text-[#1b1f23] shadow-[0_1px_3px_rgba(0,0,0,.12),0_8px_24px_rgba(0,0,0,.08)]"
      style={{ width, height, fontSize: u * 0.95 }}
    >
      {/* Рамка чертежа по ГОСТ: отступ слева под подшивку */}
      <div
        className="absolute border border-[#1b1f23]"
        style={{ left: u * 4, top: u * 1.5, right: u * 1.5, bottom: u * 1.5 }}
      />

      {visible && (
        <>
          <div
            className="absolute"
            style={{
              left: `${SHEET_TABLE.left * 100}%`,
              right: `${(1 - SHEET_TABLE.right) * 100}%`,
              top: u * 4,
            }}
          >
            <p style={{ fontSize: u * 1.9, fontWeight: 600, letterSpacing: "-0.01em" }}>
              {positions?.length ? "Спецификация материалов навесного фасада" : sheet.title}
            </p>
            <p style={{ fontSize: u * 1.1, color: "#5b646b", marginTop: u * 0.4 }}>
              {sheet.group} · {sheet.title}
            </p>
          </div>

          {positions?.length ? (
            <SpecTable
              positions={positions}
              width={width}
              height={height}
              u={u}
              activeId={activeId}
              onSelect={onSelect}
            />
          ) : (
            <DrawingPlaceholder u={u} />
          )}

          {/* Штамп */}
          <div
            className="absolute grid border-t border-l border-[#1b1f23]"
            style={{
              right: u * 1.5,
              bottom: u * 1.5,
              width: u * 44,
              height: u * 9,
              gridTemplateColumns: "1fr 1fr 18%",
              fontSize: u * 0.9,
            }}
          >
            <div className="col-span-2 border-r border-b border-[#1b1f23] px-[0.6em] py-[0.3em] font-semibold">
              {projectCode}-{document.section}
            </div>
            <div className="border-b border-[#1b1f23] px-[0.6em] py-[0.3em]">
              Лист <b>{sheet.number}</b>
            </div>
            <div className="col-span-2 border-r border-[#1b1f23] px-[0.6em] py-[0.3em] leading-tight">
              {document.title}
            </div>
            <div className="px-[0.6em] py-[0.3em] leading-tight">
              {document.version}
              <br />
              {index + 1}/{total}
            </div>
          </div>
        </>
      )}

      {active && (
        <div
          className="pointer-events-none absolute z-10 rounded-[2px] border-2 border-info bg-[color-mix(in_oklab,var(--info)_10%,transparent)] shadow-[0_0_0_4px_color-mix(in_oklab,var(--info)_18%,transparent)] transition-[top] duration-200"
          style={{
            left: active.region.x * width - 4,
            top: active.region.y * height - 2,
            width: active.region.w * width + 8,
            height: Math.max(active.region.h * height + 4, 12),
          }}
          aria-hidden
        />
      )}
    </section>
  );
});

function SpecTable({
  positions,
  width,
  height,
  u,
  activeId,
  onSelect,
}: {
  positions: ExtractedPosition[];
  width: number;
  height: number;
  u: number;
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const left = SHEET_TABLE.left * width;
  const tableWidth = (SHEET_TABLE.right - SHEET_TABLE.left) * width;
  const cols = "7% 58% 8% 11% 16%";
  const firstRow = positions[0]!;
  const rowH = firstRow.region.h * height;
  const textSize = Math.min(u * 0.95, rowH * 0.72);

  return (
    <>
      <div
        className="absolute grid border border-[#1b1f23] bg-[#f3f4f5] font-semibold"
        style={{
          left,
          width: tableWidth,
          top: SHEET_TABLE.top * height - u * 2.4,
          height: u * 2.4,
          gridTemplateColumns: cols,
          fontSize: u * 0.9,
        }}
      >
        {["Поз.", "Наименование и техническая характеристика", "Ед.", "Кол-во", "Примечание"].map(
          (label) => (
            <span
              key={label}
              className="flex items-center border-r border-[#1b1f23] px-[0.5em] last:border-r-0"
            >
              {label}
            </span>
          ),
        )}
      </div>
      {positions.map((item) => {
        const level = confidenceLevel(item.confidence);
        const dim = item.review === "excluded" || item.review === "merged";
        return (
          <button
            key={item.id}
            type="button"
            tabIndex={-1}
            onClick={() => onSelect(item.id)}
            className={cn(
              "absolute grid cursor-pointer items-center border-x border-b border-[#c9ced2] text-left hover:bg-[#fff4ec]",
              item.id === activeId && "bg-[#fff4ec]",
              item.review === "header" && "bg-[#f3f4f5] font-semibold",
              dim && "text-[#9aa2a8] line-through",
            )}
            style={{
              left,
              width: tableWidth,
              top: item.region.y * height,
              height: item.region.h * height,
              gridTemplateColumns: cols,
              fontSize: textSize,
              lineHeight: 1,
            }}
          >
            <span className="truncate px-[0.5em]">{item.position}</span>
            <span className="truncate px-[0.5em]">
              {item.projectName}
              {item.characteristics.length > 0 && (
                <span className="text-[#5b646b]">
                  {" "}
                  · {item.characteristics.map((c) => c.value).join(", ")}
                </span>
              )}
            </span>
            <span className="truncate px-[0.5em]">{item.unit}</span>
            <span
              className={cn(
                "truncate px-[0.5em] text-right tabular-nums",
                level === "low" && "font-[cursive] text-[#8a2f28] italic",
                level === "mid" && "text-[#6b5412]",
              )}
            >
              {level === "low" && item.qty === 0 ? "по месту" : fmtNum(item.qty)}
            </span>
            <span className="truncate px-[0.5em] text-[#5b646b]">
              {level === "low" ? "см. узел 6" : ""}
            </span>
          </button>
        );
      })}
    </>
  );
}

/** Лист без таблицы спецификации: схематичный фасад с осями. */
function DrawingPlaceholder({ u }: { u: number }) {
  return (
    <svg
      className="absolute"
      style={{ left: u * 8, top: u * 12, width: u * 84, height: u * 100 }}
      viewBox="0 0 84 100"
      aria-hidden
    >
      <g stroke="#1b1f23" strokeWidth="0.25" fill="none">
        <rect x="6" y="10" width="72" height="80" />
        {Array.from({ length: 9 }, (_, i) => (
          <line
            key={`v${i}`}
            x1={6 + i * 9}
            y1="10"
            x2={6 + i * 9}
            y2="90"
            strokeDasharray={i % 2 ? "1 1" : undefined}
          />
        ))}
        {Array.from({ length: 13 }, (_, i) => (
          <line key={`h${i}`} x1="6" y1={10 + i * 6.66} x2="78" y2={10 + i * 6.66} />
        ))}
        {Array.from({ length: 8 }, (_, col) =>
          Array.from({ length: 12 }, (_, row) => (
            <rect
              key={`w${col}-${row}`}
              x={8 + col * 9}
              y={12 + row * 6.66}
              width="5"
              height="3.5"
              strokeWidth="0.18"
            />
          )),
        )}
      </g>
      <g fontSize="2.2" fill="#1b1f23">
        {"АБВГДЕЖИК".split("").map((axis, i) => (
          <text key={axis} x={6 + i * 9} y="96" textAnchor="middle">
            {axis}
          </text>
        ))}
      </g>
    </svg>
  );
}
