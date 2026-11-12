# ГАЙКА на своём сервере в Docker

Решение: ADR-068. Нужны Docker 24+ и домен, который указывает на сервер (для HTTPS).

## 1. Подготовка

```bash
git clone git@github.com:Neeklo1606/facade-ai-flow.git gaika && cd gaika
cp deploy/.env.example deploy/.env
openssl rand -hex 32   # значение для SESSION_SECRET
openssl rand -hex 24   # значение для CLIENT_LINK_KEY
```

Заполните `deploy/.env`: `DOMAIN`, `POSTGRES_PASSWORD`, `SESSION_SECRET`, `CLIENT_LINK_KEY`.
`GAIKA_MODE=server` собирает рабочий контур с базой, `production` собирает демо как на публичном адресе.

Адрес сайта для canonical, sitemap, og:url и JSON-LD вшивается при сборке: compose передаёт
`VITE_PUBLIC_URL=https://$DOMAIN`. Так же при сборке подставляются `CONTACT_TG`, `METRIKA_ID`,
`YANDEX_VERIFICATION`, `GOOGLE_VERIFICATION`: после их изменения нужен `up -d --build app`.
`SEO_INDEX=on` читается при запуске и открывает сайт поисковикам (robots и sitemap); пусто:
сайт закрыт, `/sitemap.xml` отвечает 404. Файл `deploy/.env` исключён из образа `.dockerignore`.

## 2. База и запуск

```bash
docker compose --env-file deploy/.env up -d db
docker compose --env-file deploy/.env --profile tools run --rm migrate
docker compose --env-file deploy/.env up -d --build app caddy
```

Первый руководитель (одноразовая ссылка на 72 часа, см. `docs/runbook/database.md`):

```bash
docker compose --env-file deploy/.env --profile tools run --rm migrate \
  bun run db:owner --name "Имя Фамилия" --phone "+79990000000" --url "https://$DOMAIN"
```

## 3. Проверка

```bash
docker compose --env-file deploy/.env ps          # app: healthy
curl -I https://$DOMAIN/                           # 200 или переход на экран роли
curl -s https://$DOMAIN/ | grep -o 'rel="canonical" href="[^"]*"'   # адрес вашего домена
docker compose --env-file deploy/.env logs -f app  # журнал сервера
```

## 4. Обновление и откат

```bash
git pull && docker compose --env-file deploy/.env up -d --build app
docker compose --env-file deploy/.env --profile tools run --rm migrate   # новые миграции
```

Откат: `git checkout <прошлый коммит>` и та же команда сборки. Миграции вперёд-назад
описаны в `docs/runbook/database.md`. Копия базы:

```bash
docker compose --env-file deploy/.env exec db pg_dump -U gaika gaika > backup-$(date +%F).sql
```

## Что ещё не готово для живых данных

Вход ролей `/gas` по коду, канал SMS или Telegram, ключи модели и речи, хранилище файлов.
Список и порядок: `docs/launch/2026-11-12-pilot-report.md`, раздел 4.
