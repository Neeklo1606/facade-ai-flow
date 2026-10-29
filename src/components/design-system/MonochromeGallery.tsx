import { useEffect, useState } from "react";
import { Mic, Moon, RotateCcw, Square, Sun } from "lucide-react";
import { useCountUp } from "@/hooks/use-first-reveal";
import { applyTheme, writeChoice, type Theme } from "@/lib/theme";
import { CONTRAST_PAIRS, pairRatio, parseColor, type RGBA } from "@/lib/ui/contrast";
import { cn } from "@/lib/utils";

/**
 * Витрина «Монохрома» (ADR-055, разделы 2.2 и 2.3 документа Сервиса v1): палитра, пары
 * контраста, шкала двух плотностей, радиусы, тени и движение. Цвета только переменными:
 * значения живут в styles.css. Пары контраста те же, что проверяет scripts/check-contrast.ts,
 * отношения считаются по вычисленным значениям текущей темы.
 */

const SURFACES = ["canvas", "card", "panel-2", "panel-3", "line", "line-2", "inverse"];
const INKS = ["ink", "ink-2", "ink-3", "on-inverse", "field-line", "record"];
const STATUSES = ["up", "down", "caution", "note"];
const DATA = ["mint", "lavender", "periwinkle", "sky", "teal", "pink"];

const SCALE = [
  { cls: "type-screen", name: "Заголовок экрана", size: "44/48 · 30/36" },
  { cls: "type-kpi", name: "Показатель", size: "36/40 · 28/32" },
  { cls: "type-card", name: "Заголовок карточки", size: "18/24 · 17/22" },
  { cls: "type-text", name: "Текст", size: "15/22 · 16/24" },
  { cls: "type-label", name: "Подпись", size: "14/20 · 14/20" },
  { cls: "type-small", name: "Мелкий", size: "13/18 · 13/18" },
];

const RADII = [
  { cls: "rounded-surface", name: "Карточка 24 · телефон 20" },
  { cls: "rounded-inset", name: "Внутренний блок 16" },
  { cls: "rounded-tile", name: "Плитка 12" },
  { cls: "rounded-pill", name: "Таблетка 999" },
];

function Swatch({ name }: { name: string }) {
  return (
    <li className="flex items-center gap-3">
      <span
        aria-hidden
        className="size-10 shrink-0 rounded-tile border border-line"
        style={{ background: `var(--${name})` }}
      />
      <code className="type-small text-ink-2">--{name}</code>
    </li>
  );
}

function Card({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-surface bg-card p-card shadow-surface", className)}>
      <h3 className="type-card mb-4">{title}</h3>
      {children}
    </section>
  );
}

/** Текущая тема из атрибута и её смена: витрина показывает обе темы по очереди */
function useDocumentTheme(): Theme {
  const [theme, setTheme] = useState<Theme>("dark");
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setTheme(root.dataset["theme"] === "light" ? "light" : "dark");
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

function useContrastRows(theme: Theme) {
  const [rows, setRows] = useState<
    { key: string; label: string; ratio: number | null; min: number }[]
  >([]);
  useEffect(() => {
    const style = getComputedStyle(document.documentElement);
    const lookup = (name: string): RGBA => {
      const color = parseColor(style.getPropertyValue(`--${name}`));
      if (!color) throw new Error(name);
      return color;
    };
    setRows(
      CONTRAST_PAIRS.map((pair, i) => {
        let value: number | null = null;
        try {
          value = pairRatio(pair, lookup);
        } catch {
          value = null;
        }
        return {
          key: `${i}-${pair.fg}-${pair.bg}`,
          label: `${pair.what}: ${pair.fg} на ${pair.bg.replace("/", " поверх ")}`,
          ratio: value,
          min: pair.min,
        };
      }),
    );
  }, [theme]);
  return rows;
}

function Motion() {
  const [run, setRun] = useState(0);
  const value = useCountUp(1248, run > 0);
  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => setRun((n) => n + 1)}
        className="inline-flex min-h-11 w-fit items-center gap-2 rounded-pill border border-line-2 px-4 type-label focus-ring"
      >
        <RotateCcw className="size-4" aria-hidden />
        Показать ещё раз
      </button>
      <div key={run} className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cn("rounded-inset bg-panel-2 p-4 lift-hover", run > 0 && "reveal")}
            style={{ ["--reveal-index" as string]: i }}
          >
            <p className="type-label text-ink-2">Карточка {i + 1}</p>
            <p className="type-small text-ink-3">появление 240 мс, шаг 40</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-6">
        <div>
          <p className="type-label text-ink-2">Счёт числа, 600 мс</p>
          <p className="type-kpi tnum">{Math.round(value).toLocaleString("ru-RU")}</p>
        </div>
        <svg key={`l${run}`} viewBox="0 0 200 40" className="h-10 w-52 text-ink" aria-hidden>
          <path
            d="M0 32 L30 26 L60 30 L90 18 L120 22 L150 10 L200 6"
            pathLength={1}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className={run > 0 ? "draw-line" : undefined}
          />
        </svg>
      </div>
      <p className="type-small text-ink-3">
        С prefers-reduced-motion остаётся только прозрачность, линия и число сразу целиком.
      </p>
    </div>
  );
}

export function MonochromeGallery() {
  const theme = useDocumentTheme();
  const rows = useContrastRows(theme);
  const failed = rows.filter((r) => r.ratio === null || r.ratio < r.min).length;
  const setTheme = (next: Theme) => {
    writeChoice(next);
    applyTheme(next);
  };

  return (
    <div className="flex flex-col gap-section rounded-surface bg-canvas p-card">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Тема витрины">
        {(["light", "dark"] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={theme === t}
            onClick={() => setTheme(t)}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-pill px-4 type-label focus-ring",
              theme === t ? "bg-inverse text-on-inverse" : "bg-panel-2 text-ink",
            )}
          >
            {t === "light" ? (
              <Sun className="size-4" aria-hidden />
            ) : (
              <Moon className="size-4" aria-hidden />
            )}
            {t === "light" ? "Светлая" : "Тёмная"}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Поверхности">
          <ul className="flex flex-col gap-2">
            {SURFACES.map((n) => (
              <Swatch key={n} name={n} />
            ))}
          </ul>
        </Card>
        <Card title="Текст и запись">
          <ul className="flex flex-col gap-2">
            {INKS.map((n) => (
              <Swatch key={n} name={n} />
            ))}
          </ul>
        </Card>
        <Card title="Статусы и данные">
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((n) => (
              <span
                key={n}
                className="inline-flex h-7 items-center rounded-pill px-3 type-small"
                style={{ background: `var(--${n}-bg)`, color: `var(--${n})` }}
              >
                {n}
              </span>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {DATA.map((n) => (
              <span
                key={n}
                className="inline-flex h-7 items-center rounded-pill px-3 type-small"
                style={{ background: `var(--${n}-soft)`, color: `var(--${n})` }}
              >
                {n}
              </span>
            ))}
          </div>
        </Card>
      </div>

      <Card title={`Пары контраста: ${rows.length}, ниже порога ${failed}`}>
        <ul className="grid gap-x-6 gap-y-1 md:grid-cols-2" aria-label="Пары контраста">
          {rows.map((r) => (
            <li key={r.key} className="flex items-baseline justify-between gap-3 type-small">
              <span className="min-w-0 truncate text-ink-2">{r.label}</span>
              <span
                className={cn(
                  "shrink-0 tnum",
                  r.ratio === null || r.ratio < r.min ? "text-down" : "text-ink",
                )}
              >
                {r.ratio === null ? "—" : `${r.ratio.toFixed(2)}:1`} / {r.min}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Шкала: компьютер · телефон">
        <ul className="flex flex-col gap-4">
          {SCALE.map((s) => (
            <li key={s.cls} className="flex flex-col gap-1 border-b border-line pb-3">
              <span className="type-small text-ink-3">
                {s.name}, {s.size}, класс {s.cls}
              </span>
              <span className={s.cls}>Проверка 12 захваток, 1 284 ч</span>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Радиусы и тени">
          <div className="grid grid-cols-2 gap-4">
            {RADII.map((r) => (
              <div key={r.cls} className="flex flex-col gap-2">
                <div className={cn("h-16 border border-line-2 bg-panel-2", r.cls)} />
                <span className="type-small text-ink-3">{r.name}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4">
            <div className="rounded-inset bg-card p-4 shadow-surface lift-hover">
              <p className="type-label">Карточка</p>
              <p className="type-small text-ink-3">наведение: подъём 2 px</p>
            </div>
            <div className="rounded-inset bg-card p-4 shadow-floating">
              <p className="type-label">Всплывающее</p>
              <p className="type-small text-ink-3">меню, подсказка</p>
            </div>
          </div>
        </Card>
        <Card title="Инверсия и запись">
          <div className="flex flex-wrap items-center gap-4">
            <div className="rounded-surface bg-inverse p-card text-on-inverse">
              <p className="type-label opacity-80">Главный показатель</p>
              <p className="type-kpi">1 284 ч</p>
            </div>
            <span className="grid size-14 place-items-center rounded-full bg-pill text-pill-text">
              <Mic className="size-6" aria-hidden />
            </span>
            <span className="grid size-14 place-items-center rounded-full bg-record text-on-record glow-record">
              <Square className="size-5" aria-hidden />
            </span>
          </div>
          <p className="mt-3 type-small text-ink-3">
            Оранжевый только у записи голоса и знака на лендинге: правило check:typography.
          </p>
        </Card>
      </div>

      <Card title="Движение">
        <Motion />
      </Card>
    </div>
  );
}
