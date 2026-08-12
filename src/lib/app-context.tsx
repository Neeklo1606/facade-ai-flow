import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { projects } from "@/mock/projects";
import { currentUser } from "@/mock/users";

export type Theme = "light" | "dark";
export const ALL_PROJECTS = "all";

interface AppContextValue {
  theme: Theme;
  toggleTheme: () => void;
  projectId: string;
  setProjectId: (id: string) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  agentPanelOpen: boolean;
  setAgentPanelOpen: (v: boolean) => void;
  user: typeof currentUser;
  scopedProjects: typeof projects;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [projectId, setProjectId] = useState<string>(ALL_PROJECTS);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [agentPanelOpen, setAgentPanelOpen] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const value = useMemo<AppContextValue>(
    () => ({
      theme,
      toggleTheme: () => setTheme((t) => (t === "light" ? "dark" : "light")),
      projectId,
      setProjectId,
      sidebarCollapsed,
      toggleSidebar: () => setSidebarCollapsed((v) => !v),
      agentPanelOpen,
      setAgentPanelOpen,
      user: currentUser,
      scopedProjects: projectId === ALL_PROJECTS ? projects : projects.filter((p) => p.id === projectId),
    }),
    [theme, projectId, sidebarCollapsed, agentPanelOpen],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

export function inScope<T extends { projectId: string }>(items: T[], projectId: string) {
  return projectId === ALL_PROJECTS ? items : items.filter((i) => i.projectId === projectId);
}
