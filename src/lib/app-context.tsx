import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { currentUserId, setCurrentUserId } from "@/api/config";

/**
 * Выбранный объект переживает перезагрузку (находка ревью BLOCKER-1): он жил только в состоянии
 * React, и после F5 селектор возвращался к «Все объекты». Храним рядом с персоной — в пределах
 * вкладки (ADR-004): демонстрации в разных вкладках не мешают друг другу.
 */
const PROJECT_KEY = "neeklo-fieldops-project";

function restoreProjectId() {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(PROJECT_KEY);
  } catch {
    return null;
  }
}

function saveProjectId(id: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PROJECT_KEY, id);
  } catch {
    // Приватный режим браузера: выбор проживёт до перезагрузки
  }
}

/** Значение селектора объекта «Все объекты» */
export const ALL_PROJECTS = "all";

interface AppContextValue {
  theme: "light" | "dark";
  toggleTheme: () => void;
  /** Выбранный в шапке объект: id объекта или ALL_PROJECTS */
  projectId: string;
  setProjectId: (id: string) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (v: boolean) => void;
  commandOpen: boolean;
  setCommandOpen: (v: boolean) => void;
  /** Персона демонстрации: сотрудник, от имени которого работаем (ADR-008) */
  personaId: string;
  setPersonaId: (id: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

/** Состояние оболочки интерфейса: тема, выбранный объект, панели. Данные предметной области — не здесь. */
export function AppProvider({ children }: { children: ReactNode }) {
  // Светлая тема по умолчанию, переключатель в шапке действует во всей системе.
  const [theme, setTheme] = useState<"light" | "dark">("light");
  // Начальное значение одинаково на сервере и клиенте, восстановление — после гидратации,
  // иначе разметка сервера и первый рендер разошлись бы
  const [projectId, setProjectIdState] = useState<string>(ALL_PROJECTS);
  const setProjectId = useCallback((id: string) => {
    setProjectIdState(id);
    saveProjectId(id);
  }, []);

  useEffect(() => {
    const saved = restoreProjectId();
    if (saved) setProjectIdState(saved);
  }, []);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  // Персона живёт в модуле слоя данных: оттуда её берёт актор действий
  const [personaId, setPersona] = useState<string>(currentUserId);

  // На телефоне тема всегда светлая: экран читают на улице, при солнце
  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 1023px)");
    const apply = () =>
      document.documentElement.classList.toggle("dark", theme === "dark" && !mobile.matches);
    apply();
    mobile.addEventListener("change", apply);
    return () => mobile.removeEventListener("change", apply);
  }, [theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      theme,
      toggleTheme: () => setTheme((t) => (t === "light" ? "dark" : "light")),
      projectId,
      setProjectId,
      sidebarCollapsed,
      toggleSidebar: () => setSidebarCollapsed((v) => !v),
      mobileNavOpen,
      setMobileNavOpen,
      commandOpen,
      setCommandOpen,
      personaId,
      setPersonaId: (id: string) => {
        setCurrentUserId(id);
        setPersona(id);
      },
    }),
    [theme, projectId, setProjectId, sidebarCollapsed, mobileNavOpen, commandOpen, personaId],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
