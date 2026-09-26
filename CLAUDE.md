# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Campax - Eternal Streams** is a live streaming management system for memorial services (velórios). Funeral homes configure RTSP cameras and memorial services; the public accesses streams via unique 6-character tokens.

## Commands

### Frontend (root)
```bash
npm run dev          # Start Vite dev server on port 8080
npm run build        # Production build (output: dist/)
npm run lint         # ESLint
npm run preview      # Preview production build
```

### backend (main API)
```bash
cd backend
npm run dev             # Start with ts-node (development)
npm run build           # Compile TypeScript → dist/ + prisma generate (required before PM2/systemd)
npm run start           # Run compiled output
npm run prisma:pull     # Introspect the local Postgres schema into prisma/schema.prisma
npm run prisma:generate # Regenerate the Prisma Client after editing schema.prisma
npm run seed            # One-off: assign temp passwords to any profiles row missing one
npm test                # Vitest + supertest against campax_test (refuses to run on any other DB)
npm run migrate-supabase-photos -- --base-url https://backend.campax.com.br [--apply]  # idempotent; re-run after the final Supabase re-sync
```
Schema changes are applied with `npx prisma db push` (no separate migrations folder — single environment, single DB), except changes that need ordered steps (add nullable column → backfill → NOT NULL): those are hand-written SQL in `backend/prisma/sql/NNN_*.sql`, each registering itself in the `schema_scripts` table and refusing to run twice; `schema.prisma` is then edited to match and checked with `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script` (must print an empty migration).

**Dev/test databases** (same local Postgres): `campax_dev` (full copy of production) and `campax_test` (schema only — built from `pg_dump --schema-only`, not `prisma db push`, because the DB has triggers/functions and the `extensions` schema that Prisma doesn't model). Recreate both with `backend/scripts/refresh-dev-db.sh dev|test|all` (as root). `backend/src/env.ts` picks the env file by `NODE_ENV`: `development` → `.env.development` (`npm run dev` sets it), `test` → `.env.test` (Vitest), anything else → `.env` (production). The dev/test files use `override: true` because importing `@prisma/client` auto-loads `backend/.env` (production) first. `src/app.ts` builds the Express app (imported by tests); `src/index.ts` only adds Socket.IO and `listen`.

### mediamtx-sync microservice
```bash
cd mediamtx-sync
npm run dev          # Start with ts-node (development)
npm run build        # Compile TypeScript → dist/  (required before PM2)
npm run start        # Run compiled output
```

### PM2 (production)
```bash
npm run pm2:start    # Start all 3 services
npm run pm2:status   # Check service status
npm run pm2:logs     # View logs (logs/ directory)
npm run pm2:restart  # Restart all services
```

**Note:** Run `cd mediamtx-sync && npm run build` before first PM2 start, since PM2 runs `dist/index.js`.

## Architecture

### System Components

**Frontend** — React 18 + TypeScript + Vite, served on port 8080. Uses TanStack Query for server state, React Router v6, shadcn/ui components with Tailwind CSS. In production, `server.cjs` serves the `dist/` static files. Talks to `backend/` via `src/lib/apiClient.ts` (REST, JWT bearer token in `localStorage`) and `src/lib/socket.ts` (Socket.IO, for live presence counts and homenagem updates) — no more direct database client in the frontend.

**backend** (`backend/`) — Node.js/Express/TypeScript/Prisma API, port 3003. Owns all application data, admin authentication (JWT, bcrypt-hashed passwords in `profiles`), file uploads (`falecido-fotos`, served from `backend/uploads/` via `/files`), and realtime presence/homenagem events (Socket.IO). Talks to a **local** PostgreSQL 17 database (`campax` DB, role `campax_local`, `127.0.0.1:5432` — not exposed externally). Route-level middleware (`requireAuth`, `requireRole`) replicates the old Supabase RLS role hierarchy (`superadmin > admin > operador > viewer`). This project no longer uses Supabase Cloud — the `supabase/migrations/*.sql` files remain in the repo only as historical reference for the schema's evolution.

**MediaMTX** — streaming server (Docker, `/root/mediamtx/`). Pulls each camera's RTSP (`source`, on demand) and serves WebRTC (8889, public via `media2.campax.com.br`); RTSP 8554 / RTMP 1935 / HLS 8888 are bound to `127.0.0.1` only. Admin API on 9997. **Auth is delegated to the backend** (`authMethod: http` → `POST /internal/mediamtx/auth/<MEDIAMTX_AUTH_KEY>`, `backend/src/routes/internal.ts`): reads need `?t=<stream token>` for a velório that is on (+30 min margin) — public velório responses carry a ready `stream_url` per camera, admin previews get one from `POST /cameras/:id/stream-url`; the API action needs `MEDIAMTX_API_USER`/`MEDIAMTX_API_PASSWORD`. See `docs/linux-deployment.md` (MediaMTX section).

**mediamtx-sync** (`mediamtx-sync/`) — Node.js/Express microservice (`127.0.0.1:3002` only — its endpoints have no auth). Polls the local Postgres every 30s and pushes camera configs to MediaMTX API (paths use `sourceOnDemand`, so cameras are only pulled while someone is watching); the backend also calls its webhook after camera changes and empresa suspend/reactivate (`MEDIAMTX_SYNC_URL`). Running under PM2 since 2026-09-23. `npm test` (Vitest) covers path naming and `planSync`. Exposes `/sync` (POST, trigger manual sync), `/mediamtx/status` (GET), `/webhook/camera-change` (POST), and `/health` (GET).

**Camera status** — reachability is checked by the backend (`POST /cameras/check-status`, `backend/src/lib/cameraCheck.ts`): only the caller's empresa's cameras, using `rtsp_url` from the DB, TCP connect to the IP resolved once, ≤ 10 concurrent, 30 s cache per camera; results go to `cameras.status`/`status_checked_at`. Internal addresses (loopback, private, link-local, CGNAT…) are refused both there and when a camera is saved (MediaMTX dials `rtsp_url` too); `mediamtx-sync/src/hostGuard.ts` keeps such cameras out of MediaMTX as a second barrier. The old standalone `camera-status-api` (public, unauthenticated TCP checker on 3011, plus `check.campax.com.br` on the old server) was removed on 2026-09-23 — see `docs/multiempresa/07-camera-status.md`.

### Data Flow

```
Admin → React Frontend → backend (Express/Prisma API, JWT auth) → local PostgreSQL
                              ↓                                          ↓
                    mediamtx-sync (polls every 30s or webhook)   Socket.IO (presence, homenagens)
                              ↓
                    MediaMTX streaming server
                              ↓
          Public visitor (token lookup) → WebRTC/HLS stream
```

### Database Schema

Lives in a local PostgreSQL 17 instance (`campax` DB) on this VPS, modeled in `backend/prisma/schema.prisma` (introspected from the DB with `prisma db pull`, then hand-adjusted — see comments in that file). Key tables:

- **cameras** — `id`, `nome`, `rtsp_url`, `ativo`, `mediamtx_path` (set by sync service)
- **velorios** — `nome_falecido`, `token_acesso` (6 chars, unique), `status` (Agendado/Ao Vivo/Encerrado — informational only; the UI actually derives live status from `data_inicio`/`data_fim`, see `getVelorioStatus` in `useVelorios.ts`), `sala_velorio_id` (FK to `sala_velorio`)
- **sala_velorio** / **sala_velorio_cameras** — a physical velório room and its assigned cameras; a `velorio` belongs to one `sala_velorio`
- **empresas** — one row per funeral home (tenant): `nome_exibicao`, `slug` (MediaMTX path prefix, future subdomain), `hash_publico` (prefix of public per-sala links), branding (`logo_url`, `cor_primaria`, `cor_secundaria`), `ativo`. `cameras`, `sala_velorio`, `velorios`, `velorio_access_logs`, `terms_acceptances` have `empresa_id NOT NULL`; `homenagens_templates.empresa_id` NULL = global template; child tables (`velorio_cameras`, `sala_velorio_cameras`, `velorio_homenagens`, `velorio_visitantes`) inherit through their parent. Composite FKs keep velório↔sala and access log↔velório in the same empresa. Multi-empresa work is on branch `feat/multiempresa`, specs in `docs/multiempresa/`.
- **profiles** — admin/staff accounts: `email` (globally unique), `password_hash` (bcrypt), `role` (platform_admin/superadmin/admin/operador/viewer), `is_active`, `empresa_id` (NULL only for `platform_admin`, enforced by a CHECK). This is the only user table — there is no separate `auth.users` schema. `platform_admin` is created only via `npm run create-platform-admin -- --email ...`.
- **velorio_access_logs** — Public access tracking (IP captured server-side, user agent, timestamp)
- **velorio_visitantes**, **velorio_homenagens**, **homenagens_templates**, **terms_acceptances** (append-only, LGPD) — as before

There is no separate audit table: `/admin/relatorios/auditoria` is powered by `velorios.created_by` joined against `profiles` (see `GET /velorios/audit` in `backend/src/routes/velorios.ts`).

### Auth & access control

Admins log in with email/password (`POST /auth/login`) and get a JWT (`jsonwebtoken`, 7-day expiry) that the frontend stores in `localStorage` and sends as `Authorization: Bearer <token>`. Every authenticated route is gated by `backend/src/auth/middleware.ts`: `requireAuth` loads the profile **and its empresa** from the DB on every request (a suspended empresa → 403 immediately), and `requireRole(role)` applies the hierarchy `platform_admin(5) > superadmin(4) > admin(3) > operador(2) > viewer(1)`. **Company routers must use `router.use(tenantGuard(minRole))`**, which also rejects `platform_admin` and sets `req.db` — a Prisma client extension (`src/tenant/prismaForEmpresa.ts`) that filters every read/write by the caller's empresa (records of another empresa behave as missing → 404), forces `empresa_id` on create, and filters child tables through their parent. Only the files listed in `backend/test/no-raw-prisma.test.ts` may import the raw `prisma`. Request bodies go through `pick(body, *_FIELDS)` from `src/lib/http.ts` (never `data: req.body`), and errors through `handleError`. Linking records across tables (cameras to a sala, sala to a velório) calls `assertPertence` first. Isolation is covered by `backend/test/isolamento/` (two populated empresas, user of A aiming at B). Public (unauthenticated) endpoints live under `/public/*` — e.g. `GET /public/velorios/:token` for token-based visitor access, `POST /public/velorios/:id/homenagens` — and are the only way the public site touches the backend. Subdomínio por funerária (spec 08): `POST /auth/login` takes an optional `empresa_slug` — a login for another empresa or for `platform_admin` gets the same wrong-password 401; `GET /public/velorios/:token` takes an optional `?empresa=<slug>` — a token from another empresa 404s as if it didn't exist.

### Frontend Routes

```
/                          → PublicAccess (token entry)
/velorio/:id               → VelorioViewing (stream page, public)
/:hashEmpresa/:salaSlug     → SalaPublicLink (fixed public link per sala — shows current/next velório, links to token entry; hash = empresas.hash_publico)
/:salaSlug                 → SalaPublicLink (subdomain only, spec 08 — same page without the hash; on the generic address a one-segment URL still falls through to NotFound)
/admin                     → AdminLogin
/admin/dashboard           → AdminDashboard (protected)
/admin/cameras             → CameraManagement (protected)
/admin/velorios            → VelorioManagement (protected)
/admin/relatorios          → ReportsHub (protected)
/admin/relatorios/acessos  → AccessReports (protected)
/admin/relatorios/auditoria → VelorioAudit (protected)
/platform                  → PlatformEmpresas (platform_admin only — funerárias, uso, suspend/reactivate)
/platform/empresas/nova    → PlatformEmpresaNova (empresa + first superadmin)
/platform/empresas/:id     → PlatformEmpresaDetalhe (dados, identidade visual, usuários, uso)
/platform/modelos-homenagem → PlatformModelos (global homenagem templates)
```
`/admin/*` routes use `ProtectedRoute` with the default `scope="empresa"` (platform_admin is redirected to `/platform`); `/platform*` use `scope="platform"`. The backend side is `backend/src/routes/platform.ts` (`requirePlatformAdmin`, raw prisma across empresas; slug and hash_publico are immutable). On an empresa subdomain (`HOST_SLUG` set, spec 08), `/platform/*` redirects to `/admin` instead.

### Frontend Structure

- `src/pages/` — Route-level components
- `src/hooks/` — TanStack Query hooks per entity (`useVelorios`, `useCameras`, `useAuth`, `useAccessLogs`, `useVelorioAudit`)
- `src/services/` — `accessLogsService.ts`, `cameraStatusService.ts`, `velorioAuditService.ts`
- `src/components/ui/` — shadcn/ui components (do not edit)
- `src/lib/apiClient.ts` — thin fetch wrapper for the `backend/` REST API (JWT bearer token, base URL from `VITE_API_URL`)
- `src/lib/socket.ts` — Socket.IO client singleton (presence counts, live homenagem updates)
- Branding: public pages call `useBranding(empresa)` (`src/hooks/useBranding.ts` + `src/lib/branding.ts`), which overrides the `--gold*`/`--navy*` CSS tokens with the funerária's `cor_primaria`/`cor_secundaria` while mounted (text color picked by contrast; `--gold-foreground` is the text on gold buttons) and removes them on unmount; `<EmpresaLogo>` falls back to the Campax logo. The admin panel shows the empresa's logo/name but keeps Campax colors. `useAuth()` exposes `empresa` (from `/auth/me`) and `isPlatformAdmin`; `ProtectedRoute` takes `scope="empresa" | "platform"`.

`@/` maps to `./src/` (configured in `tsconfig.json` and `vite.config.ts`).

### mediamtx-sync Internals

Path names are `<empresa slug>-<10 random [a-z0-9]>` (`paths.ts`), generated once and stored in `cameras.mediamtx_path` (with `webrtc_url`) — unguessable and never derived from the camera name. `planSync` (`plan.ts`, pure) compares active cameras of active empresas with `GET /v3/config/paths/list` and returns add / update-source (a changed `rtsp_url` is PATCHed) / remove; only paths matching the managed pattern are ever removed (`all_others` and manual config are left alone). A failed DB or MediaMTX read aborts the cycle. `npm run rotate-paths [-- --apply]` replaced the legacy city-name paths (2026-09-23).

## Port Reference

| Service | Port |
|---------|------|
| Frontend | 8080 |
| backend (main API + Socket.IO) | 3003 (dev); 3013 in production (PM2), see Deployment |
| mediamtx-sync | 3002 |
| MediaMTX RTSP input | 8554 |
| MediaMTX HLS | 8888 |
| MediaMTX WebRTC | 8889 |
| MediaMTX API | 9997 |
| PostgreSQL (local, `127.0.0.1` only) | 5432 |

## Environment Variables

**Frontend (`.env`):** `VITE_API_URL` (backend base URL, defaults to `http://localhost:3003`), no per-empresa settings — the public per-sala link prefix (`/:hashEmpresa/:salaSlug`) is each empresa's `hash_publico`, resolved by the backend (`GET /public/empresas/:hash/salas/:slug`); the original `VITE_EMPRESA_HASH` value (`d2788b07`) became the initial empresa's `hash_publico`, so links already handed out keep working. `VITE_BASE_DOMAIN` (spec 08, subdomínio por funerária) — e.g. `campax.com.br`; baked in at build time, empty = subdomains off and the app behaves exactly as before. `src/lib/hostEmpresa.ts` derives `HOST_SLUG` from `location.hostname` (one level under `VITE_BASE_DOMAIN`, not a reserved slug); in dev, `?empresa=<slug>` simulates it.

**backend (`backend/.env`):** `DATABASE_URL` (local Postgres connection string), `JWT_SECRET`, `JWT_EXPIRES_IN` (default `7d`), `PORT` (default 3003), `FRONTEND_ORIGIN` (CORS + Socket.IO allowed origins, comma-separated — production lists `https://app2.campax.com.br`, `http://app2.campax.com.br` and the raw-IP `http://2.29.41.124:8080`), `BASE_DOMAIN` (spec 08 — e.g. `campax.com.br`; empty = subdomains off, no `https://<slug>.<BASE_DOMAIN>` origin is ever accepted). `backend/src/lib/empresaHost.ts` holds `BASE_DOMAIN`/`FRONTEND_ORIGIN`/`corsOrigin` (the `CorsOrigin` type shared by Express `cors()` and Socket.IO) and the reserved-slug lists.

**mediamtx-sync (`mediamtx-sync/.env`):** `DATABASE_URL` (same local Postgres as backend), `MEDIAMTX_BASE_URL` (HTTP), `MEDIAMTX_API_PORT`, `MEDIAMTX_WEBRTC_BASE_URL` (HTTPS via reverse proxy), `MEDIAMTX_USER`, `MEDIAMTX_PASSWORD`, `PORT`, `SYNC_INTERVAL`

## Deployment

Production runs via PM2 (`ecosystem.config.cjs`) with 3 apps: `campax-frontend-velorio` (serves `dist/` via `server.cjs`), `campax-backend-velorio` (runs `backend/dist/index.js`, port 3013), and `campax-sync-velorio` (runs `mediamtx-sync/dist/index.js`). Logs go to `/root/campax/logs/`. See `docs/linux-deployment.md` for full setup.

**backend runs under PM2 despite the known PM2 v6 Go-proxy bug** (PM2 v6.0.14's internal Go cluster proxy routed ~50% of requests to an invalid target for the old camera-status-api, which is why that service had moved to systemd on 2026-08-06) — put there 2026-09-16 on explicit user request, accepting that risk in exchange for a single process manager, rather than the systemd path this doc previously recommended. If the backend starts showing intermittent 404s/timeouts under load the way `camera-status-api` did, that bug is the first thing to rule out; moving it to systemd (a plain `campax-backend.service` running `node dist/index.js` with `WorkingDirectory=/root/campax/backend` and `Restart=always`) is the known fix — the old `campax-cam-status.service` it used to be modeled on was deleted on 2026-09-26.

**Public domains (set up 2026-09-23, this VPS is `2.29.41.124`)**, both proxied by nginx-proxy-manager with SSL (Let's Encrypt):

| Domain | Forwards to |
|--------|-------------|
| `https://app2.campax.com.br` | frontend, `2.29.41.124:8080` |
| `https://backend.campax.com.br` | backend, `2.29.41.124:3013` (Websockets Support on, for Socket.IO) |
| `https://media2.campax.com.br` | MediaMTX WebRTC, `2.29.41.124:8889` — this is `MEDIAMTX_WEBRTC_BASE_URL`, so `cameras.webrtc_url` points here (the old `media.campax.com.br` still resolves to the old server `77.42.69.91`) |
| `https://apicam.campax.com.br` | MediaMTX admin API, `2.29.41.124:9997` (HTTP Basic auth, same `MEDIAMTX_USER`/`MEDIAMTX_PASSWORD`). For external/manual use only: `mediamtx-sync` runs on this VPS and keeps calling `http://localhost:9997` directly |
| `https://<slug>.campax.com.br` (live since 2026-09-26) | frontend, `2.29.41.124:8080` — wildcard: Cloudflare `*` A record (DNS only) + a `*.campax.com.br` Let's Encrypt certificate issued by DNS challenge in nginx-proxy-manager (Cloudflare API token, DNS-edit on this zone only, stored only in NPM; auto-renews). Any new empresa's slug works immediately, no DNS/cert step. Exact hosts above take precedence over the wildcard. Frontend `VITE_BASE_DOMAIN="campax.com.br"`. The initial empresa is `senap` (`senap.campax.com.br`) |

The frontend's `.env` has `VITE_API_URL="https://backend.campax.com.br"` — it is baked in at build time, so changing it requires `npm run build` + `pm2 restart campax-frontend-velorio`. Both must stay HTTPS, or the browser blocks API calls as mixed content. **The rest of the cutover is still pending**: data freshness re-sync from Supabase Cloud, admin password rotation, and turning Supabase Cloud off for real — requires explicit sign-off.

**Backups:** `scripts/backup-db.sh` (`pg_dump -Fc` of `campax` into `/root/backups/campax/`, 14-day retention) runs daily at 06:30 UTC (03:30 Brasília) from `/etc/cron.d/campax-backup`, logging to `logs/backup.log`; run it by hand before any deploy that migrates the schema. `scripts/restore-check.sh [file]` restores a dump into a throwaway DB and compares row counts with production — first run 2026-09-23, all tables identical.

