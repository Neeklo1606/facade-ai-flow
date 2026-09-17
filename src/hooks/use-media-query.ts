import { useEffect, useState } from "react";

/** Совпадение медиазапроса; до монтирования — значение по умолчанию (на сервере окна нет) */
export function useMediaQuery(query: string, fallback = true) {
  const [matches, setMatches] = useState(fallback);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}
