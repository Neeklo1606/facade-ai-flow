import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Play } from "lucide-react";
import { HOME, type ReelId } from "@/lib/site/copy";
import { REEL_SECONDS } from "@/lib/site/reels.gen";
import { track } from "@/lib/site/analytics";
import { cn } from "@/lib/utils";
import { prefersReducedMotion } from "../motion";

/**
 * «Как ГАЙКА работает внутри» (ADR-083): айфон с записью экрана демо и пять сценариев.
 *
 * - Компьютер: сценарии столбиком, айфон закреплён справа. Прокрутка до сценария включает
 *   его ролик: следит IntersectionObserver по середине окна.
 * - Телефон: айфон закреплён под шапкой, сценарии прокручиваются под ним. Активный тот,
 *   что в нижней части окна, под айфоном. Порядок табуляции сверху вниз.
 * - Ролики (H.264, ~1 МБ) грузятся, только когда экран рядом, без звука, inline.
 *   reduced-motion: ролик не запускается сам, на экране постер и кнопка «Смотреть».
 * - Ролика нет (скрипт site:reels не записал) — сценарий без него, постер не ищется.
 */
const STEPS = HOME.inside.steps;
const hasReel = (id: ReelId) => Boolean(REEL_SECONDS[id]);

export function Inside() {
  const { inside } = HOME;
  const root = useRef<HTMLElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const videos = useRef<(HTMLVideoElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const [near, setNear] = useState(false);
  const [still, setStill] = useState(false);
  const [paused, setPaused] = useState(false);

  // Ролики грузятся, когда экран в 600 px от окна
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    setStill(prefersReducedMotion());
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Активный сценарий: на компьютере по середине окна, на телефоне под закреплённым айфоном
  useEffect(() => {
    const scroller = list.current;
    if (!scroller) return;
    const wide = window.matchMedia("(min-width: 1024px)").matches;
    const items = [...scroller.querySelectorAll<HTMLElement>("[data-step]")];
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((entry) => entry.isIntersecting);
        if (hit) setActive(Number((hit.target as HTMLElement).dataset["step"]));
      },
      { rootMargin: wide ? "-45% 0px -45% 0px" : "-72% 0px -22% 0px" },
    );
    items.forEach((item) => io.observe(item));
    return () => io.disconnect();
  }, []);

  // Играет только активный ролик; остальные стоят на начале
  useEffect(() => {
    videos.current.forEach((video, index) => {
      if (!video) return;
      if (index !== active || !near) {
        video.pause();
        return;
      }
      video.currentTime = 0;
      setPaused(still);
      if (!still) void video.play().catch(() => setPaused(true));
    });
    if (near) track("inside_step", { step: STEPS[active]!.id });
  }, [active, near, still]);

  const choose = (index: number) => {
    const item = list.current?.querySelector<HTMLElement>(`[data-step="${index}"]`);
    item?.scrollIntoView({
      block: window.matchMedia("(min-width: 1024px)").matches ? "center" : "end",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
    setActive(index);
  };

  const play = () => {
    const video = videos.current[active];
    if (!video) return;
    setPaused(false);
    void video.play().catch(() => setPaused(true));
  };

  return (
    <section ref={root} id="inside" aria-labelledby="inside-title" className="site-inside">
      <div className="site-wrap site-inside-grid">
        <header className="site-inside-head">
          <h2 id="inside-title" className="site-h2">
            {inside.title}
          </h2>
          <p className="site-body site-inside-lead">{inside.lead}</p>
        </header>

        <div className="site-inside-stage">
          <figure className="site-iphone" aria-label={inside.phone}>
            <div className="site-iphone-screen">
              <span aria-hidden className="site-iphone-island" />
              <span aria-hidden className="site-iphone-status tnum">
                9:41
              </span>
              {STEPS.map((step, index) =>
                hasReel(step.id) ? (
                  <video
                    key={step.id}
                    ref={(el) => {
                      videos.current[index] = el;
                    }}
                    className="site-iphone-video"
                    data-active={index === active ? "" : undefined}
                    data-reel={step.id}
                    poster={`/site/reels/${step.id}.webp`}
                    muted
                    playsInline
                    // src появляется, когда экран рядом: до этого ролик не качается
                    src={near ? `/site/reels/${step.id}.mp4` : undefined}
                    preload={near && index === active ? "auto" : "none"}
                    aria-hidden={index !== active}
                    loop
                  />
                ) : null,
              )}
              {paused ? (
                <button type="button" className="site-iphone-play" onClick={play}>
                  <Play className="size-5" aria-hidden />
                  Смотреть
                </button>
              ) : null}
            </div>
          </figure>
          <p className="site-caption site-inside-now" aria-live="polite">
            <span className="tnum">
              {active + 1} из {STEPS.length}
            </span>{" "}
            · {STEPS[active]!.title}
          </p>
        </div>

        <ol ref={list} className="site-inside-steps" aria-label="Сценарии">
          {STEPS.map((step, index) => (
            <li
              key={step.id}
              data-step={index}
              data-active={index === active ? "" : undefined}
              className="site-inside-step"
            >
              <button
                type="button"
                className="site-inside-step-hit"
                aria-current={index === active ? "step" : undefined}
                onClick={() => choose(index)}
              >
                <span aria-hidden className="site-inside-num tnum">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="site-h3 site-inside-step-title">{step.title}</span>
              </button>
              <p className="site-body site-inside-step-text">{step.text}</p>
              <p className="site-caption site-inside-step-meta">
                <span>{step.who}</span>
                {step.status ? <span className="site-inside-tag">{step.status}</span> : null}
              </p>
              <Link
                to={step.path}
                className={cn("site-inside-more focus-ring")}
                onClick={() => track("inside_more", { step: step.id })}
              >
                {inside.more}
                <span className="sr-only">: {step.title}</span>
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
