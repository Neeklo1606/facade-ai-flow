import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { sites } from "@/mock/sites";
import { currentUser } from "@/mock/users";
import type { IndustryPack } from "@/types";

export const ALL_SITES = "all";

export const industryPacks: { id: IndustryPack; label: string; hint: string }[] = [
  { id: "facade", label: "Фасады", hint: "НВФ, захватки, объёмы" },
  { id: "road", label: "Дороги", hint: "Участки, слои, километраж" },
  { id: "hvac", label: "ОВК", hint: "Системы, узлы, пусконаладка" },
  { id: "crane", label: "Краны", hint: "Техника, ТО, осмотры" },
];

interface AppContextValue {
  theme: "light" | "dark";
  toggleTheme: () => void;
  pack: IndustryPack;
  setPack: (p: IndustryPack) => void;
  siteId: string;
  setSiteId: (id: string) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (v: boolean) => void;
  agentPanelOpen: boolean;
  setAgentPanelOpen: (v: boolean) => void;
  commandOpen: boolean;
  setCommandOpen: (v: boolean) => void;
  user: typeof currentUser;
  scopedSites: typeof sites;
}

const AppContext = createContext<AppContextValue | null>(null);

/** Глобальное состояние прототипа. Только React state, никаких браузерных хранилищ. */
export function AppProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [pack, setPack] = useState<IndustryPack>("facade");
  const [siteId, setSiteId] = useState<string>(ALL_SITES);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [agentPanelOpen, setAgentPanelOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
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
      pack,
      setPack,
      siteId,
      setSiteId,
      sidebarCollapsed,
      toggleSidebar: () => setSidebarCollapsed((v) => !v),
      mobileNavOpen,
      setMobileNavOpen,
      agentPanelOpen,
      setAgentPanelOpen,
      commandOpen,
      setCommandOpen,
      user: currentUser,
      scopedSites: siteId === ALL_SITES ? sites : sites.filter((s) => s.id === siteId),
    }),
    [theme, pack, siteId, sidebarCollapsed, mobileNavOpen, agentPanelOpen, commandOpen],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

/** Фильтр по выбранному объекту для любых записей с siteId. */
export function inScope<T extends { siteId: string | null }>(items: T[], siteId: string) {
  return siteId === ALL_SITES ? items : items.filter((i) => i.siteId === siteId);
}
