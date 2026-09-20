import { useCallback, useSyncExternalStore } from "react";

/**
 * Совпадение медиазапроса. В браузере — сразу настоящее значение, с первого рендера: раньше
 * первым шло значение по умолчанию, и на ноутбуках 1024–1439 px боковая панель рисовалась
 * широкой и сжималась после монтирования — содержимое экрана прыгало (CLS 0,33 в Lighthouse).
 * На сервере окна нет — там значение по умолчанию.
 */
export function useMediaQuery(query: string, fallback = true) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => fallback,
  );
}
