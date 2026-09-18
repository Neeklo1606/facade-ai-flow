/**
 * Доступ к демонстрации по ключу в адресе (TASK-A5, п. 2).
 *
 * Зачем: демонстрация не должна индексироваться и расходиться по ссылкам бесконтрольно.
 * Чем это не является: защитой данных. Демо-набор вымышленный, а ключ проверяется на сервере
 * до отдачи HTML — этого достаточно, чтобы адрес не открывался случайным человеком и поисковиком,
 * и недостаточно против того, кто ключ уже получил.
 *
 * Ключ задаётся переменной окружения `DEMO_ACCESS_KEY` на хостинге. Если её нет, шлюз выключен:
 * лучше открытая демонстрация, чем закрытая от владельца после неудачного развёртывания.
 * Как задать — docs/RUNBOOK.md.
 */

export const ACCESS_COOKIE = "fieldops_demo";

/**
 * Витрина дизайн-системы в публикации не существует (находка ревью BLOCKER-2).
 * Кода витрины в сборке нет — модуль маршрута подменяется заглушкой в vite.config.ts,
 * а этот путь отвечает 404, как любой несуществующий адрес: маршрут не должен резолвиться.
 * Собрать витрину намеренно — KEEP_DESIGN_SYSTEM=1.
 */
export const DESIGN_SYSTEM_PATH = "/design-system";

export function isRemovedInProduction(pathname: string) {
  // В разработке витрина нужна: там она и собирается, и открывается
  if (import.meta.env.DEV) return false;
  if (typeof process !== "undefined" && process.env["KEEP_DESIGN_SYSTEM"] === "1") return false;
  return pathname === DESIGN_SYSTEM_PATH || pathname === DESIGN_SYSTEM_PATH + "/";
}
export const ACCESS_PARAM = "k";
/** 30 дней: показ живёт неделями, повторно ключ никто не ищет */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/** Краулеры мессенджеров и поисковиков: им отдаём страницу-объяснение с мета-тегами */
const PREVIEW_AGENTS =
  /TelegramBot|WhatsApp|facebookexternalhit|Twitterbot|Slackbot|vkShare|Discordbot|LinkedInBot|Googlebot|bingbot|YandexBot/i;

/**
 * Ключ берётся оттуда, где его даёт хостинг: у Cloudflare это аргумент `env` обработчика,
 * у node-сервера — переменные процесса.
 *
 * `VITE_DEMO_ACCESS_KEY` — запасной путь на случай, когда хостинг умеет задавать только
 * переменные сборки. Он работает, но слабее: значение подставляется в код при сборке и потому
 * попадает и в клиентский бандл, а бандл лежит в открытой статике (иначе не работает превью
 * ссылки). Такой ключ закрывает адрес от поисковиков и случайных переходов, но его можно
 * вычитать из файлов сборки. Предпочтительна переменная окружения `DEMO_ACCESS_KEY`.
 */
export function accessKey(env: Record<string, string | undefined>) {
  const fromEnv = env["DEMO_ACCESS_KEY"]?.trim();
  if (fromEnv) return fromEnv;
  const fromProcess =
    typeof process !== "undefined" ? process.env["DEMO_ACCESS_KEY"]?.trim() : undefined;
  if (fromProcess) return fromProcess;
  const fromBuild = import.meta.env["VITE_DEMO_ACCESS_KEY"]?.trim();
  return fromBuild ? fromBuild : null;
}

/** Запросы, которые шлюз не трогает: статика, иконки, манифест и robots */
export function isPublicPath(pathname: string) {
  return (
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/_build/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/manifest.webmanifest" ||
    pathname.startsWith("/icon-") ||
    pathname === "/og-preview.jpg"
  );
}

export function isPreviewCrawler(userAgent: string | null) {
  return !!userAgent && PREVIEW_AGENTS.test(userAgent);
}

export function hasAccess(request: Request, key: string) {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${ACCESS_COOKIE}=([^;]+)`));
  return match?.[1] === key;
}

/** Ключ пришёл в адресе: запоминаем в cookie и убираем параметр, чтобы ссылка не гуляла дальше */
export function grantResponse(url: URL, key: string) {
  const clean = new URL(url);
  clean.searchParams.delete(ACCESS_PARAM);
  const secure = clean.protocol === "https:" ? " Secure;" : "";
  return new Response(null, {
    status: 302,
    headers: {
      location: clean.pathname + clean.search + clean.hash,
      "set-cookie": `${ACCESS_COOKIE}=${encodeURIComponent(key)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax;${secure}`,
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

export interface PreviewMeta {
  title: string;
  description: string;
  image: string;
  url: string;
}

export const previewMeta: PreviewMeta = {
  title: "neeklo FieldOps — демонстрация",
  description:
    "Система для фасадных подрядчиков: спецификации из документации, закупка у поставщиков и отчёты с площадки в одном месте.",
  image: "/og-preview.jpg",
  url: "https://facade-ai-flow.lovable.app/",
};

/** Экран без ключа: объясняет, что это и как получить доступ. Мета-теги те же, что у продукта */
export function renderAccessPage(origin: string): string {
  const image = origin + previewMeta.image;
  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${previewMeta.title}</title>
    <meta name="description" content="${previewMeta.description}" />
    <meta name="robots" content="noindex, nofollow" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${previewMeta.title}" />
    <meta property="og:description" content="${previewMeta.description}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:url" content="${previewMeta.url}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${previewMeta.title}" />
    <meta name="twitter:description" content="${previewMeta.description}" />
    <meta name="twitter:image" content="${image}" />
    <link rel="icon" href="/favicon.ico" type="image/x-icon" />
    <link rel="icon" href="/icon-192.png" type="image/png" sizes="192x192" />
    <style>
      :root { color-scheme: dark; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px;
        background: #000; color: #f2f2f2;
        font: 15px/1.5 Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
      .card { width: 100%; max-width: 520px; border: 1px solid #1f1f1f; border-radius: 16px;
        background: #121212; padding: 28px; box-shadow: 0 12px 40px rgba(0,0,0,.6); }
      .mark { display: inline-grid; place-items: center; width: 34px; height: 34px; border-radius: 10px;
        background: #e85002; color: #fff; font-weight: 600; }
      h1 { font-size: 20px; line-height: 1.3; margin: 18px 0 8px; font-weight: 600; }
      p { margin: 0 0 12px; color: #b4b4b4; }
      ul { margin: 0 0 18px; padding-left: 18px; color: #b4b4b4; }
      li { margin-bottom: 6px; }
      .note { margin: 0; font-size: 13px; color: #8e8e8e; }
      code { background: #1a1a1a; border-radius: 6px; padding: 2px 6px; font-size: 13px; color: #d9c3ab; }
    </style>
  </head>
  <body>
    <main class="card">
      <span class="mark" aria-hidden="true">F</span>
      <h1>Демонстрация открывается по ссылке с ключом</h1>
      <p>Это рабочая демонстрация neeklo FieldOps — системы для фасадных подрядчиков.
        Адрес закрыт от поисковиков и случайных переходов, поэтому без ключа экран пустой.</p>
      <ul>
        <li>Ключ выдаёт владелец проекта вместе со ссылкой вида <code>?k=…</code>.</li>
        <li>Открытая один раз ссылка запоминается в браузере на 30 дней.</li>
        <li>Данные внутри вымышленные: объекты, поставщики и отчёты собраны для показа.</li>
      </ul>
      <p class="note">Если ссылка с ключом не открывается, попросите прислать её заново —
        ключ мог смениться.</p>
    </main>
  </body>
</html>`;
}
