# ГАЙКА на своём сервере в Docker

Решения: ADR-068 (Docker), ADR-069 (пилот), ADR-085 (server: файлы смет, копии, приглашения).
Порядок работы с людьми и первой неделей: `docs/runbook/pilot.md`.

Состояние проверки на 23.11.2026: контур без Docker (миграции, `db:gas-init`, `db:gas-user`,
сервер сборки `server`, путь до Excel, перезапуск, копия и восстановление) проверен
`bun scripts/check-server-p8.ts`. Сборка образа и `docker compose up` на чистой машине
ещё не прогнаны: на машине разработки не был запущен демон Docker. Первый подъём по этому
документу на сервере — и есть эта проверка; расхождения записать сюда же.

## 0. Сервер

- Ubuntu 24.04 LTS, 2 vCPU, 4 ГБ памяти, диск от 40 ГБ.
- Домен (например `gaika.example.ru`): запись A указывает на IP сервера. Без неё Caddy не
  получит сертификат HTTPS.
- Открыты порты 22, 80, 443.

Под root, один раз:

```bash
apt-get update && apt-get -y upgrade
apt-get install -y ca-certificates curl git ufw

# Docker Engine и плагин compose из репозитория Docker
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Подкачка 2 ГБ: сборка образа (vite) на 4 ГБ памяти без неё может упасть
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Сеть: только SSH и веб
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp && ufw --force enable

# Отдельный пользователь сервиса
adduser --disabled-password --gecos "" gaika && usermod -aG docker gaika
mkdir -p /srv/gaika-backups && chown gaika:gaika /srv/gaika-backups
```

Проверка: `docker version` и `docker compose version` отвечают без ошибок.

## 1. Код и настройки

Под пользователем `gaika` (`su - gaika`):

```bash
git clone https://github.com/Neeklo1606/facade-ai-flow.git gaika && cd gaika
cp deploy/.env.example deploy/.env && chmod 600 deploy/.env
openssl rand -hex 32   # SESSION_SECRET
openssl rand -hex 24   # CLIENT_LINK_KEY
openssl rand -hex 24   # POSTGRES_PASSWORD
```

Заполните `deploy/.env`:

| Переменная          | Значение                                                                |
| ------------------- | ----------------------------------------------------------------------- |
| `DOMAIN`            | домен без `https://`                                                    |
| `GAIKA_MODE`        | `server`: рабочий контур с базой                                        |
| `POSTGRES_PASSWORD` | случайная строка, только буквы и цифры (входит в строку подключения)    |
| `SESSION_SECRET`    | случайная строка; смена гасит все ссылки и сессии                       |
| `CLIENT_LINK_KEY`   | случайная строка                                                        |
| `APP_TIME_ZONE`     | `Europe/Moscow`                                                         |
| `AUTH_CHANNEL`      | `log`: код входа виден на экране входа, пока нет SMS или Telegram       |
| `BACKUP_HOST_DIR`   | `/srv/gaika-backups`: каталог копий на хосте (по умолчанию `./backups`) |

Ключи модели (`ANTHROPIC_API_KEY`) пустые: ассистент отвечает правилами, это честно видно
на экране. `deploy/.env` в образ не попадает (`.dockerignore`), как и `.local/`, `data/`,
`backups/`. Адрес для canonical и ссылок входа вшивается при сборке и передаётся серверу
(`VITE_PUBLIC_URL`, `PUBLIC_URL` = `https://$DOMAIN`).

## 2. База, схема, компания

```bash
cd ~/gaika
set -a; . deploy/.env; set +a           # DOMAIN и пароли в окружение этой оболочки
C="docker compose --env-file deploy/.env"

$C up -d db
$C --profile tools run --rm migrate     # схема: миграции dbmate (собирает образ migrate)
$C --profile tools run --rm migrate \
  bun run db:gas-init --name "Имя Фамилия" --phone "+79990000000" --group "1. Стальные" \
  --url "https://$DOMAIN"
$C up -d --build app caddy
```

`db:gas-init` заводит пустую компанию без демо-данных и печатает ссылку администратора
на 72 часа. Повторно команда не сработает. Ссылку передать лично.

## 3. Люди

Администратор входит по ссылке: «Данные» → «Бригады из Excel». Затем «Настройка» →
«Люди и вход» → «Добавить человека»: имя, телефон, роль (бригадиру нужна бригада). Экран
выдаёт ссылку входа на 72 часа; «Новая ссылка» гасит прежнюю, «Отозвать доступ» закрывает
сессии и ссылки. То же командой, если экран недоступен:

```bash
$C --profile tools run --rm migrate bun run db:gas-user \
  --name "Иванова Ольга" --phone "+79990000001" --role manager --url "https://$DOMAIN"
```

## 4. Проверка после подъёма

```bash
$C ps                                             # app: healthy, db: healthy
curl -fsSI "https://$DOMAIN/robots.txt"           # 200, сертификат принят
curl -s "https://$DOMAIN/" | grep -o 'rel="canonical" href="[^"]*"'   # ваш домен
$C logs --tail 100 app                            # без ошибок запуска
```

Руками: вход администратора по ссылке, «Настройка» → «Люди и вход» показывает людей.
Затем перезапуск `$C restart app`: вход сохраняется, данные на месте (П8).

## 5. Резервная копия и проверка восстановления

Копия: база (`pg_dump`, формат custom), архив тома файлов смет, число строк таблиц и
контрольные суммы. Каталог `$BACKUP_HOST_DIR/gaika-<время UTC>/`, хранятся 14 дней
(`BACKUP_KEEP_DAYS`).

```bash
$C --profile tools run --rm backup              # печатает путь копии
```

Проверка восстановления — только в отдельную базу `gaika_restore`, рабочую не трогает:

```bash
$C exec -T db dropdb -U gaika --if-exists gaika_restore
$C exec -T db createdb -U gaika gaika_restore
$C --profile tools run --rm restore-check /backups/gaika-20261123T023000Z
# в конце «Восстановление проверено»; затем базу можно удалить:
$C exec -T db dropdb -U gaika gaika_restore
```

Расписание (crontab пользователя `gaika`, `crontab -e`): копия каждую ночь, проверка
восстановления последней копии по воскресеньям.

```cron
30 2 * * * cd ~/gaika && docker compose --env-file deploy/.env --profile tools run --rm backup >> ~/backup.log 2>&1
30 4 * * 0 cd ~/gaika && C="docker compose --env-file deploy/.env" && $C exec -T db dropdb -U gaika --if-exists gaika_restore && $C exec -T db createdb -U gaika gaika_restore && $C --profile tools run --rm restore-check "/backups/$(ls -1 /srv/gaika-backups | tail -1)" >> ~/restore.log 2>&1; $C exec -T db dropdb -U gaika --if-exists gaika_restore
```

Копии лежат на том же сервере: от потери диска они не спасают. Куда уносить копию
(второй сервер, облачное хранилище) — решение владельца.

Восстановление в рабочую базу после аварии (останавливает сервис):

```bash
$C stop app
$C exec -T db dropdb -U gaika gaika && $C exec -T db createdb -U gaika gaika
$C exec -T db pg_restore -U gaika -d gaika --no-owner < /srv/gaika-backups/gaika-…/db.dump
$C run --rm --no-deps --entrypoint sh -v /srv/gaika-backups:/backups:ro app \
  -c 'tar -C /data/estimate-files -xzf /backups/gaika-…/estimate-files.tar.gz'
$C start app
```

## 6. Обновление и откат

```bash
git pull
$C --profile tools run --rm backup                   # копия перед обновлением
$C --profile tools run --rm --build migrate          # новые миграции
$C up -d --build app
```

Откат кода: `git checkout <прошлый коммит>` и `up -d --build app`. Миграции назад —
`docs/runbook/database.md`; при сомнении восстановить копию, снятую перед обновлением.

## 7. Проверка контура без Docker (разработка)

Тот же путь командами на локальном PostgreSQL, база `gaika_p8_server` пересоздаётся:

```bash
NITRO_PRESET=node-server bun run build:server
bun run check:server-p8         # PG_URL=postgres://localhost:5432, P8_PORT=4643
```

Итог «П8: проверено»: миграции, `db:gas-init`, `db:gas-user`, вход по ссылкам, смета мастером
с исходным файлом на диске, время, проверка, Excel; перезапуск процесса сервера; после него
сессии, запись, файл сметы, Excel, «Люди и вход» со ссылкой и отзывом; копия и восстановление
в отдельную базу со сверкой.

## Что ещё не готово для живых данных

- Деплой на сервер заказчика не выполнен: нужны сервер, домен и доступ (владелец).
- Вход по коду только `AUTH_CHANNEL=log`; SMS или Telegram — решение владельца.
- Бот MAX: вебхук отвечает 501 до токена. Бригадир вводит время в вебе.
- Копия вне сервера не настроена (см. раздел 5).
