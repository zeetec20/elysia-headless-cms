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

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD bun --eval "fetch('http://localhost:3000/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# NOTE: --conditions=development is mandatory at runtime: payload's published ESM bundles only
# resolve their internal circular imports via the development conditions under Bun. Database
# migrations run automatically on server boot via executePendingDatabaseMigrations.
CMD ["sh", "-c", "cd api && exec bun --conditions=development src/server.ts"]
