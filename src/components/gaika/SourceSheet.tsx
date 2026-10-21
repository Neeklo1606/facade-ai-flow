import { BottomSheet } from "@/components/common/BottomSheet";
import { Marker } from "./Marker";

/**
 * Шторка источника (дизайн-система, раздел 9): фраза расшифровки, в которой выделен фрагмент,
 * откуда взято значение. Вместо строки «Показать источник» под каждым полем — касание значения.
 */
export function SourceSheet({
  open,
  onOpenChange,
  label,
  value,
  text,
  range,
  origin,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Что за значение: «Объём» */
  label: string;
  value: string;
  /** Полный текст расшифровки или сообщения */
  text: string;
  /** Где в тексте фраза-источник; null — фраза не нашлась, показывается текст целиком */
  range: { start: number; end: number } | null;
  /** Откуда текст: «Голосовое, 00:18» или «Текст» */
  origin: string;
}) {
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`${label}: ${value}`}
      description="Откуда взято значение"
    >
      <div className="flex flex-col gap-3 pb-2">
        <Marker>{origin}</Marker>
        <p
          className={`text-lead bg-surface-2 rounded-[var(--r-xl)] px-5 py-4 ${range ? "text-text-3" : "text-text-2"}`}
        >
          {range ? (
            <>
              {text.slice(0, range.start)}
              <mark className="bg-sand/25 text-text rounded-[6px] px-1 py-0.5 font-medium [box-decoration-break:clone]">
                {text.slice(range.start, range.end)}
              </mark>
              {text.slice(range.end)}
            </>
          ) : (
            text
          )}
        </p>
      </div>
    </BottomSheet>
  );
}
