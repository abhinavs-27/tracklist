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
npm run test:e2e         # Playwright (requires dev server running on port 3000)
npm run test:unit        # Vitest

# Background workers
npm run worker:spotify-enrich   # BullMQ Spotify enrichment worker
npm run worker:sqs              # AWS SQS worker

# Lambda builds (for AWS)
npm run build:lambda:billboard-scheduler
npm run build:lambda:taste-snapshot
npm run build:lambda:enrich-drain

# Backfills / one-off scripts
npm run backfill:album-art
npm run backfill:taste-snapshots
npm run backfill:blind-spots
npm run merge-catalog           # merge duplicate catalog entries

# Mobile
cd mobile && npx expo start
```

## Architecture

Three deployment tiers:
1. **Next.js 16 App Router** (port 3000) — primary web frontend + API routes under `app/api/`
2. **Express API** (`backend/`) (port 3001) — for mobile and split deployments; proxied via `API_BACKEND_URL` in `middleware.ts`
3. **Expo mobile app** (`mobile/`) — React Native 0.83, Expo Router 55, Supabase Auth with Google OAuth

**Proxy warning**: Setting both `API_BACKEND_URL` and `NEXT_API_FALLBACK` creates an infinite proxy loop. For web-only dev, leave `API_BACKEND_URL` unset so Next.js serves `/api/*` directly.

### Key Directories

| Path | Purpose |
|------|---------|
| `app/api/` | 40+ Next.js Route Handlers (auth, logs, feed, social, spotify, discover, communities, cron, me-endpoints) |
| `app/api/me/` | Authenticated self-endpoints: `billboard`, `billboard-drop`, `blind-spots`, `history-bundle`, `home-bundle`, `listening-report`, `profile-bundle`, `pulse`, `taste-insights`, `taste-timeline` |
| `components/` | 70+ React UI components organized by feature |
| `lib/` | Server-side utilities, Supabase queries, Spotify integration, feed/chart/community logic |
| `lib/queries.ts` | Primary Supabase query helpers (~137K lines) |
| `lib/spotify-cache.ts` | Spotify catalog caching and enrichment (~99K lines) |
| `lib/artist-db-feed.ts` | Artist DB helpers shared by Next.js routes: `fetchArtistAlbumsFromDb`, `fetchArtistTracksFromDb`, `fetchArtistViewerStats`, `fetchArtistRecentListens` |
| `lib/feed/` | Feed generation: `merged-feed.ts`, `generate-events.ts`, `legacy-feed-bundle.ts` |
| `lib/profile/` | Profile data: cached taste identity, pulse, blind spots, timeline, insights, weekly narrative, listening report |
| `lib/community/` | Invites, consensus rankings, hidden gems, leaderboards, weekly summaries |
| `lib/charts/` | Weekly/monthly/yearly chart computation, narratives, entity guards |
| `lib/jobs/` | BullMQ queue setup and job handlers (Spotify enrichment, billboard scheduling) |
| `lib/taste/` | Taste vector, cosine similarity, taste matching, listening insights, user matches |
| `lib/lastfm/` | Last.fm import, dedup, Spotify mapping, enrichment, sync (27 files) |
| `lib/catalog/` | Entity resolution, canonical merging, image upgrades, catalog warm-up |
| `lib/social/` | Taste comparison, social threads, send-back recommendations |
| `lib/auth/` | `requireApiAuth.ts` (dual-auth: NextAuth cookie + Supabase Bearer), `get-session.ts`, utils |
| `packages/spotify-client/` | Workspace package: shared Spotify HTTP client + Bottleneck rate limiting + circuit breaker |
| `supabase/migrations/` | 161 ordered SQL migrations |
| `tests/` | Playwright E2E specs (35 files) |
| `backend/routes/` | Express route handlers (20 files): albums, artists, comments, discover, explore, feed, follow, leaderboard, lists, notifications, reviews, search, songs, spotify, users, etc. |

### Supabase Clients

Two clients — never mix them up:

- **`lib/supabase-server.ts`** → re-exports `createSupabaseServerClient()` from `lib/supabase/server.ts`. Uses the **anon key + cookies**. Respects RLS. Use in Route Handlers and Server Components.
- **`lib/supabase-admin.ts`** → re-exports `createSupabaseAdminClient()` from `lib/supabase/server.ts` (alias for `createSupabaseServiceRoleClient`). Uses the **service role key**. Bypasses RLS. Only for crons, workers, admin ops — never expose to browser.

### Authentication — Dual Auth

Both auth providers resolve to the same `User` type from `public.users`. The `withHandler` wrapper and `requireApiAuth` handle both transparently:

1. **NextAuth (web)** — cookie-based session from Google OAuth. `getSession()` reads the NextAuth JWT; user is looked up or auto-created in `public.users` by email.
2. **Supabase JWT (mobile)** — Bearer token in `Authorization` header. `requireApiAuth` calls `supabase.auth.getUser(token)` with the service role client to verify, then looks up the user in `public.users`.

`getUserFromRequest()` (non-throwing) tries NextAuth first, then Bearer. `requireApiAuth()` (throwing) does the same but returns `UnauthorizedError` if both fail.

User IDs live in `public.users`, not `auth.users`. Any FK involving `user_id` references `public.users.id`.

### API Handler Pattern

All Route Handlers use `withHandler` from `lib/api-handler.ts`:

```ts
export const GET = withHandler(
  async (request, { user, params }) => {
    // user is populated if requireAuth: true
    return apiOk(data);
  },
  { requireAuth: true },  // or false for public endpoints
);
```

`withHandler` resolves params (handles both sync and async Next.js 15+ params), injects auth, and catches `UnauthorizedError` and generic errors uniformly.

### API Response Helpers

All Route Handlers use `lib/api-response.ts`:

```ts
apiOk(data)                    // 200
apiNoContent()                 // 204
apiBadRequest(msg)             // 400
apiUnauthorized(msg?)          // 401
apiForbidden(msg?)             // 403
apiNotFound(msg)               // 404
apiConflict(msg)               // 409
apiTooManyRequests(msg?)       // 429
apiServiceUnavailable(msg?)    // 503
apiInternalError(e)            // 500 — logs real error, returns generic message
```

### Middleware (`middleware.ts`)

Handles three concerns in sequence:

1. **Maintenance mode**: Returns a 503 HTML page if `MAINTENANCE_MODE=1|true|yes`
2. **Onboarding gate**: Reads the NextAuth JWT (no DB hit) — redirects signed-in users with `onboarding_completed: false` to `/onboarding`. Skips: `/onboarding`, `/api/*`, auth paths, static assets.
3. **Express proxy**: If `API_BACKEND_URL` is set, forwards browser `/api/*` requests to Express. Some paths are excluded from proxying (onboarding, auth, spotify callback, static).

### Spotify Integration (Two Layers)

1. **Catalog** (search, metadata): client credentials flow, DB-first reads. Network fallback enabled only when `SPOTIFY_NETWORK_FOR_CATALOG_READS=1`. `packages/spotify-client/` has circuit breakers and a Redis-backed SWR in-memory cache capping 5,000 entries.
2. **User OAuth**: connect/sync recently-played, gated by `ENABLE_SPOTIFY_INTEGRATION` (server) and `NEXT_PUBLIC_ENABLE_SPOTIFY` (client).

Rate limiting via three Bottleneck instances in `packages/spotify-client/`: main API, artist albums, and user albums. All share an optional Redis connection for distributed coordination across serverless instances.

### Last.fm

Tracks not matched to Spotify get synthetic `lfm:<hash>` IDs. Enriched asynchronously via BullMQ or inline fallback. `lib/lastfm/` (27 files) handles import, dedup, Spotify mapping, enrichment, and scheduled sync.

### Feed Architecture

The home feed merges three sources via `lib/feed/merged-feed.ts`:
- **Activity feed**: reviews, follows, listens — via `getActivityFeed()` with RLS-respecting server client
- **Feed events**: `feed_events` table, read via admin client for enrichment
- **Stories**: aggregated listening narratives (discovery, streaks, binges, etc.)

Redis stale-first caching wraps the enriched output in `lib/feed.ts` to reduce repeated DB load. TanStack Virtual (`components/feed-list-virtual.tsx`) handles the web feed list for large scroll positions.

### Redis (Optional)

Not required — everything degrades to per-process memory. When `REDIS_URL` is set, it powers:
- Stale-while-revalidate API caching (`lib/redis-client.ts`)
- Community endpoint cache (`lib/cache/community-endpoint-cache.ts`)
- Discover/trending/rising/hidden gems cache (`lib/discover-cache.ts`)
- Spotify client shared rate limits + SWR
- BullMQ job queue (`lib/jobs/`)

### Cron Jobs

Cron endpoint handlers live under `app/api/cron/` (27 subdirectories). All are protected by `CRON_SECRET` (Bearer token). `vercel.json` currently has `crons: []` — schedules must be configured manually in the Vercel dashboard or re-added to `vercel.json`. Key endpoints:

| Endpoint | Purpose |
|----------|---------|
| `/api/cron/refresh-stats` | Entity stats + discovery materializations |
| `/api/cron/lastfm-sync` | Last.fm scrobble import |
| `/api/cron/listening-aggregates` | Roll logs into aggregates |
| `/api/cron/community-feature-weekly` | Weekly community summary |
| `/api/cron/weekly-charts` | Compute global weekly charts |
| `/api/cron/weekly-charts-users` | Per-user chart computation |
| `/api/cron/taste-identity-refresh` | Refresh taste identity vectors |
| `/api/cron/compute-cooccurrence` | Co-occurrence matrix for recommendations |
| `/api/cron/spotify-enrichment-retry` | Retry failed Spotify enrichment jobs |
| `/api/cron/feed-events-sync` | Sync feed events from log activity |

### Taste System

`lib/taste/` (12 files) builds user taste profiles:
- `taste-identity.ts` — derives genre/artist affinity vectors from logs
- `buildTasteVector.ts` + `cosineSimilarity.ts` — vector math for user matching
- `taste-match.ts` + `getUserMatches.ts` — find compatible users
- `listening-insights.ts` — discovery style, arc analysis, diversity/obscurity scores
- Results cached via `unstable_cache` (90s TTL) in `lib/profile/cached-profile-data.ts`

### Community Features

`lib/community/` is large (~50 files). Key concepts:
- **Invite links**: signed URLs stored in `community_invite_links` with reusable tokens
- **Consensus rankings**: community-agreed best tracks/albums per period
- **Hidden gems**: low-listener tracks loved by the community
- **Weekly summaries**: auto-generated per community via cron

---

## Mobile App

### Architecture

The mobile app (`mobile/`) is built with Expo 55, Expo Router, and TanStack Query. It talks to the same API endpoints as the web (Next.js routes + Express backend), authenticating with Supabase Bearer tokens.

### Mobile Directory Structure

```
mobile/
  app/
    (auth)/         # login screen
    (tabs)/         # main tab navigator
      index.tsx     # home (Billboard, Pulse, History, Activity tabs)
      explore.tsx   # discovery hub
      discover.tsx  # trending/rising
      leaderboard.tsx
      notifications.tsx
      profile.tsx
      album/[id].tsx
      artist/[id]/index.tsx, albums.tsx
      song/[id].tsx
      user/[username]/index.tsx, lists.tsx
      communities/  # list, detail, invites, new
      list/[id].tsx
      reviews/[entityType]/[entityId].tsx
      search/       # search + user search
    _layout.tsx     # QueryClient, AuthProvider, RootLayoutNav
  components/       # 30+ mobile-specific components organized by feature
  lib/
    api.ts          # fetcher() with in-memory token cache
    persistent-cache.ts  # AsyncStorage-backed SWR cache
    auth-provider.tsx    # Supabase auth state listener
    offline-log-queue.ts # AsyncStorage queue for offline log POSTs
    hooks/          # 27 hooks (useAlbum, useArtist, useSong, useFeed, usePrefetch, ...)
    types/          # TypeScript types for feed, logs, lists, explore, etc.
```

### Mobile API Client (`mobile/lib/api.ts`)

`fetcher<T>(path, init?)` is the single HTTP client. Key behaviors:
- **Token caching**: calls `supabase.auth.getSession()` **once** at startup into a module-level `_cachedToken`. Subsequent calls read from memory. Token is refreshed instantly via `onAuthStateChange`.
- Adds `Authorization: Bearer {token}` header automatically.
- Validates `Content-Type: application/json` on response — throws a descriptive error if the server returns HTML (e.g. a 503 maintenance page).
- `EXPO_PUBLIC_API_URL` must be set — the base URL for all API calls.

### Mobile Persistent Cache (`mobile/lib/persistent-cache.ts`)

Eliminates cold-start loading spinners by showing stale data immediately while revalidating in background.

```ts
readCache<T>(key)           // synchronous — reads in-memory mirror
writeCache(key, value)      // writes memory immediately + flushes to AsyncStorage async
```

**Pre-warming**: static keys (`homeBundle`, `homeHistoryBundle`) are loaded from AsyncStorage at module import time — before the home screen mounts. Dynamic keys (`artistDetailBundle(id)`, `albumSocialBundle(id)`) are warmed on first write.

Used as TanStack Query `initialData` with `initialDataUpdatedAt: 0` so it shows instantly but immediately triggers a background refetch.

### Prefetch-on-Press (`mobile/lib/hooks/usePrefetch.ts`)

Navigation-speed optimization. The gap between `onPressIn` (finger down) and screen render is ~300-400ms — enough for an API fetch to complete.

```ts
usePrefetchAlbum()    // prefetches /api/albums/:id + /api/albums/:id/social-bundle
usePrefetchArtist()   // prefetches /api/artists/:id + /api/artists/:id/detail-bundle
usePrefetchSong()     // prefetches /api/songs/:id
usePrefetchProfile()  // prefetches /api/users/:username
```

Wired into `onPressIn` on Pressable elements in: `FeedItem` (album cards, review entity links, user avatars), home Pulse tab (artist/album cards), artist page (album grid, track rows, recent listen items), and `MediaGrid` via `onPressInItem` prop.

### Mobile Bundle Endpoints

These consolidate multiple parallel requests into one, eliminating round-trips:

| Endpoint | Mobile Hook | Replaces |
|----------|-------------|---------|
| `GET /api/me/home-bundle` | `useHomeBundle()` | `/api/me/billboard` + `/api/me/pulse` |
| `GET /api/me/history-bundle` | `useHomeHistoryBundle()` | `/api/me/blind-spots` + `/api/me/listening-report` + `/api/me/taste-timeline` + `/api/me/taste-insights` |
| `GET /api/artists/:id/detail-bundle` | `useArtistDetailBundle()` | `/api/artists/:id/viewer-stats` + `/api/artists/:id/leaderboard` + `/api/artists/:id/recent-listens` + `/api/artists/:id/reviews` |
| `GET /api/albums/:id/social-bundle` | `useAlbumSocialBundle()` | `/api/albums/:id/my-review` + `/api/albums/:id/leaderboard` + `/api/albums/:id/friend-activity` |
| `GET /api/me/profile-bundle` | (own profile path in `useProfile`) | user row + favorites + lists + recent albums |
| `GET /api/users/me` | (own profile base fetch) | profile user + follow counts + streak |

### Mobile Auth Flow

1. App starts → `_layout.tsx` renders `AuthProvider` wrapping `RootLayoutNav`
2. `AuthProvider` runs `useAuthStateListener()` — subscribes to Supabase auth state changes
3. `useAuth()` queries the session with `staleTime: Infinity`; all data hooks gate on `!!session && !authLoading`
4. `RootLayoutNav` redirects unauthenticated users to `/(auth)/login`, authenticated users away from auth screens

### Mobile Notable Patterns

- **`OfflineLogFlush`**: drains any legacy offline log queue from AsyncStorage on launch/resume — handles logs created while the device had no network.
- **`OAuthLinkingHandler`**: deep-link handler for Supabase OAuth callback after Google sign-in.
- **`expo-image` everywhere**: all image components use `expo-image` (not React Native's `Image`) for persistent disk cache across sessions.
- **`MediaGrid`**: supports `onPressInItem` for prefetch-on-press alongside `onPressItem` for navigation.
- **`stale-session-cache`** (from `lib/client/stale-session-cache.ts`): web-only (uses `sessionStorage`). On mobile, use `persistent-cache.ts` instead.

---

## Testing

### E2E (Playwright)
- 35 test files in `tests/`, covering auth, logging, feed, social, charts, communities, search, Spotify integration
- Config in `playwright.config.ts`: Chrome only, 1 worker, screenshots + traces on failure
- Mobile viewport tests in `mobile-viewport.spec.ts` (iPhone 14 — 390×844)
- Base URL: `http://127.0.0.1:3000` or `PLAYWRIGHT_TEST_BASE_URL`
- Dev server auto-started with `NEXT_PUBLIC_E2E=1` if not already running

### Unit (Vitest)
- Focused on API response validation, feed logic, Spotify sync, and utility functions
- Key files: `api-response.test.ts`, `api-utils.test.ts`, `critical-flows-integration.test.ts`, `spotify-sync.test.ts`, `validation.test.ts`

---

## Key Environment Variables

### Web / Server

```
# Auth
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
NEXTAUTH_SECRET, NEXTAUTH_URL          # NEXTAUTH_URL=http://127.0.0.1:3000 for local dev
PUBLIC_APP_URL                         # canonical origin for emails/invites (production)

# Supabase — both naming conventions work; short form preferred for server, NEXT_PUBLIC_* for browser
SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)
SUPABASE_SERVICE_ROLE_KEY

# Spotify
SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET
SPOTIFY_REDIRECT_URI                   # e.g. http://127.0.0.1:3000/api/spotify/callback
NEXT_PUBLIC_ENABLE_SPOTIFY=false       # show Spotify UI
ENABLE_SPOTIFY_INTEGRATION=false       # allow Spotify OAuth + sync
SPOTIFY_NETWORK_FOR_CATALOG_READS=1   # allow network calls for catalog enrichment
SPOTIFY_DISABLE_FOR_LASTFM_IMPORT     # block Spotify during Last.fm import

# Last.fm
LASTFM_API_KEY                         # public API key; get at last.fm/api/account/create
TRACKLIST_DEBUG_LASTFM_MAPPING=1      # verbose mapping logs

# Infrastructure
REDIS_URL                              # optional; full URL e.g. redis://:pass@host:6379
RESEND_API_KEY, RESEND_FROM           # email delivery
CRON_SECRET                           # Bearer token for /api/cron/* protection
MAINTENANCE_MODE=1                    # site-wide 503

# Proxy (do NOT set both — proxy loop)
API_BACKEND_URL=http://127.0.0.1:3001  # Next.js → Express (set in Next env)
NEXT_API_FALLBACK=http://127.0.0.1:3000 # Express → Next.js fallback (set in Express env)

# Feature flags
NEXT_PUBLIC_FEATURE_SOCIAL_INBOX_MUSIC_REC_UI=1  # re-enable social inbox + music rec UI
NEXT_PUBLIC_E2E=1                      # E2E test mode (disables some rate limits)
MIDDLEWARE_DEBUG=1                     # log middleware timing (dev only)
```

### Mobile (Expo — all prefixed `EXPO_PUBLIC_`)

```
EXPO_PUBLIC_API_URL                    # base URL for API calls (required)
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
EXPO_PUBLIC_SUPABASE_OAUTH_REDIRECT_URL
EXPO_PUBLIC_ENABLE_SPOTIFY=false
EXPO_PUBLIC_HIDE_SPOTIFY_PROFILE
EXPO_PUBLIC_NATIVE_OAUTH_REDIRECT_URI
```

---

## Notable Patterns

### Server-side
- **`lib/profile/cached-profile-data.ts`**: Wraps expensive profile computations in `unstable_cache` with 90s TTL — taste identity, top-this-week, pulse, listening report. Multiple concurrent requests for the same user hit cache instead of DB.
- **`lib/charts/weekly-chart-entity-guards.ts`**: Client-safe synthetic ID checks — avoids importing `server-only` modules in UI components.
- **`lib/app-url.ts`**: Request origin helpers for invite/share links.
- **`lib/profiling.ts`**: `logPerf()` / `timeAsync()` for server-side timing in Route Handlers.
- **`lib/validation.ts`**: UUID, Spotify ID, Last.fm ID validation and string sanitization.
- **`scripts/register-server-only-stub.cjs`**: Stubs `server-only` for worker/CLI scripts that run outside Next.js.
- **`Promise.allSettled` everywhere**: Bundle endpoints and `HomeData` in `app/page.tsx` use `Promise.allSettled` so one failed sub-query never blocks the entire response.

### Mobile-specific
- **Persistent cache pattern**: `readCache()` is synchronous (in-memory) → passed as `initialData` to TanStack Query → background refetch fires immediately (`initialDataUpdatedAt: 0`). Net effect: instant UI paint on repeat visits with fresh data shortly after.
- **Prefetch on `onPressIn`**: Fires 300-400ms before screen render. For album pages: prefetches both the main album endpoint and the social bundle simultaneously.
- **`useHomeBundle`** fetches billboard + pulse in one request at the `HomeScreen` level, then passes data as props to both `BillboardTab` and `PulseTab` — prevents duplicate requests across tab switches.
- **Auth waterfall avoidance**: mobile data hooks all gate on `enabled: !!session && !authLoading` to avoid firing before auth resolves. Session itself has `staleTime: Infinity` so it never re-fetches after initial load.
- **TanStack Virtual** (`components/feed-list-virtual.tsx`, `album-favorited-by-modal.tsx`, `recently-played/page.tsx`): used wherever lists can grow unbounded.
- **Community invite links**: signed URLs stored in `community_invite_links` with reusable tokens.
