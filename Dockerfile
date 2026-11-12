# ГАЙКА: образ для своего сервера (ADR-068). Сборка bun, запуск node на пресете node-server.
#   docker build -t gaika .                       # демо-контур (как публичный адрес)
#   docker build -t gaika --build-arg MODE=server .  # рабочий контур с PostgreSQL
# Ключи и секреты только переменными окружения при запуске, в образ они не попадают.

FROM oven/bun:1.3 AS build
WORKDIR /app
ARG MODE=production
# Адрес сайта и счётчики подставляются при сборке (VITE_*): canonical, sitemap, og:url, JSON-LD.
# Без VITE_PUBLIC_URL ссылки ведут на адрес Lovable, поэтому compose передаёт https://DOMAIN
ARG VITE_PUBLIC_URL=
ARG VITE_CONTACT_TG=
ARG VITE_METRIKA_ID=
ARG VITE_YANDEX_VERIFICATION=
ARG VITE_GOOGLE_VERIFICATION=
ENV NITRO_PRESET=node-server
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile
COPY . .
RUN if [ "$MODE" = "server" ]; then bun run build --mode server; else bun run build; fi

# Миграции: тот же набор зависимостей, dbmate из devDependencies
FROM build AS migrate
CMD ["bun", "run", "db:migrate"]

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0
COPY --from=build /app/.output ./.output
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/robots.txt').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", ".output/server/index.mjs"]
