/** Цвет сведений о записи по типу (ADR-061, 10): ошибка данных, подозрение, финансы */
import type { InfoKind } from "@/api/gas-ops";
import type { ChipTone } from "@/components/ui/kit/status";

/** Цвет по типу: ошибка данных красная, подозрение янтарное, финансы серые */
export const KIND_TONE: Record<InfoKind, ChipTone> = {
  error: "block",
  suspicion: "decide",
  finance: "info",
};

export const KIND_DOT: Record<InfoKind, string> = {
  error: "bg-danger",
  suspicion: "bg-warn",
  finance: "bg-text-3",
};
