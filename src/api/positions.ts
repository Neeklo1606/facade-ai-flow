import { useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { ExtractedPosition } from "@/contracts";
import type { Page } from "@/ports";

/** Найти позицию в любом загруженном списке: страница, страницы подряд, карточка позиции */
export function findCachedPosition(queryClient: QueryClient, id: string) {
  for (const [, data] of queryClient.getQueriesData<unknown>({ queryKey: ["positions"] })) {
    if (!data || typeof data !== "object") continue;
    if ("pages" in data) {
      for (const page of (data as InfiniteData<Page<ExtractedPosition>>).pages) {
        const found = page.items.find((item) => item.id === id);
        if (found) return found;
      }
    } else if ("items" in data) {
      const found = (data as Page<ExtractedPosition>).items.find((item) => item.id === id);
      if (found) return found;
    } else if ("id" in data && (data as ExtractedPosition).id === id && "review" in data) {
      return data as ExtractedPosition;
    }
  }
  return null;
}

/** Поиск позиции по id среди загруженных: для действий со строкой и листа документа */
export function usePositionLookup() {
  const queryClient = useQueryClient();
  return useCallback((id: string) => findCachedPosition(queryClient, id), [queryClient]);
}
