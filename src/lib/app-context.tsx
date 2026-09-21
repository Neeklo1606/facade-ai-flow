import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  applyTheme,
  defaultChoice,
  readChoice,
  resolveTheme,
  systemTheme,
  writeChoice,
  type ThemeChoice,
} from "@/lib/theme";
import { api } from "@/api/client";
import {
  DEMO_PERSONAS,
  currentUserId,
  dataSource,
  adoptPersona,
  hasChosenPersona,
  setCurrentUserId,
} from "@/api/config";

const isPersona = (id: string): id is (typeof DEMO_PERSONAS)[number] =>
  (DEMO_PERSONAS as readonly string[]).includes(id);

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
  /** Выбор пользователя из трёх положений; применённая тема — в `data-theme` на <html> */
  themeChoice: ThemeChoice;
  setThemeChoice: (choice: ThemeChoice) => void;
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
  /** Войти за персону: в рабочем режиме — подписанная сессия сервера (ADR-012) */
  setPersonaId: (id: string) => Promise<void>;
  /**
   * Идёт вход за другую персону: экраны не монтируются, пока сессия не сменилась, — иначе
   * экран прежней роли запросил бы данные уже с новой сессией и получил 403
   */
  personaSwitching: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

/** Состояние оболочки интерфейса: тема, выбранный объект, панели. Данные предметной области — не здесь. */
export function AppProvider({
  children,
  initialPersona = null,
}: {
  children: ReactNode;
  /** Сотрудник сессии сервера (рабочий режим); в демо — null, персона берётся из вкладки */
  initialPersona?: string | null;
}) {
  // Умолчание контура; выбор пользователя поднимается из браузера после гидратации (ADR-017)
  const [themeChoice, setChoice] = useState<ThemeChoice>(defaultChoice);
  const [themeReady, setThemeReady] = useState(false);
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
  // Рабочий режим: первый рендер — за сотрудника сессии, как на сервере (ADR-012)
  const [personaId, setPersona] = useState<string>(() => initialPersona ?? currentUserId());
  const queryClient = useQueryClient();
  const [personaSwitching, setPersonaSwitching] = useState(false);

  const setPersonaId = useCallback(async (id: string) => {
    if (!isPersona(id)) return;
    setPersonaSwitching(true);
    try {
      await api.signIn(id);
      setCurrentUserId(id);
      setPersona(id);
    } finally {
      setPersonaSwitching(false);
    }
  }, []);

  // У роли другой набор данных (реестр прораба — только его объекты): кэш прежней роли сбрасывается.
  // После отрисовки новой роли, а не сразу: иначе перезапросились бы данные экранов прежней роли,
  // ещё смонтированных, и новая сессия получила бы на них 403
  const shownPersona = useRef(personaId);
  useEffect(() => {
    if (shownPersona.current === personaId) return;
    shownPersona.current = personaId;
    void queryClient.resetQueries();
  }, [personaId, queryClient]);

  // Рабочий режим (ADR-012, уточнение п. 4): персона, выбранная во вкладке, главнее — вкладка
  // входит за неё; вкладка без выбора принимает сессию браузера
  useEffect(() => {
    if (dataSource !== "server") return;
    const tab = hasChosenPersona() ? currentUserId() : null;
    if (tab && tab !== initialPersona && isPersona(tab)) {
      setPersonaSwitching(true);
      void api
        .signIn(tab)
        .then(() => setPersona(tab))
        .finally(() => setPersonaSwitching(false));
      return;
    }
    if (initialPersona) adoptPersona(initialPersona);
  }, [initialPersona]);

  useEffect(() => {
    setChoice(readChoice());
    setThemeReady(true);
  }, []);

  // До гидратации тему уже поставил скрипт в <head>: раньше времени её трогать нечем и незачем
  useEffect(() => {
    if (!themeReady) return;
    applyTheme(resolveTheme(themeChoice));
    if (themeChoice !== "system") return;
    const system = window.matchMedia("(prefers-color-scheme: light)");
    const follow = () => applyTheme(systemTheme());
    system.addEventListener("change", follow);
    return () => system.removeEventListener("change", follow);
  }, [themeChoice, themeReady]);

  const setThemeChoice = useCallback((choice: ThemeChoice) => {
    writeChoice(choice);
    setChoice(choice);
  }, []);

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
      themeChoice,
      setThemeChoice,
      projectId,
      setProjectId,
      sidebarCollapsed,
      toggleSidebar: () => setSidebarCollapsed((v) => !v),
      mobileNavOpen,
      setMobileNavOpen,
      commandOpen,
      setCommandOpen,
      personaId,
      setPersonaId,
      personaSwitching,
    }),
    [
      themeChoice,
      setThemeChoice,
      projectId,
      setProjectId,
      sidebarCollapsed,
      mobileNavOpen,
      commandOpen,
      personaId,
      setPersonaId,
      personaSwitching,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
