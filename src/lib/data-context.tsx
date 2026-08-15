import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { tasks as seedTasks, type Task, type TaskStatus } from "@/mock/tasks";
import { reports as seedReports, type ReportField, type SiteReport } from "@/mock/reports";
import { projects, type Project } from "@/mock/projects";

/**
 * Демо-хранилище прототипа: живет только в памяти (никакого localStorage и бэкенда).
 * Принятие отчета обновляет план-факт объекта — как будет в реальной системе.
 */
interface DataContextValue {
  tasks: Task[];
  reports: SiteReport[];
  acceptReport: (id: string) => void;
  returnReport: (id: string, comment: string) => void;
  updateReportFields: (id: string, fields: ReportField[]) => void;
  setTaskStatus: (id: string, status: TaskStatus) => void;
  toggleChecklist: (taskId: string, itemId: string) => void;
  addComment: (taskId: string, text: string, author: string) => void;
  createTask: (t: Omit<Task, "id" | "createdAt" | "source">) => Task;
  /** м², дополнительно принятые в этой сессии */
  acceptedArea: Record<string, number>;
  projectView: (p: Project) => Project;
  projectsView: Project[];
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>(seedTasks);
  const [reports, setReports] = useState<SiteReport[]>(seedReports);
  const [acceptedArea, setAcceptedArea] = useState<Record<string, number>>({});

  const acceptReport = useCallback((id: string) => {
    setReports((prev) => {
      const report = prev.find((r) => r.id === id);
      if (report && report.status !== "accepted") {
        const add = report.unit === "м²" ? report.volume : Math.round(report.volume * 0.6);
        setAcceptedArea((a) => ({ ...a, [report.projectId]: (a[report.projectId] ?? 0) + add }));
      }
      return prev.map((r) => {
        if (r.id !== id) return r;
        const { returnComment: _drop, ...rest } = r;
        return { ...rest, status: "accepted" as const };
      });
    });
  }, []);

  const returnReport = useCallback((id: string, comment: string) => {
    setReports((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: "returned" as const, returnComment: comment } : r)),
    );
  }, []);

  const updateReportFields = useCallback((id: string, fields: ReportField[]) => {
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, fields } : r)));
  }, []);

  const setTaskStatus = useCallback((id: string, status: TaskStatus) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
  }, []);

  const toggleChecklist = useCallback((taskId: string, itemId: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId && t.checklist
          ? {
              ...t,
              checklist: t.checklist.map((c) => (c.id === itemId ? { ...c, done: !c.done } : c)),
            }
          : t,
      ),
    );
  }, []);


  const addComment = useCallback((taskId: string, text: string, author: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              comments: [
                ...(t.comments ?? []),
                { id: `cm-${Date.now()}`, author, at: new Date().toISOString(), text },
              ],
            }
          : t,
      ),
    );
  }, []);

  const createTask = useCallback((draft: Omit<Task, "id" | "createdAt" | "source">) => {
    const task: Task = {
      ...draft,
      id: `T-${1100 + Math.floor(Math.random() * 800)}`,
      createdAt: new Date().toISOString().slice(0, 10),
      source: "manual",
    };
    setTasks((prev) => [task, ...prev]);
    return task;
  }, []);

  const projectView = useCallback(
    (p: Project): Project => {
      const extra = acceptedArea[p.id] ?? 0;
      if (!extra) return p;
      const areaDone = Math.min(p.areaTotal, p.areaDone + extra);
      return {
        ...p,
        areaDone,
        progress: Math.round((areaDone / p.areaTotal) * 100),
        planFactDeviation: Number((p.planFactDeviation + (extra / p.areaTotal) * 100).toFixed(1)),
      };
    },
    [acceptedArea],
  );

  const value = useMemo<DataContextValue>(
    () => ({
      tasks,
      reports,
      acceptReport,
      returnReport,
      updateReportFields,
      setTaskStatus,
      toggleChecklist,
      addComment,
      createTask,
      acceptedArea,
      projectView,
      projectsView: projects.map(projectView),
    }),
    [
      tasks,
      reports,
      acceptReport,
      returnReport,
      updateReportFields,
      setTaskStatus,
      toggleChecklist,
      addComment,
      createTask,
      acceptedArea,
      projectView,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
