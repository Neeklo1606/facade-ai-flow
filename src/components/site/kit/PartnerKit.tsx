import { useEffect, useId, useRef, useState } from "react";
import { Check, Copy, Download, Share2 } from "lucide-react";
import { PUBLIC_URL } from "@/lib/site/config";
import { KIT, LANDING } from "@/lib/site/copy";
import { track } from "@/lib/site/analytics";
import { cleanPartnerCode, partnerLink } from "@/lib/site/partner";
import { drawQr } from "@/lib/site/qr";
import { cn } from "@/lib/utils";

/**
 * Набор партнёра (ADR-051, 01_SPEC 10.3): код партнёра в поле вверху (localStorage),
 * ссылки с ?src=, «Скопировать», «Поделиться» (Web Share, без него кнопки нет), QR
 * и «Скачать PNG», сценарий показа, ответы на вопросы, первое сообщение.
 */
const CODE_KEY = "gaika-kit-code";

function readCode(): string {
  try {
    return window.localStorage.getItem(CODE_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveCode(code: string) {
  try {
    window.localStorage.setItem(CODE_KEY, code);
  } catch {
    // без хранилища код живёт до закрытия вкладки
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const smallButton =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-4 text-body-strong text-text ring-1 ring-line-2 ring-inset transition-colors duration-100 focus-ring is-hover:bg-surface-2";

function CopyButton({
  text,
  label,
  onCopied,
}: {
  text: string;
  label: string;
  onCopied?: () => void;
}) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(() => setDone(false), 1800);
    return () => window.clearTimeout(timer);
  }, [done]);
  return (
    <button
      type="button"
      className={smallButton}
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          onCopied?.();
        }
      }}
    >
      {done ? (
        <Check className="size-4 text-ok" strokeWidth={2.5} aria-hidden />
      ) : (
        <Copy className="size-4" aria-hidden />
      )}
      <span aria-live="polite">{done ? "Скопировано" : label}</span>
    </button>
  );
}

function LinkCard({
  title,
  text,
  url,
  canShare,
}: {
  title: string;
  text: string;
  url: string;
  canShare: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvas.current) drawQr(canvas.current, url);
  }, [url]);
  const slug = new URL(url).pathname.replace(/\W+/g, "-").replace(/^-|-$/g, "") || "site";

  return (
    <li
      data-testid="kit-link"
      className="grid gap-4 rounded-2xl bg-surface p-4 ring-1 ring-line sm:grid-cols-[1fr_auto] sm:p-6"
    >
      <div className="flex min-w-0 flex-col gap-3">
        <div>
          <h3 className="site-h3 text-text">{title}</h3>
          <p className="site-caption mt-1 text-text-2">{text}</p>
        </div>
        <p
          data-testid="kit-url"
          className="rounded-control bg-surface-2 px-3 py-2 text-meta break-all text-text tnum"
        >
          {url}
        </p>
        <div className="flex flex-wrap gap-2">
          <CopyButton
            text={url}
            label="Скопировать"
            onCopied={() => track("kit_copy", { link: slug })}
          />
          {canShare ? (
            <button
              type="button"
              className={smallButton}
              onClick={async () => {
                try {
                  await navigator.share({ title: `ГАЙКА: ${title}`, url });
                  track("kit_share", { link: slug });
                } catch {
                  // человек закрыл окно «Поделиться»
                }
              }}
            >
              <Share2 className="size-4" aria-hidden />
              Поделиться
            </button>
          ) : null}
          <button
            type="button"
            className={smallButton}
            onClick={() => {
              const link = document.createElement("a");
              link.download = `gaika-qr-${slug}.png`;
              link.href = canvas.current?.toDataURL("image/png") ?? "";
              link.click();
            }}
          >
            <Download className="size-4" aria-hidden />
            Скачать PNG
          </button>
        </div>
      </div>
      <canvas
        ref={canvas}
        data-testid="kit-qr"
        data-url={url}
        role="img"
        aria-label={`QR-код ссылки ${title}`}
        className="size-36 justify-self-start rounded-control bg-white sm:size-40"
      />
    </li>
  );
}

export default function PartnerKit() {
  const id = useId();
  const [code, setCode] = useState("");
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    setCode(readCode());
    setCanShare(typeof navigator.share === "function");
  }, []);

  // Ссылки всегда на публичный адрес: их пересылают, а не открывают здесь
  const base = PUBLIC_URL;
  const demoLink = partnerLink(base, "/demo", code);
  const message = KIT.message.text(demoLink);

  return (
    <div className="site-wrap flex flex-col gap-12 pb-16 lg:gap-16 lg:pb-28">
      <section aria-labelledby={`${id}-code`} className="max-w-[520px]">
        <label htmlFor={`${id}-input`} id={`${id}-code`} className="site-h3 text-text">
          {KIT.code.label}
        </label>
        <input
          id={`${id}-input`}
          data-testid="kit-code"
          value={code}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="например, vasya"
          onChange={(event) => {
            const next = cleanPartnerCode(event.target.value);
            setCode(next);
            saveCode(next);
          }}
          className="mt-3 min-h-12 w-full rounded-control border border-line-2 bg-surface px-4 text-body text-text outline-none placeholder:text-text-3 focus-ring"
        />
        <p className="site-caption mt-2 text-text-3">{KIT.code.hint}</p>
      </section>

      <section aria-labelledby={`${id}-links`}>
        <h2 id={`${id}-links`} className="site-h2 text-text">
          Ссылки
        </h2>
        <ul className="mt-6 grid gap-4 lg:grid-cols-2">
          {KIT.links.map((link) => (
            <LinkCard
              key={link.path}
              title={link.title}
              text={link.text}
              url={partnerLink(base, link.path, code)}
              canShare={canShare}
            />
          ))}
        </ul>
      </section>

      <section aria-labelledby={`${id}-message`} className="max-w-[720px]">
        <h2 id={`${id}-message`} className="site-h2 text-text">
          {KIT.message.title}
        </h2>
        <p
          data-testid="kit-message"
          className="site-body mt-5 rounded-2xl bg-surface p-5 text-text ring-1 ring-line"
        >
          {message}
        </p>
        <div className="mt-3">
          <CopyButton
            text={message}
            label="Скопировать текст"
            onCopied={() => track("kit_copy", { link: "message" })}
          />
        </div>
      </section>

      <section aria-labelledby={`${id}-script`} className="max-w-[720px]">
        <h2 id={`${id}-script`} className="site-h2 text-text">
          {KIT.script.title}
        </h2>
        <ol className="mt-6 flex flex-col">
          {KIT.script.steps.map((step, index) => (
            <li
              key={step.what}
              className={cn(
                "grid grid-cols-[32px_1fr] gap-x-3 py-4",
                index > 0 && "border-t border-line",
              )}
            >
              <span className="text-body-strong text-text-3 tnum">{index + 1}</span>
              <span className="flex flex-col gap-1">
                <span className="text-body-strong text-text">{step.what}</span>
                <span className="site-body text-text-2">«{step.say}»</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby={`${id}-faq`} className="max-w-[720px]">
        <h2 id={`${id}-faq`} className="site-h2 text-text">
          {KIT.objections}
        </h2>
        <dl className="mt-6 flex flex-col gap-5">
          {LANDING.faq.items.map((item) => (
            <div key={item.q}>
              <dt className="text-body-strong text-text">«{item.q}»</dt>
              <dd className="site-body mt-1 text-text-2">{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
