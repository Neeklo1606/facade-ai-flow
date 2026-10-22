/**
 * Детали факта, как лист события в календаре референса: чип источника, крупный вид работ
 * по центру, главная цифра — объём, ниже строки с иконками в скруглённых плашках. Исходная
 * фраза стоит рядом с полями, которые из неё взяты. Решение — капсулой: на телефоне она
 * плавает у нижнего края листа, на десктопе стоит внизу панели.
 */
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  CalendarClock,
  Check,
  Image,
  MapPin,
  MessageSquareQuote,
  PencilLine,
  Undo2,
  UsersRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDirectory } from "@/api/directory";
import { fmtDate, fmtDateTime, fmtNum, plural } from "@/lib/format";
import { cn } from "@/lib/utils";
import { sourceMarker, sourceTone, type FactRow } from "./model";
import { useFactDecision } from "./use-decision";

export function FactDetail({
  row,
  layout,
  position,
  onClose,
}: {
  row: FactRow;
  layout: "sheet" | "panel";
  /** «2 из 5» — где карточка в очереди */
  position: string;
  onClose?: () => void;
}) {
  const { card, projectName, zoneName } = row;
  const { report, source, evidence } = card;
  const { employeeName } = useDirectory();
  const decision = useFactDecision(row, onClose);
  const tone = sourceTone(source);
  const sheet = layout === "sheet";
  const quote = source?.excerpt?.trim() || report.summary;

  const actions = decision.mayDecide ? (
    <div
      role="group"
      aria-label="Решение по факту"
      className={cn(
        "flex items-center gap-1.5",
        sheet ? "rounded-full bg-surface p-1.5 ring-1 ring-line-2" : "flex-wrap gap-2",
      )}
    >
      <Button
        variant="accent"
        className={cn(
          "text-body-strong h-14 min-w-0 flex-1 rounded-full font-semibold lg:h-11",
          !sheet && "basis-full",
        )}
        onClick={() => decision.accept()}
      >
        <Check className="size-5" /> Принять
        <span className="hidden tnum min-[400px]:inline">
          {fmtNum(report.declaredQty ?? 0)} {report.unit}
        </span>
      </Button>
      <Button
        variant="secondary"
        aria-label="Исправить объём"
        className="h-14 shrink-0 rounded-full px-4 lg:h-12"
        onClick={decision.openQty}
      >
        <PencilLine className="size-4" />
        <span className="hidden sm:inline">Исправить объём</span>
        <span className="sm:hidden">Объём</span>
      </Button>
      <Button
        variant="secondary"
        aria-label="Вернуть на уточнение"
        className="h-14 shrink-0 rounded-full px-4 lg:h-12"
        onClick={decision.back}
      >
        <Undo2 className="size-4" />
        <span>Вернуть</span>
      </Button>
    </div>
  ) : (
    <p className="text-meta px-2 text-center text-text-3">
      Решение принимают ПТО и руководитель проекта.
    </p>
  );

  return (
    <div className={cn("flex min-h-0 flex-col", !sheet && "h-full")}>
      {/* Панель прокручивается сама: с клавиатуры до неё тоже можно дойти (axe, правило прокрутки) */}
      <div
        {...(sheet ? {} : { tabIndex: 0, role: "region", "aria-label": "Детали факта" })}
        className={cn(
          "min-h-0 flex-1",
          sheet ? "px-4 pt-1" : "overflow-y-auto px-6 pt-6 pb-4 focus-ring",
        )}
        style={sheet ? { paddingBottom: "calc(env(safe-area-inset-bottom) + 112px)" } : undefined}
      >
        <div className="flex h-12 items-center justify-between gap-3">
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть"
              className="grid size-12 shrink-0 place-items-center rounded-full bg-surface-2 text-text focus-ring press is-hover:bg-surface-3"
            >
              <X className="size-5" aria-hidden />
            </button>
          ) : (
            <span />
          )}
          <span className="text-meta text-text-3 tnum">{position}</span>
        </div>

        <header className="mt-2 text-center">
          <span
            className={cn(
              "text-meta-strong inline-flex h-7 items-center rounded-full px-3 font-medium",
              tone.chip,
            )}
          >
            {source ? sourceMarker(source) : "Отчёт с площадки"}
          </span>
          <h2 id="fact-detail-title" className="text-title mx-auto mt-3 max-w-[22ch] text-balance">
            {report.workType}
          </h2>
          <p className="mt-4 flex items-baseline justify-center gap-2">
            <span className={cn("font-semibold tnum", sheet ? "text-hero" : "text-hero")}>
              {fmtNum(report.declaredQty ?? 0)}
            </span>
            <span className="text-heading text-text-2">{report.unit}</span>
          </p>
          <p className="text-body mt-1 text-text-3">заявлено с площадки</p>
        </header>

        <ul className="mt-6 flex flex-col gap-2">
          <DetailRow icon={MessageSquareQuote} label={source ? source.title : "Исходная фраза"}>
            <span className="text-body block text-text">«{quote}»</span>
            {source ? (
              <span className="text-meta mt-1 block text-text-3">
                {source.author} · {fmtDateTime(source.receivedAt)}
              </span>
            ) : null}
          </DetailRow>
          <DetailRow icon={MapPin} label="Где">
            {zoneName}
            <span className="text-body block text-text-2">{projectName}</span>
          </DetailRow>
          <DetailRow icon={CalendarClock} label="Смена">
            <span className="tnum">{fmtDate(report.date)}</span>
            {report.sentAt ? (
              <span className="text-body block text-text-2 tnum">
                отправлено {fmtDateTime(report.sentAt)}
              </span>
            ) : null}
          </DetailRow>
          <DetailRow icon={UsersRound} label="Кто сдал">
            {employeeName(report.authorId)}
            {report.headcount > 0 ? (
              <span className="text-body block text-text-2 tnum">
                в бригаде {fmtNum(report.headcount)}{" "}
                {plural(report.headcount, "человек", "человека", "человек")}
              </span>
            ) : null}
          </DetailRow>
          {evidence.length > 0 ? (
            <DetailRow icon={Image} label="Материалы">
              <span className="tnum">
                {fmtNum(evidence.length)} {plural(evidence.length, "фото", "фото", "фото")}
              </span>
              <span className="text-body block text-text-2">
                {evidence
                  .slice(0, 3)
                  .map((item) => item.caption)
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </DetailRow>
          ) : null}
        </ul>
      </div>

      {sheet ? (
        <Floating>{actions}</Floating>
      ) : (
        <div className="shrink-0 border-t border-line bg-surface px-5 pt-4 pb-5">{actions}</div>
      )}
      {decision.qtySheet}
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof MapPin;
  label: string;
  children: ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 rounded-[20px] bg-surface-2 px-3.5 py-3.5">
      <span className="grid size-10 shrink-0 place-items-center rounded-[14px] bg-surface text-text-2">
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 pt-0.5">
        <span className="text-meta block text-text-3">{label}</span>
        <span className="text-body mt-1 block text-text">{children}</span>
      </span>
    </li>
  );
}

/**
 * Плавающая капсула решения у нижнего края листа. Рисуется в body: у листа есть сдвиг
 * пальцем, и `fixed` внутри него считался бы от листа, а не от экрана.
 */
function Floating({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      data-check-floating
      className="fixed inset-x-3 z-[36] mx-auto max-w-[560px] animate-in fade-in-0 slide-in-from-bottom-4 duration-300"
      style={{ bottom: "calc(max(12px, env(safe-area-inset-bottom)) + 4px)" }}
    >
      {children}
    </div>,
    document.body,
  );
}
