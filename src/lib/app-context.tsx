import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/** Значение селектора объекта «Все объекты» */
export const ALL_PROJECTS = "all";

/** Сотрудник, от имени которого работает демо. В фазе 4 приходит из сессии (P4-2). */
export const CURRENT_USER_ID = "e-sokolov";

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
}

const AppContext = createContext<AppContextValue | null>(null);

/** Состояние оболочки интерфейса: тема, выбранный объект, панели. Данные предметной области — не здесь. */
export function AppProvider({ children }: { children: ReactNode }) {
  // Светлая тема по умолчанию, переключатель в шапке действует во всей системе.
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [projectId, setProjectId] = useState<string>(ALL_PROJECTS);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

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
    }),
    [theme, projectId, sidebarCollapsed, mobileNavOpen, commandOpen],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
