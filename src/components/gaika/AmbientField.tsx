import { cn } from "@/lib/utils";

/**
 * Цветовое поле ГАЙКИ (дизайн-система, раздел 8). Верх экрана, уходит в фон к 45 процентам
 * высоты. Единственный большой градиент рабочего экрана, поэтому на экране оно одно.
 * Состояние меняет цвет: покой оранжевый, обработка песочная, успех зелёный, критичное красное.
 */
export type AmbientState = "rest" | "processing" | "success" | "critical";

const stateClass: Record<AmbientState, string> = {
  rest: "",
  processing: "ambient-field-processing",
  success: "ambient-field-success",
  critical: "ambient-field-critical",
};

export function AmbientField({
  state = "rest",
  className,
}: {
  state?: AmbientState;
  className?: string;
}) {
  return <div aria-hidden="true" className={cn("ambient-field", stateClass[state], className)} />;
}
