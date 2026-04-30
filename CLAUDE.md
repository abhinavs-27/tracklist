# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Tracklist is a music social media platform. Users log listens, rate albums/tracks, follow people, browse personalized feeds, discover trending music, compete on leaderboards, join communities, and optionally import Last.fm scrobbles mapped to the Spotify catalog.

## Commands

```bash
# Development
npm run dev              # Next.js dev server (port 3000)
npm run dev:backend      # Express API server (port 3001)
npm run typecheck        # tsc --noEmit
npm run lint             # ESLint

# Build & production
npm run build
npm start

# Testing
npm run test:e2e         # Playwright (requires dev server running)
npm run test:unit        # Vitest

# Background workers
npm run worker:spotify-enrich   # BullMQ Spotify enrichment worker
npm run worker:sqs              # AWS SQS worker

# Mobile
cd mobile && npx expo start
```

## Architecture

Three deployment tiers:
1. **Next.js 16 App Router** (port 3000) — primary web frontend + API routes under `app/api/`
2. **Express API** (`backend/`) (port 3001) — for mobile and split deployments; proxied via `API_BACKEND_URL` in `middleware.ts`
3. **Expo mobile app** (`mobile/`) — React Native, Expo Router, Supabase Auth with OAuth

**Warning**: Setting both `API_BACKEND_URL` and `NEXT_API_FALLBACK` creates a proxy loop. For web-only dev, leave `API_BACKEND_URL` unset.

### Key Directories

| Path | Purpose |
|------|---------|
| `app/api/` | 30+ Next.js Route Handlers (auth, logs, feed, social, spotify, discover, communities, cron) |
| `components/` | 70+ React UI components organized by feature |
| `lib/` | Server-side utilities, Supabase queries, Spotify integration, feed/chart/community logic |
| `lib/queries.ts` | Primary Supabase query helpers (~137K lines) |
| `lib/spotify-cache.ts` | Spotify catalog caching and enrichment (~99K lines) |
| `lib/feed/` | Feed generation, listen sessions, story aggregation |
| `lib/community/` | Invites, consensus, hidden gems, leaderboards |
| `lib/charts/` | Weekly/monthly/yearly chart computation |
| `lib/jobs/` | BullMQ queue setup and job handlers |
| `packages/spotify-client/` | Workspace package: shared Spotify HTTP client + Bottleneck rate limiting |
| `supabase/migrations/` | 140+ ordered SQL migrations |
| `tests/` | Playwright E2E specs |

### Supabase Clients

- `lib/supabase-server.ts` — Anon + cookies; use in Route Handlers and Server Components
- `lib/supabase-admin.ts` — Service role; use only in crons/jobs/admin ops; never expose to browser

### API Response Helpers

All Route Handlers use `lib/api-response.ts`:
```ts
apiOk(data)          // 200
apiBadRequest()      // 400
apiUnauthorized()    // 401
apiForbidden()       // 403
apiNotFound()        // 404
apiInternalError(e)  // 500 (logs real error, returns generic message)
```

### Spotify Integration (Two Layers)

1. **Catalog** (search, metadata): client credentials flow, DB-first reads with optional network fallback controlled by `SPOTIFY_NETWORK_FOR_CATALOG_READS`
2. **User OAuth**: connect/sync recently-played, gated by `ENABLE_SPOTIFY_INTEGRATION` (server) and `NEXT_PUBLIC_ENABLE_SPOTIFY` (client)

Rate limiting via three Bottleneck instances in `packages/spotify-client/`: main, artist albums, user albums. All share an optional Redis connection.

### Last.fm

Tracks not matched to Spotify get synthetic `lfm:<hash>` IDs. These are enriched asynchronously via the BullMQ queue or inline fallback. `lib/lastfm/` handles import, mapping, and enrichment.

### Redis (Optional)

Redis is not required but enables: stale-while-revalidate caching (`lib/redis-client.ts`), Spotify rate limit coordination, discover caching (`lib/discover-cache.ts`), and BullMQ jobs. Everything degrades gracefully to per-process memory without Redis.

### Middleware (`middleware.ts`)

Handles three concerns in sequence:
1. **Maintenance mode**: 503 if `MAINTENANCE_MODE=1`
2. **Express proxy**: forwards `/api/*` to `API_BACKEND_URL` if set
3. **Onboarding gate**: redirects users with incomplete profiles to `/onboarding` (JWT-based, no DB hit)

### Cron Jobs

8 Vercel crons defined in `vercel.json`. All protected with `CRON_SECRET` (Bearer token). Key ones:
- `0 0 * * *` `/api/cron/refresh-stats` — entity stats + discovery materializations
- `0 0 * * *` `/api/cron/lastfm-sync` — Last.fm scrobble import
- `20 1 * * *` `/api/cron/listening-aggregates` — roll logs into aggregates
- `15 3 * * 1` `/api/cron/community-feature-weekly` — weekly community summary

### Key Environment Variables

```
# Auth
NEXTAUTH_SECRET, NEXTAUTH_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET

# Supabase
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

# Spotify
SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET
NEXT_PUBLIC_ENABLE_SPOTIFY, ENABLE_SPOTIFY_INTEGRATION

# Optional
REDIS_URL, LASTFM_API_KEY, CRON_SECRET, API_BACKEND_URL, RESEND_API_KEY
MAINTENANCE_MODE  # set to 1 to enable site-wide 503
```

## Testing

Playwright E2E tests are in `tests/` and cover critical user flows (auth, logging, feed, communities). Config in `playwright.config.ts`: Chrome only, 1 worker, screenshots/traces on failure.

Vitest unit tests focus on API response validation, feed logic, and utility functions.

## Notable Patterns

- **`lib/charts/weekly-chart-entity-guards.ts`**: Client-safe synthetic ID checks — avoids importing `server-only` modules in UI components
- **`lib/app-url.ts`**: Request origin helpers for invite/share links
- **`lib/profiling.ts`**: `logPerf()` for server-side timing in Route Handlers
- **`lib/validation.ts`**: UUID, Spotify ID, Last.fm ID validation and string sanitization
- **`scripts/register-server-only-stub.cjs`**: Stubs `server-only` for worker/CLI scripts that run outside Next.js
- TanStack Virtual is used for the home feed to handle thousands of activities
- Community invite links are signed URLs stored in `community_invite_links` with reusable tokens
