import { memo, useState, type FormEvent } from "react";
import { Ban, Check, Combine, FileText, Heading, Pencil, Split, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MatchLine } from "@/components/materials/MatchLine";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfidenceLabel, confidenceLevel } from "@/components/common/ConfidenceIndicator";
import { fmtNum } from "@/lib/format";
import { cn } from "@/lib/utils";
import { type Characteristic, type ExtractedPosition, positionReviewLabel } from "@/contracts";

export type RowAction =
  "confirm" | "edit" | "exclude" | "merge" | "split" | "header" | "restore" | "source";

interface Props {
  item: ExtractedPosition;
  active: boolean;
  editing: boolean;
  /** Идёт выбор позиции для объединения; эта строка может стать целью */
  mergeTarget: boolean;
  mergeSource: boolean;
  onActivate: (id: string) => void;
  onAction: (id: string, action: RowAction) => void;
  onSaveEdit: (
    id: string,
    patch: Pick<ExtractedPosition, "projectName" | "qty" | "unit" | "characteristics">,
  ) => void;
  onCancelEdit: () => void;
  /** Роль без права записи в документах (ADR-012): строку можно открыть, но не менять */
  readOnly?: boolean;
}

const reviewBadgeClass: Partial<Record<ExtractedPosition["review"], string>> = {
  confirmed: "bg-ok-bg text-ok",
  corrected: "bg-info-bg text-info",
  excluded: "bg-subtle text-text-muted",
  merged: "bg-subtle text-text-muted",
  header: "bg-subtle text-text-secondary",
};

/** Строка извлечённой позиции. Действия видны у активной строки и по наведению. */
export const PositionRow = memo(function PositionRow({
  item,
  active,
  editing,
  mergeTarget,
  mergeSource,
  onActivate,
  onAction,
  onSaveEdit,
  onCancelEdit,
  readOnly = false,
}: Props) {
  const level = confidenceLevel(item.confidence);
  const badgeClass = reviewBadgeClass[item.review];
  const badge = badgeClass
    ? { label: positionReviewLabel[item.review], className: badgeClass }
    : null;
  const inactive =
    item.review === "excluded" || item.review === "merged" || item.review === "header";
  const pending = item.review === "pending";

  return (
    <div
      data-position-id={item.id}
      role="listitem"
      aria-current={active ? "true" : undefined}
      onClick={() => onActivate(item.id)}
      className={cn(
        "group relative cursor-pointer border-b border-border px-4 py-2.5 transition-fast",
        active ? "bg-surface-2" : "hover:bg-hover",
        pending &&
          level === "low" &&
          !active &&
          "bg-[color-mix(in_oklab,var(--danger-bg)_55%,transparent)]",
        mergeTarget && "hover:outline-2 hover:-outline-offset-2 hover:outline-info",
        mergeSource && "outline-2 -outline-offset-2 outline-dashed outline-info",
      )}
    >
      {active && <span className="absolute inset-y-0 left-0 w-[3px] bg-text" aria-hidden />}

      <div className="flex items-center gap-2">
        <span className="mono w-10 shrink-0 text-[11px] text-text-muted">{item.position}</span>
        <ConfidenceLabel value={item.confidence} />
        {badge && (
          <span
            className={cn(
              "inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11px] font-medium",
              badge.className,
            )}
          >
            {(item.review === "confirmed" || item.review === "corrected") && (
              <Check className="size-3" />
            )}
            {badge.label}
          </span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAction(item.id, "source");
          }}
          title={`Показать на листе ${item.sheetNumber}`}
          className="focus-ring ml-auto inline-flex h-11 shrink-0 items-center gap-1 rounded-[var(--r-xs)] px-1.5 text-[11px] text-info transition-fast hover:bg-info-bg md:h-6"
        >
          <FileText className="size-3" strokeWidth={1.75} />
          <span className="tnum">л. {item.sheetNumber}</span>
        </button>
      </div>

      {editing ? (
        <EditForm
          item={item}
          onSave={(patch) => onSaveEdit(item.id, patch)}
          onCancel={onCancelEdit}
        />
      ) : (
        <>
          <div className="mt-1 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "text-[13px] leading-snug font-medium",
                  inactive && "text-text-muted line-through",
                  item.review === "header" && "font-semibold no-underline",
                )}
              >
                {item.projectName}
              </p>
              <p className={cn("mt-0.5 text-caption text-text-muted", !active && "truncate")}>
                {item.characteristics.length ? (
                  item.characteristics.map((c) => `${c.label}: ${c.value}`).join(" · ")
                ) : (
                  <span className="text-warn">Характеристики не указаны</span>
                )}
              </p>
              {/* Материал справочника: у активной строки — с подтверждением (ADR-014) */}
              {active && !inactive && (
                <MatchLine item={item} canEdit={!readOnly} className="mt-2" />
              )}
            </div>
            {item.review !== "header" && (
              <div className="shrink-0 text-right">
                <span
                  className={cn(
                    "tnum text-[14px] font-semibold",
                    level === "low" && pending && "text-danger",
                    inactive && "text-text-muted",
                  )}
                >
                  {item.qty === 0 ? "—" : fmtNum(item.qty)}
                </span>
                <span className="ml-1 text-caption text-text-secondary">{item.unit}</span>
              </div>
            )}
          </div>

          {/*
            Строка, заведённая человеком: места на листе у неё нет, и это видно сразу (ADR-025).
            Нулевая рамка — признак ввода руками: у разобранной строки есть место на чертеже.
          */}
          {item.note && !pending && item.region.w === 0 && item.region.h === 0 && (
            <p className="mt-1.5 rounded-[var(--r-xs)] bg-subtle px-2 py-1 text-caption text-text-secondary">
              {item.note}: места на листе нет
            </p>
          )}

          {item.note && pending && (
            <p
              className={cn(
                "mt-1.5 rounded-[var(--r-xs)] px-2 py-1 text-caption",
                level === "low" ? "bg-danger-bg text-danger" : "bg-warn-bg text-warn",
              )}
            >
              {item.note}
            </p>
          )}

          {active && !readOnly && (
            <div
              className="mt-2 flex flex-wrap items-center gap-1.5"
              onClick={(e) => e.stopPropagation()}
            >
              {inactive ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-11 px-2.5 text-[12px] lg:h-7"
                  onClick={() => onAction(item.id, "restore")}
                >
                  <Undo2 className="size-3.5" /> Вернуть
                </Button>
              ) : (
                <>
                  {pending && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-11 px-2.5 text-[12px] lg:h-7"
                      onClick={() => onAction(item.id, "confirm")}
                    >
                      <Check className="size-3.5" /> Подтвердить
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-11 px-2.5 text-[12px] lg:h-7"
                    onClick={() => onAction(item.id, "edit")}
                  >
                    <Pencil className="size-3.5" /> Исправить
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-11 px-2.5 text-[12px] lg:h-7"
                    onClick={() => onAction(item.id, "exclude")}
                  >
                    <Ban className="size-3.5" /> Исключить
                  </Button>
                  <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
                  {/* Значки переносятся группой: на узком экране одиночный значок на строке выглядел как буква */}
                  <span className="inline-flex items-center">
                    <IconAction
                      label="Объединить с другой позицией"
                      onClick={() => onAction(item.id, "merge")}
                    >
                      <Combine className="size-3.5" />
                    </IconAction>
                    <IconAction
                      label="Разделить на две позиции"
                      onClick={() => onAction(item.id, "split")}
                    >
                      <Split className="size-3.5" />
                    </IconAction>
                    <IconAction
                      label="Отметить как заголовок раздела"
                      onClick={() => onAction(item.id, "header")}
                    >
                      <Heading className="size-3.5" />
                    </IconAction>
                  </span>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
});

function IconAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="size-11 lg:size-7"
          onClick={onClick}
          aria-label={label}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function EditForm({
  item,
  onSave,
  onCancel,
}: {
  item: ExtractedPosition;
  onSave: (
    patch: Pick<ExtractedPosition, "projectName" | "qty" | "unit" | "characteristics">,
  ) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(item.projectName);
  const [qty, setQty] = useState(item.qty ? String(item.qty) : "");
  const [unit, setUnit] = useState(item.unit);
  const [chars, setChars] = useState(
    item.characteristics.map((c) => `${c.label}: ${c.value}`).join("; "),
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = Number(qty.replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    const characteristics: Characteristic[] = chars
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [label, ...rest] = part.split(":");
        return rest.length
          ? { label: label!.trim(), value: rest.join(":").trim() }
          : { label: "Примечание", value: part };
      });
    onSave({
      projectName: name.trim() || item.projectName,
      qty: parsed,
      unit: unit.trim() || item.unit,
      characteristics,
    });
  }

  return (
    <form
      onSubmit={submit}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      className="mt-2 grid gap-2"
    >
      <label className="grid gap-1 text-[11px] text-text-muted">
        Проектное наименование
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-[13px]" />
      </label>
      <label className="grid gap-1 text-[11px] text-text-muted">
        Характеристики, через точку с запятой
        <Input
          value={chars}
          onChange={(e) => setChars(e.target.value)}
          placeholder="Толщина: 2 мм; Покрытие: Zn 275"
          className="h-8 text-[13px]"
        />
      </label>
      <div className="grid grid-cols-[1fr_96px] gap-2">
        <label className="grid gap-1 text-[11px] text-text-muted">
          Количество
          <Input
            autoFocus
            inputMode="decimal"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            aria-invalid={!qty}
            className="tnum h-8 text-[13px]"
            placeholder={item.qty === 0 ? "в документе не указано" : undefined}
          />
        </label>
        <label className="grid gap-1 text-[11px] text-text-muted">
          Единица
          <Input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="h-8 text-[13px]"
          />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          className="h-11 px-2.5 text-[12px] lg:h-7"
        >
          <Check className="size-3.5" /> Сохранить и подтвердить
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-11 px-2.5 text-[12px] lg:h-7"
          onClick={onCancel}
        >
          Отмена
        </Button>
        <span className="ml-auto text-[11px] text-text-muted">Enter · Esc</span>
      </div>
    </form>
  );
}
