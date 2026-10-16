# syntax=docker/dockerfile:1.7

# ---------- docker CLI + compose plugin (used for stacks) ----------
FROM docker:27-cli AS dockercli

# ---------- build (front-end SPA + backend bundle) ----------
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile --ignore-scripts
COPY . .
RUN bun run build && bun run build:server

# ---------- production dependencies only (pruned to backend runtime) ----------
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile --production --ignore-scripts \
 && rm -rf \
    node_modules/@radix-ui \
    node_modules/@tanstack \
    node_modules/@testing-library \
    node_modules/@types \
    node_modules/@xterm \
    node_modules/lucide-react \
    node_modules/recharts \
    node_modules/date-fns \
    node_modules/tailwindcss \
    node_modules/@tailwindcss \
    node_modules/embla-carousel-react \
    node_modules/react \
    node_modules/react-dom \
    node_modules/react-hook-form \
    node_modules/react-resizable-panels \
    node_modules/sonner \
    node_modules/vaul \
    node_modules/cmdk \
    node_modules/input-otp \
    node_modules/tw-animate-css \
    node_modules/.cache

# ---------- runtime ----------
FROM node:22-bookworm-slim AS runtime
LABEL org.opencontainers.image.title="HarborX" \
      org.opencontainers.image.description="Docker management UI with live logs and container console" \
      org.opencontainers.image.source="https://github.com/felipesdam496/docker-harmony-hub"

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates curl \
 && rm -rf /var/lib/apt/lists/* /var/cache/apt/* /usr/share/doc/* /usr/share/man/*

COPY --from=dockercli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=dockercli /usr/local/libexec/docker/cli-plugins/docker-compose /usr/local/lib/docker/cli-plugins/docker-compose

WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    HARBORX_DATA_DIR=/data \
    STATIC_DIR=/app/.output/public \
    NODE_OPTIONS="--max-old-space-size=192"

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/.output ./.output
COPY package.json ./

# NOTE: runs as root on purpose: access to /var/run/docker.sock is required and is
# equivalent to root on the host. Protect HarborX with HTTPS and strong credentials.
VOLUME ["/data"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://127.0.0.1:${PORT}/api/health || exit 1

STOPSIGNAL SIGTERM
CMD ["node", "dist/server/index.js"]



