import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Расшифровка по словам (D1, п. 4): слова проявляются по таймингам, ускоренно, за 1,5–2,5 с.
 * «Показать сразу» открывает всё. Расписание считает слой данных, компонент только идёт по нему.
 */
export function TranscriptReveal({
  words,
  schedule,
  instant,
  onDone,
  className,
}: {
  words: string[];
  /** Момент появления каждого слова от начала показа, мс */
  schedule: number[];
  /** Показать всё сразу: по кнопке или при reduced-motion */
  instant: boolean;
  onDone: () => void;
  className?: string;
}) {
  const [shown, setShown] = useState(instant ? words.length : 0);

  useEffect(() => {
    if (instant) {
      setShown(words.length);
      return;
    }
    const started = performance.now();
    let frame = 0;
    const step = () => {
      const elapsed = performance.now() - started;
      let count = 0;
      for (const at of schedule) if (at <= elapsed) count++;
      setShown(count);
      if (count < words.length) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [instant, schedule, words.length]);

  useEffect(() => {
    if (shown >= words.length && words.length > 0) {
      // Последнее слово успевает прочитаться, прежде чем экран пойдёт дальше
      const timer = setTimeout(onDone, instant ? 0 : 450);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [shown, words.length, onDone, instant]);

  return (
    <p className={cn("text-lead text-text", className)}>
      {words.map((word, index) => (
        <span
          key={`${word}-${index}`}
          className={cn(
            "transition-opacity duration-200",
            // Ещё не прозвучавшее слово еле видно: двухтоновая строка, как в референсах v3
            index < shown ? "opacity-100" : "opacity-[0.14]",
          )}
        >
          {word}{" "}
        </span>
      ))}
    </p>
  );
}
