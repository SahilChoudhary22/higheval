# syntax=docker/dockerfile:1
#
# HighEval in one container: the API, the built web app and the pinned Hermes
# runtime. Agents run inside the container as an unprivileged user, so their
# tools reach only the container's filesystem, not the host's.

ARG NODE_VERSION=22.23.2
ARG UV_VERSION=0.11.31

FROM ghcr.io/astral-sh/uv:${UV_VERSION} AS uv

FROM node:${NODE_VERSION}-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

# The Hermes runtime only depends on its install script, so this layer stays
# cached across application changes. It is installed at its final path, as the
# runtime user, because its manifest records absolute paths.
FROM base AS hermes
COPY --from=uv /uv /usr/local/bin/uv
RUN chown node:node /app
USER node
COPY --chown=node:node scripts/setup-hermes.sh scripts/
RUN bash scripts/setup-hermes.sh

FROM base AS build
# better-sqlite3 compiles from source when no prebuilt binary matches.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY . .
# Git hooks are for development checkouts only.
ENV HUSKY=0
RUN pnpm install --frozen-lockfile && pnpm build

FROM base AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/app/data
COPY --from=hermes --chown=node:node /app/.hermes-runtime /app/.hermes-runtime
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "apps/api/dist/main.js"]
