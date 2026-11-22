/**
 * Окна документов «как в 1С» (ADR-084). Запрос владельца 23.11.2026: «заполнение документов и
 * корректировка как в 1С: в окнах открываешь, корректируешь, удобно и просто».
 *
 * - Компьютер: окно поверх экрана, не модальное. Перетаскивается за заголовок, размер меняется
 *   за угол, сворачивается в полосу открытых окон внизу, разворачивается на всю рабочую область.
 *   Открыто может быть несколько, щелчок по окну поднимает его наверх.
 * - Телефон: окно на весь экран, без перетаскивания.
 * - Изменения копятся в окне до «Записать». Закрытие с незаписанным спрашивает, как в 1С:
 *   «Записать и закрыть», «Не записывать», «Отмена».
 * - Смена роли закрывает все окна: у другой роли другие права (GasShell даёт key по роли).
 */
import { Maximize2, Minimize2, Minus, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

export type WindowSpec = {
  /** Один документ открывается одним окном: повторное открытие поднимает его */
  id: string;
  title: string;
  render: () => ReactNode;
};

type Frame = WindowSpec & {
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  max: boolean;
  min: boolean;
};

type WindowsApi = {
  open: (spec: WindowSpec) => void;
  close: (id: string) => void;
  frames: readonly Frame[];
};

const WindowsContext = createContext<WindowsApi | null>(null);

export function useWindows(): WindowsApi {
  const api = useContext(WindowsContext);
  if (!api) throw new Error("useWindows вне WindowsProvider");
  return api;
}

/** Окна на этой ширине: на телефоне документ открывается страницей */
export function windowsEnabled(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
}

/* ---------------------------------------------------------------- Связь окна и содержимого */

type FrameApi = {
  /** Есть незаписанные изменения: заголовок со звёздочкой, закрытие спрашивает */
  setDirty: (dirty: boolean) => void;
  /** Как записать изменения окна: вызывает «Записать и закрыть» из вопроса при закрытии */
  setSave: (save: (() => Promise<boolean>) | null) => void;
  requestClose: () => void;
};

const FrameContext = createContext<FrameApi | null>(null);

export function useWindowFrame(): FrameApi | null {
  return useContext(FrameContext);
}

/* ---------------------------------------------------------------- Провайдер */

const TOP = 72;
const SIDE = 256;

export function WindowsProvider({ children }: { children: ReactNode }) {
  const [frames, setFrames] = useState<Frame[]>([]);
  const zTop = useRef(1);

  const raise = useCallback((id: string) => {
    zTop.current += 1;
    const z = zTop.current;
    setFrames((list) => list.map((f) => (f.id === id ? { ...f, z, min: false } : f)));
  }, []);

  const open = useCallback((spec: WindowSpec) => {
    setFrames((list) => {
      zTop.current += 1;
      const existing = list.find((f) => f.id === spec.id);
      if (existing)
        return list.map((f) =>
          f.id === spec.id ? { ...f, ...spec, z: zTop.current, min: false } : f,
        );
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = Math.min(960, vw - SIDE - 48);
      const h = Math.min(720, vh - TOP - 64);
      const step = (list.length % 6) * 28;
      return [
        ...list,
        {
          ...spec,
          x: Math.max(SIDE + 16, Math.round((vw - w) / 2) + step),
          y: TOP + 12 + step,
          w,
          h,
          z: zTop.current,
          max: false,
          min: false,
        },
      ];
    });
  }, []);

  const close = useCallback((id: string) => {
    setFrames((list) => list.filter((f) => f.id !== id));
  }, []);

  const patch = useCallback((id: string, next: Partial<Frame>) => {
    setFrames((list) => list.map((f) => (f.id === id ? { ...f, ...next } : f)));
  }, []);

  const api = useMemo(() => ({ open, close, frames }), [open, close, frames]);

  return (
    <WindowsContext.Provider value={api}>
      {children}
      {frames.length ? (
        <>
          <div className="gas-windows" aria-live="polite">
            {frames.map((frame) => (
              <WindowFrame
                key={frame.id}
                frame={frame}
                top={frame.z === zTop.current}
                onRaise={() => raise(frame.id)}
                onClose={() => close(frame.id)}
                onPatch={(next) => patch(frame.id, next)}
              />
            ))}
          </div>
          <WindowBar frames={frames} onPick={raise} />
        </>
      ) : null}
    </WindowsContext.Provider>
  );
}

/* ---------------------------------------------------------------- Окно */

function WindowFrame({
  frame,
  top,
  onRaise,
  onClose,
  onPatch,
}: {
  frame: Frame;
  top: boolean;
  onRaise: () => void;
  onClose: () => void;
  onPatch: (next: Partial<Frame>) => void;
}) {
  const [dirty, setDirty] = useState(false);
  const [asking, setAsking] = useState(false);
  const save = useRef<(() => Promise<boolean>) | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const titleId = `win-${frame.id}-title`;

  const requestClose = useCallback(() => {
    if (dirty) setAsking(true);
    else onClose();
  }, [dirty, onClose]);

  const frameApi = useMemo<FrameApi>(
    () => ({
      setDirty,
      setSave: (fn) => {
        save.current = fn;
      },
      requestClose,
    }),
    [requestClose],
  );

  // Новое окно получает фокус: клавиатура сразу внутри
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  const drag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (frame.max || event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    onRaise();
    const startX = event.clientX - frame.x;
    const startY = event.clientY - frame.y;
    const el = event.currentTarget;
    el.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent) => {
      const x = Math.min(Math.max(e.clientX - startX, 0), window.innerWidth - 160);
      const y = Math.min(Math.max(e.clientY - startY, TOP - 16), window.innerHeight - 48);
      onPatch({ x, y });
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  const resize = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (frame.max) return;
    event.preventDefault();
    const el = event.currentTarget;
    el.setPointerCapture(event.pointerId);
    const sx = event.clientX;
    const sy = event.clientY;
    const { w, h } = frame;
    const move = (e: PointerEvent) =>
      onPatch({
        w: Math.max(520, Math.min(w + e.clientX - sx, window.innerWidth - frame.x - 8)),
        h: Math.max(360, Math.min(h + e.clientY - sy, window.innerHeight - frame.y - 8)),
      });
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  const saveAndClose = async () => {
    const ok = save.current ? await save.current() : true;
    if (ok) onClose();
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-window={frame.id}
      data-top={top ? "" : undefined}
      data-max={frame.max ? "" : undefined}
      hidden={frame.min}
      className="gas-window focus-ring"
      style={
        frame.max
          ? { zIndex: 40 + frame.z }
          : { left: frame.x, top: frame.y, width: frame.w, height: frame.h, zIndex: 40 + frame.z }
      }
      onPointerDownCapture={top ? undefined : onRaise}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          if (asking) setAsking(false);
          else requestClose();
        }
      }}
    >
      <div
        className="gas-window-head"
        onPointerDown={drag}
        onDoubleClick={() => onPatch({ max: !frame.max })}
      >
        <p id={titleId} className="gas-window-title">
          {frame.title}
          {dirty ? (
            <span className="gas-window-dirty" title="Есть незаписанные изменения">
              {" "}
              *<span className="sr-only">, не записано</span>
            </span>
          ) : null}
        </p>
        <div className="gas-window-tools">
          <button
            type="button"
            className="gas-window-tool focus-ring max-lg:hidden"
            aria-label="Свернуть окно"
            onClick={() => onPatch({ min: true })}
          >
            <Minus className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            className="gas-window-tool focus-ring max-lg:hidden"
            aria-label={frame.max ? "Вернуть размер окна" : "Развернуть окно"}
            onClick={() => onPatch({ max: !frame.max })}
          >
            {frame.max ? (
              <Minimize2 className="size-4" aria-hidden />
            ) : (
              <Maximize2 className="size-4" aria-hidden />
            )}
          </button>
          <button
            type="button"
            className="gas-window-tool focus-ring"
            aria-label="Закрыть окно"
            onClick={requestClose}
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      </div>
      {asking ? (
        <div role="alertdialog" aria-label="Изменения не записаны" className="gas-window-ask">
          <p className="text-body-strong">Изменения не записаны. Записать?</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="mono-btn mono-btn-primary focus-ring"
              onClick={saveAndClose}
            >
              Записать и закрыть
            </button>
            <button
              type="button"
              className="mono-btn mono-btn-secondary focus-ring"
              onClick={onClose}
            >
              Не записывать
            </button>
            <button
              type="button"
              className="mono-btn mono-btn-quiet focus-ring"
              onClick={() => setAsking(false)}
            >
              Отмена
            </button>
          </div>
        </div>
      ) : null}
      <div className="gas-window-body">
        <FrameContext.Provider value={frameApi}>{frame.render()}</FrameContext.Provider>
      </div>
      {frame.max ? null : <span aria-hidden className="gas-window-grip" onPointerDown={resize} />}
    </div>
  );
}

/* ---------------------------------------------------------------- Полоса открытых окон */

function WindowBar({ frames, onPick }: { frames: readonly Frame[]; onPick: (id: string) => void }) {
  const top = Math.max(...frames.map((f) => f.z));
  return (
    <nav aria-label="Открытые окна" className="gas-window-bar max-lg:hidden">
      <ul className="flex min-w-0 gap-1">
        {frames.map((frame) => (
          <li key={frame.id} className="min-w-0">
            <button
              type="button"
              className={cn(
                "gas-window-chip focus-ring",
                frame.z === top && !frame.min && "is-top",
              )}
              aria-current={frame.z === top && !frame.min ? "true" : undefined}
              onClick={() => onPick(frame.id)}
            >
              <span className="truncate">{frame.title}</span>
              {frame.min ? <span className="sr-only"> (свёрнуто)</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
