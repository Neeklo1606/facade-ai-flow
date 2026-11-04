import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGasActor } from "@/api/gas-ops";
import { useGasEstimateActions, useGasReviewPolicy } from "@/api/gas-estimates";
import { toast } from "@/lib/toast";

/**
 * Плашка на «Проверке» (финальный промт, 1.2): после двух недель «Проверять все» и точности
 * от 95% за 50 решений система предлагает принимать записи без замечаний сама. Включает
 * менеджер, «Не сейчас» прячет плашку в этой вкладке.
 */
export function ModeSuggestion() {
  const policy = useGasReviewPolicy();
  const actions = useGasEstimateActions();
  const actor = useGasActor();
  const [hidden, setHidden] = useState(false);
  const suggestion = policy.suggestion;
  if (hidden || !suggestion) return null;
  if (actor.role !== "manager" && actor.role !== "admin") return null;

  const enable = async () => {
    const result = await actions.setReviewSettings({
      mode: "flagged",
      thresholdPercent: policy.settings.thresholdPercent,
    });
    if (result.ok) toast.success("Записи без замечаний теперь принимаются сами");
    else toast.error(result.message);
  };

  return (
    <section
      aria-label="Предложение режима проверки"
      data-testid="mode-suggestion"
      className="surface-1 mb-3 flex flex-col gap-3 p-4 md:flex-row md:items-center"
    >
      <p className="flex min-w-0 flex-1 items-start gap-2 text-body">
        <Sparkles className="mt-0.5 size-5 shrink-0 text-orange" aria-hidden />
        <span>
          Точность {suggestion.percent}% за последние {suggestion.decided} решений. Можно проверять
          только записи с замечаниями: остальные примутся сами с меткой «принята автоматически»,
          вернуть любую можно до закрытия недели.
        </span>
      </p>
      <div className="flex shrink-0 gap-2">
        <Button onClick={() => void enable()} className="max-md:h-12 max-md:flex-1">
          Включить
        </Button>
        <Button
          variant="outline"
          onClick={() => setHidden(true)}
          className="max-md:h-12 max-md:flex-1"
        >
          Не сейчас
        </Button>
      </div>
    </section>
  );
}
