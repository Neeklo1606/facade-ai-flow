import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Янтарная точка у сомнительного поля (дизайн-система, раздел 9). Причина обязательна:
 * точка без причины не говорит человеку, что проверять, и правило «у каждого значения есть
 * источник» требует назвать основание сомнения словами.
 */
export function AttentionDot({ reason, className }: { reason: string; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={`Проверьте: ${reason}`}
          className={cn(
            "bg-warn inline-block size-2 shrink-0 cursor-help rounded-full align-middle",
            className,
          )}
        />
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}
