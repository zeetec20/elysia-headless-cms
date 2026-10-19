# NOTE: Build context is the repo root: api/ is a bun workspace member, so the pinned
# bun.lock and its workspace package manifests live here, not inside api/.
FROM oven/bun:1.3-slim
WORKDIR /app

COPY package.json bun.lock ./
COPY api/package.json api/
COPY dashboard/package.json dashboard/
RUN bun install --filter payload-elysia-api

COPY api/tsconfig.json api/
COPY api/src api/src
COPY api/scripts api/scripts

ENV PORT=3000
EXPOSE 3000

# NOTE: --conditions=development is mandatory at runtime: payload's published ESM bundles only
# resolve their internal circular imports via the development conditions under Bun. The bootstrap
# seed is idempotent: on a fresh database it creates the schema (dev-mode push), the first
# superadmin and the sample post; on an existing database it is a no-op.
CMD ["sh", "-c", "cd api && bun --conditions=development scripts/seed.ts && exec bun --conditions=development src/server.ts"]
