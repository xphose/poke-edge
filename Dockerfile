# ── Stage 1: Build frontend ──────────────────────────────────
FROM node:22-slim AS web-build

WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
RUN npm ci --ignore-scripts

COPY apps/web/ apps/web/
RUN npm run build -w web

# ── Stage 2: Build server ───────────────────────────────────
FROM node:22-slim AS server-build

WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
RUN npm ci

COPY apps/server/ apps/server/
RUN npm run build -w server

# ── Stage 3: Production ────────────────────────────────────
FROM node:22-slim AS production

RUN apt-get update && apt-get install -y --no-install-recommends \
    sqlite3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g pm2

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
RUN npm ci --omit=dev

COPY --from=server-build /app/apps/server/dist apps/server/dist
COPY --from=server-build /app/apps/server/src/db/migrations apps/server/dist/db/migrations
COPY --from=server-build /app/apps/server/src/data apps/server/dist/data
COPY --from=web-build /app/apps/web/dist apps/web/dist

COPY ecosystem.config.cjs .
COPY apps/server/src/db/migrations apps/server/src/db/migrations

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

CMD ["pm2-runtime", "ecosystem.config.cjs"]
