/**
 * Витрина токенов ADR-045 «Финальный интерфейс» (разделы 3.1-3.6) для приёмки владельцем:
 * шкала текста, отступы, радиусы, высоты, поверхности, статусы и движение. Собрана только
 * из утилит шкалы, без ручных размеров: витрина не расходится с тем, что видят экраны.
 * Числа рядом с образцом посчитаны браузером на текущей ширине.
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const TYPE = [
  { name: "text-title", use: "заголовок экрана, число карточки показателя", sample: "Проверка" },
  {
    name: "text-heading",
    use: "заголовок блока, шторки, название в строке",
    sample: "Требуют внимания",
  },
  {
    name: "text-body",
    use: "основной текст, значения, кнопки",
    sample: "Бригадир вносит время в MAX, менеджер проверяет.",
  },
  { name: "text-body-strong", use: "значение справа, активный сегмент", sample: "14 700 ₽" },
  {
    name: "text-meta",
    use: "пояснение, подпись поля, дата",
    sample: "Бригада 1 · 12:00-14:30 · 2,50 ч",
  },
  { name: "text-meta-strong", use: "метка, счётчик", sample: "Нет суммы" },
  { name: "text-tab", use: "подписи нижней панели и рельса", sample: "Проверка" },
  { name: "text-hero", use: "одно главное число экрана", sample: "1 618 632 ₽" },
  { name: "text-display", use: "стартовый экран и финал показа", sample: "Учёт выработки бригад" },
  { name: "text-table", use: "ячейки таблиц компьютера", sample: "44 847 ₽ · 6,58 ч · 6 812 ₽/ч" },
  {
    name: "text-transcript",
    use: "расшифровка речи",
    sample: "Стилобат, оси А-Р. Смонтировали 96 квадратов.",
  },
] as const;

const SPACE = [
  { token: "--space-gutter", use: "поле экрана", values: "16 · 24 · 32" },
  { token: "--space-block", use: "между блоками внутри раздела", values: "12 · 12 · 16" },
  { token: "--space-section", use: "между разделами с заголовком", values: "24 · 24 · 32" },
  { token: "--space-card", use: "внутри карточки", values: "16 · 16 · 20" },
  { token: "--space-row-y", use: "строка списка по вертикали", values: "12 · 12 · 8" },
  { token: "--space-row-x", use: "строка списка по горизонтали", values: "16 · 16 · 16" },
] as const;

const RADII = [
  { token: "--r-control", use: "кнопка, поле", value: "10" },
  { token: "--r-card", use: "карточка, группа строк, поиск", value: "12" },
  { token: "--r-bubble", use: "пузырь бота", value: "16" },
  { token: "--r-sheet", use: "шторка сверху", value: "16" },
  { token: "--r-pill", use: "метка, сегмент", value: "pill" },
] as const;

const HEIGHTS = [
  { token: "--h-header", use: "шапка телефона", value: "52" },
  { token: "--h-header-desk", use: "шапка компьютера", value: "56" },
  { token: "--h-tabbar", use: "нижняя панель", value: "56" },
  { token: "--h-action", use: "панель действий шторки", value: "64" },
  { token: "--h-row", use: "строка списка в две строки", value: "64" },
  { token: "--h-row-compact", use: "строка меню, «Ещё»", value: "52" },
  { token: "--h-control-lg", use: "главная кнопка, поле", value: "48" },
  { token: "--h-control", use: "кнопка, поиск", value: "44" },
  { token: "--h-show", use: "полоса показа", value: "44" },
  { token: "--h-segment", use: "сегмент", value: "36" },
  { token: "--h-chip", use: "метка", value: "24" },
] as const;

const STATUS = [
  { token: "--status-pending", word: "Ожидает проверки" },
  { token: "--status-ok", word: "Подтверждено" },
  { token: "--status-clarify", word: "Требует уточнения" },
  { token: "--status-rejected", word: "Отклонено" },
  { token: "--status-draft", word: "Черновик" },
] as const;

const MOTION = [
  { token: "--dur-press", use: "нажатие", value: "100 мс" },
  { token: "--dur-in", use: "появление", value: "150 мс" },
  { token: "--dur-sheet", use: "шторка", value: "250 мс" },
] as const;

/** Что сейчас даёт утилита: размер, строка и вес, посчитанные браузером */
function useComputed(ref: React.RefObject<HTMLElement | null>) {
  const [value, setValue] = useState("");
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const s = getComputedStyle(el);
      setValue(`${parseFloat(s.fontSize)}/${parseFloat(s.lineHeight) || "-"} · ${s.fontWeight}`);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [ref]);
  return value;
}

/** Значение CSS-переменной на текущей ширине */
function useVar(token: string) {
  const [value, setValue] = useState("");
  useEffect(() => {
    const update = () =>
      setValue(getComputedStyle(document.documentElement).getPropertyValue(token).trim());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [token]);
  return value;
}

function TypeRow({ name, use, sample }: { name: string; use: string; sample: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const computed = useComputed(ref);
  return (
    <li className="flex flex-col gap-1 py-row">
      <p ref={ref} className={cn(name, "min-w-0 truncate")}>
        {sample}
      </p>
      <p className="text-meta text-text-3">
        <span className="text-meta-strong text-text-2">{name}</span> · {use} ·{" "}
        <span className="tnum">{computed}</span>
      </p>
    </li>
  );
}

function SpaceRow({ token, use, values }: { token: string; use: string; values: string }) {
  const now = useVar(token);
  return (
    <li className="flex items-center gap-3 py-row">
      <span
        aria-hidden
        className="h-6 shrink-0 rounded-[var(--r-xs)] bg-orange-dim"
        style={{ width: `var(${token})` }}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-body-strong">{token}</span>
        <span className="block text-meta text-text-3">{use}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-body-strong tnum">{now}</span>
        <span className="block text-meta text-text-3 tnum">{values}</span>
      </span>
    </li>
  );
}

function Block({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="surface-1 p-card">
      <h2 className="text-heading">{title}</h2>
      {note ? <p className="mt-1 text-meta text-text-3">{note}</p> : null}
      <div className="mt-block">{children}</div>
    </section>
  );
}

export function ScaleGallery() {
  return (
    <div className="flex flex-col gap-section" data-testid="scale-gallery">
      <header>
        <p className="text-meta text-text-3">ADR-045 · финальный интерфейс · токены</p>
        <h2 className="text-title">Шкала и токены</h2>
        <p className="mt-1 text-body text-text-2">
          Одна шкала текста на все ширины: с шириной меняется плотность, а не размер шрифта. Отступы
          для телефона, планшета и компьютера через точку.
        </p>
      </header>

      <Block
        title="Типографика"
        note="Не больше трёх крупных чисел на экран, text-hero не больше одного"
      >
        <ul className="divide-y divide-line">
          {TYPE.map((row) => (
            <TypeRow key={row.name} {...row} />
          ))}
        </ul>
      </Block>

      <Block title="Отступы" note="Шаг 4: 4, 8, 12, 16, 20, 24, 32, 40, 48">
        <ul className="divide-y divide-line">
          {SPACE.map((row) => (
            <SpaceRow key={row.token} {...row} />
          ))}
        </ul>
      </Block>

      <Block title="Радиусы" note="Радиусы 20-32 на рабочих экранах не используются">
        <ul className="grid grid-cols-2 gap-block sm:grid-cols-5">
          {RADII.map((row) => (
            <li key={row.token} className="flex flex-col gap-1">
              <span
                aria-hidden
                className="h-16 w-full border border-line-2 bg-surface-2"
                style={{ borderRadius: `var(${row.token})` }}
              />
              <span className="text-meta-strong">
                {row.token} · {row.value}
              </span>
              <span className="text-meta text-text-3">{row.use}</span>
            </li>
          ))}
        </ul>
      </Block>

      <Block title="Высоты" note="Касание от 44, полевые действия от 48, голосовая кнопка от 56">
        <ul className="divide-y divide-line">
          {HEIGHTS.map((row) => (
            <li key={row.token} className="flex items-center gap-3 py-row">
              <span
                aria-hidden
                className="w-10 shrink-0 rounded-[var(--r-xs)] bg-surface-3"
                style={{ height: `var(${row.token})` }}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-body-strong">{row.token}</span>
                <span className="block text-meta text-text-3">{row.use}</span>
              </span>
              <span className="shrink-0 text-body-strong tnum">{row.value}</span>
            </li>
          ))}
        </ul>
      </Block>

      <Block
        title="Поверхности"
        note="Два уровня: фон и карточка с границей 1 px. Тень только у шторки, меню и тоста"
      >
        <div className="grid gap-block rounded-card bg-void p-card sm:grid-cols-3">
          <div className="p-card text-meta text-text-2">Уровень 0 · фон --bg</div>
          <div className="surface-1 p-card text-meta text-text-2">
            Уровень 1 · --surface и --line
          </div>
          <div className="rounded-card bg-surface p-card text-meta text-text-2 shadow-pop">
            --shadow-pop · шторка, меню, тост
          </div>
        </div>
      </Block>

      <Block title="Статусы" note="Точка 8 и слово. Сумма и доходность в цвет статуса не красятся">
        <ul className="flex flex-col gap-2">
          {STATUS.map((row) => (
            <li key={row.token} className="flex items-center gap-2 text-meta text-text-2">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ background: `var(${row.token})` }}
              />
              {row.word}
              <span className="text-text-3">· {row.token}</span>
            </li>
          ))}
        </ul>
      </Block>

      <Block
        title="Движение"
        note="Кривая ease-out. При prefers-reduced-motion только смена прозрачности"
      >
        <ul className="divide-y divide-line">
          {MOTION.map((row) => (
            <li key={row.token} className="flex items-center justify-between gap-3 py-row">
              <span>
                <span className="block text-body-strong">{row.token}</span>
                <span className="block text-meta text-text-3">{row.use}</span>
              </span>
              <span className="text-body-strong tnum">{row.value}</span>
            </li>
          ))}
        </ul>
      </Block>
    </div>
  );
}
