# payload-elysia-refine

Payload CMS 3 running headless inside an **ElysiaJS server on Bun**, consumed by a **Refine + Ant Design** admin dashboard that replaces the Payload admin UI.

```
payload-elysia-refine/
├── api/        # Bun + Elysia + Payload 3 REST API (no admin UI, no Next.js)
├── dashboard/  # Vite + React 19 + Refine v5 + Ant Design 5 admin dashboard
└── package.json
```

## Architecture

- **`api/`** mounts Payload's framework-agnostic REST engine (`handleEndpoints({ config, request })`) on Elysia's `.all('/api/*')` catch-all — Payload handles auth strategies, cookie sessions, CORS, CSRF, custom collection endpoints, OpenAPI docs and errors. The admin panel is disabled (`admin.disable: true`) and there is no Next.js in this repo.
- **`dashboard/`** (Refine v5 + `@refinedev/antd` 6, Ant Design 5) talks to the same REST API. The Vite dev server proxies `/api` → `http://localhost:3000`, so the Payload httpOnly session cookie works same-origin without extra CORS/CSRF friction.
- PostgreSQL via `@payloadcms/db-postgres` with **UUID v7** ids (`idType: 'uuidv7'`), lexical rich text, auto-generated OpenAPI at `/docs` (Scalar UI) secured by the basic-auth plugin per `APP_ENV`.

## Collections & auth semantics (copied 1:1 from the source project)

- **users** — public self-registration (role forced to `guest`), superadmin-only role field / delete; read & update for guests are scoped to their own document server-side. API keys: enable via PATCH (`enableAPIKey`), then use `Authorization: users API-Key <key>`.
- **posts** — CRUD is superadmin-only, read is public; slug uniqueness and kebab-case validation; `GET /api/posts/stats` (Drizzle aggregate) gated behind authentication.
- **Role uplift protection**: no non-superadmin (and no anonymous registration) can ever set `role: 'superadmin'`.

## Getting started

```bash
bun install

# create the database once
psql -h 127.0.0.1 -U postgres -c 'CREATE DATABASE payload_elysia'

cp .env.example api/.env   # adjust DATABASE_URI / PAYLOAD_SECRET as needed

bun run dev:api       # http://localhost:3000/api
bun run dev:dashboard # separately: Refine dashboard on http://localhost:5173
```

Seed the first admin + sample post (idempotent):

```bash
bun --cwd api -- run seed     # see api/package.json; equivalently: cd api && bun run seed
```

Login: `admin@example.com` / `password123`

## Scripts

| Where | Command | What |
| --- | --- | --- |
| root | `bun run lint` / `lint:fix` | Biome check across both workspaces |
| root | `bun run test` | API test suite (unit + live REST parity tests) |
| root | `bun run dev:api` / `dev:dashboard` | Run one server each |
| api/ | `bun run generate:types` | Regenerate `src/payload-types.ts` |
| api/ | `bun run generate:openapi` | Write `openapi.json` from the `/openapi.json` endpoint |
| api/ | `bun run seed` | Idempotent first-user + sample-post seeding |
| dashboard/ | `bun run typecheck` | `tsc --noEmit` |

## Environment variables

All API runtime behavior is env-driven (`api/.env` in development, container/CLI env in deployment):

| Variable | Used by | Purpose |
| --- | --- | --- |
| `DATABASE_URI` | API | Postgres connection string. Must align with `PGUSER` (the pool applies `PGUSER` over the URI's user). |
| `PGUSER` | API | Explicit pg pool user; keep it identical to the user embedded in `DATABASE_URI`. |
| `PAYLOAD_SECRET` | API | JWT signing / crypto secret. Set a real 32+ char secret outside local dev. |
| `PORT` | API | Elysia HTTP port (default `3000`). |
| `SERVER_URL` | API | Canonical API origin exposed to clients (default `http://localhost:3000`). |
| `DASHBOARD_URL` | API | Dashboard's real origin: feeds both the CORS allowlist **and** the cookie-CSRF allowlist. |
| `APP_ENV` | API | `development` / `uat` / `production`; gates the basic-auth-protected `/docs`. |
| `VITE_API_PROXY_TARGET` | dashboard | Dev-only Vite proxy target (default `http://127.0.0.1:3000`). |

**Cookie-auth rule in production:** Payload's `extractJWT` drops the `payload-token` cookie unless the request `Origin` header is allowlisted in `config.csrf`. `DASHBOARD_URL` must therefore be set to the exact deployed dashboard origin (e.g. the Vercel URL, scheme included), or every dashboard write silently becomes an anonymous request and fails with 403 — the same failure mode a drifted dev Vite port produces locally.

## Deployment

### API with Docker

The Dockerfile builds from the repo root (the `api/` workspace member resolves through the root `bun.lock`):

```bash
docker compose up --build
# → db (postgres:17-alpine, healthcheck) + api on http://localhost:3000/api
```

First startup runs the idempotent seed (`dev`-conditions schema push + first superadmin `admin@example.com` / `password123` + sample post) and then serves. For a standalone image: `docker build -t payload-elysia-api .` and supply `DATABASE_URI` / `PGUSER` / `PAYLOAD_SECRET` / `DASHBOARD_URL` yourself (hosted Postgres like Neon/Railway works — no compose needed, just the connection string).

> Note: this image was authored without a locally available Docker daemon — smoke-test it on your deployment host before relying on it.

### Dashboard on Vercel

1. Import the repo into Vercel; set **Root Directory = `dashboard`** (framework: Vite, build `bun run build`, output `dist`).
2. Fill in the one placeholder in `dashboard/vercel.json`: replace `https://<your-api-host>` with the deployed API URL. The `/api/*` rewrite keeps dashboard↔API traffic **same-origin** in production, so the httpOnly cookie session and CSRF allowlist keep working with zero code changes.
3. On the API side, set `DASHBOARD_URL` to the deployed Vercel URL (see the cookie-auth rule above) and `SERVER_URL` to the API's public URL.

## Notes

- **Why `--conditions=development` everywhere**: payload packages ship a dev-bundle ESM build that resolves their circular imports correctly under Bun; CLI scripts in the source project carry the same flag.
- **Seeding**: `payload migrate` prompts interactively ("data loss") when the dev schema push already created the schema, so seeding runs through the local API script instead. `api/src/migrations/20261019_000000_seed.ts` keeps the same seed logic for migration-based flows.
- **Cookie auth & CSRF**: Payload's `extractJWT` rejects cookie auth unless the request Origin is in `config.csrf` or carries `Sec-Fetch-Site: same-origin`. The dashboard origin (`http://localhost:5173`) is allowlisted for direct cross-origin use; browsers behind the Vite proxy pass through the same-origin path automatically.
- **No GraphQL, uploads, globals, drafts/versions** — deliberately out of scope of the source project's API surface.
