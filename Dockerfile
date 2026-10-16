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
    node_modules/@tailwindcss \
    node_modules/@babel \
    node_modules/@esbuild \
    node_modules/@rollup \
    node_modules/@hookform \
    node_modules/@floating-ui \
    node_modules/lightningcss* \
    node_modules/vinxi \
    node_modules/nitropack* \
    node_modules/vite* \
    node_modules/rollup* \
    node_modules/esbuild* \
    node_modules/recharts \
    node_modules/d3* \
    node_modules/date-fns \
    node_modules/tailwindcss \
    node_modules/embla-carousel-react \
    node_modules/react \
    node_modules/react-dom \
    node_modules/react-hook-form \
    node_modules/react-resizable-panels \
    node_modules/react-day-picker \
    node_modules/sonner \
    node_modules/vaul \
    node_modules/cmdk \
    node_modules/input-otp \
    node_modules/tw-animate-css \
    node_modules/postcss* \
    node_modules/autoprefixer* \
    node_modules/caniuse* \
    node_modules/browserslist* \
    node_modules/lucide-react \
    node_modules/.cache

# ---------- runtime ----------
FROM node:22-bookworm-slim AS runtime
LABEL org.opencontainers.image.title="HarborX" \
      org.opencontainers.image.description="Docker management UI with live logs and container console" \
      org.opencontainers.image.source="https://github.com/felipesdam496/docker-harmony-hub"

# Install git, curl, ca-certificates and strip unneeded runtime files (npm, corepack, man, docs, apt caches)
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates curl \
 && rm -rf /var/lib/apt/lists/* /var/cache/apt/* /usr/share/doc/* /usr/share/man/* \
           /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/include/node

# Copy docker-compose directly and create transparent wrapper script for "docker compose"
COPY --from=dockercli /usr/local/libexec/docker/cli-plugins/docker-compose /usr/local/bin/docker-compose
RUN printf '#!/bin/sh\nif [ "$1" = "compose" ]; then\n  shift\n  exec docker-compose "$@"\nfi\nexec docker-compose "$@"\n' > /usr/local/bin/docker \
 && chmod +x /usr/local/bin/docker /usr/local/bin/docker-compose \
 && mkdir -p /usr/local/lib/docker/cli-plugins \
 && ln -sf /usr/local/bin/docker-compose /usr/local/lib/docker/cli-plugins/docker-compose

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
