# Tracklist

A **music social** web and mobile app: log listens, rate albums and tracks with reviews, follow people, browse a personalized feed, discover trending music, compete on leaderboards, join **communities** with shared activity and taste tools, and optionally import **Last.fm** scrobbles mapped to the **Spotify** catalog (including synthetic `lfm:*` track rows when no native Spotify id exists yet).

---

## Table of contents

1. [Architecture](#architecture)
2. [Repository layout](#repository-layout)
3. [Tech stack](#tech-stack)
4. [Prerequisites](#prerequisites)
5. [Quick start (web)](#quick-start-web)
6. [Environment variables](#environment-variables)
7. [Database & migrations](#database--migrations)
8. [Development workflows](#development-workflows)
9. [Optional: Express API (`backend/`)](#optional-express-api-backend)
10. [Optional: Expo mobile (`mobile/`)](#optional-expo-mobile-mobile)
11. [Feature overview](#feature-overview)
12. [Communities & social layer](#communities--social-layer)
13. [Last.fm & catalog enrichment](#lastfm--catalog-enrichment)
14. [API surface (Next.js)](#api-surface-nextjs)
15. [Background jobs, queues & Vercel crons](#background-jobs-queues--vercel-crons)
16. [Testing & quality](#testing--quality)
17. [Troubleshooting](#troubleshooting)
18. [Further reading](#further-reading)

---

## Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                         Browser / Expo                           │
└────────────────────────────┬────────────────────────────────────┘
                             │
         ┌───────────────────┴───────────────────┐
         │                                       │
         ▼                                       ▼
┌─────────────────┐                   ┌─────────────────┐
│  Next.js :3000  │                   │ Express :3001   │
│  App Router +   │   optional        │ Standalone API  │
│  app/api/*      │◄──middleware──────│ /api/*          │
└────────┬────────┘   API_BACKEND_URL  └────────┬────────┘
         │                                      │
         │         ┌────────────────────────────┘
         │         │  Unhandled routes proxy to Next (NEXT_API_FALLBACK)
         ▼         ▼
┌─────────────────────────────────────────────────────────────────┐
│ Supabase (PostgreSQL + RLS + RPC) + Spotify Web API             │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼ (optional)
┌─────────────────┐     BullMQ jobs (Spotify enrichment, etc.)
│     Redis       │     when REDIS_URL is set; otherwise many jobs
└─────────────────┘     run inline in the same Node process
```

- **Primary web app**: Next.js **App Router** on port **3000** (`npm run dev`). Most **`/api/*`** route handlers live under `app/api/`.
- **Auth**: **NextAuth** (Google) for the web; session is JWT-based. API routes use `getServerSession` / `requireApiAuth` as appropriate.
- **Data**: **Supabase** — `anon` + cookies for user-scoped server code, **service role** for admin/cron/Spotify tokens and jobs that bypass RLS.
- **Optional Express**: `backend/` serves **`/api/*`** for mobile and split deployments. When enabled, **Next middleware** can forward browser **`/api/*`** to Express (see [Optional: Express API](#optional-express-api-backend)).
- **Optional Redis**: **`REDIS_URL`** enables shared **API caches** (stale-first, community, discover sections), **Spotify client** shared limits/SWR, and **BullMQ** enrichment (`lib/jobs/spotifyQueue.ts`; run `npm run worker:spotify-enrich` in production). Without Redis, caches are per-instance memory and eligible work still runs **inline** (e.g. cron handlers).

---

## Repository layout

| Path | Purpose |
|------|---------|
| `app/` | Next.js routes, layouts, `app/api/*` route handlers |
| `components/` | React UI (web) |
| `lib/` | Server utilities: queries, Spotify cache, feed, auth, Last.fm ingest/ mapping, communities, discovery, analytics |
| `lib/ui/layout.ts` | Shared layout tokens (e.g. `pageWidthShell`, **`communityDesktop*`** community detail grid columns) |
| `lib/charts/weekly-chart-entity-guards.ts` | Client-safe checks for synthetic weekly chart `entity_id` values (avoids importing `server-only` modules from client chart UI) |
| `lib/app-url.ts` | Canonical app base URL + `getRequestOrigin()` (used for invite links and prod-safe URLs) |
| `middleware.ts` | Optional proxy of `/api/*` to Express when `API_BACKEND_URL` is set; maintenance mode (`MAINTENANCE_MODE`) |
| `packages/spotify-client/` | Workspace package: shared Spotify HTTP client + rate limiting (used by web) |
| `supabase/migrations/` | **Ordered** SQL migrations (apply all in sequence) |
| `backend/` | Express + TypeScript API (`npm run dev` → default **3001**) |
| `mobile/` | Expo (React Native) app — see `mobile/README.md` |
| `tests/` | Playwright E2E specs |

---

## Tech stack

| Layer | Choices |
|-------|---------|
| Web framework | **Next.js 16** (App Router), **React 19** |
| Styling | **Tailwind CSS 4** |
| Auth | **NextAuth v4** (Google OAuth) |
| Data | **Supabase** (`@supabase/supabase-js`, `@supabase/ssr`) |
| Server state (web) | **TanStack React Query v5** |
| Virtualized lists | **TanStack Virtual** (e.g. home feed) |
| Music APIs | **Spotify Web API** (OAuth + client credentials) |
| Scrobbles | **Last.fm** public API (optional) |
| Background jobs | **BullMQ** + **Redis** (optional) |
| E2E | **Playwright** |
| Analytics | Vercel Analytics & Speed Insights (optional) |

---

## Prerequisites

- **Node.js 18+** (Node **20+** recommended for `backend/`)
- **npm** (ships with Node)
- A **Supabase** project
- **Google Cloud** OAuth credentials (web sign-in)
- **Spotify** developer app (search, connect, catalog) — when integration flags are enabled
- **Optional**: **Redis** (`REDIS_URL`) for queued Spotify enrichment on production-like setups

---

## Quick start (web)

1. **Clone and install**

   ```bash
   git clone <repo-url>
   cd tracklist
   npm install
   ```

2. **Environment**

   ```bash
   cp .env.example .env
   ```

   Fill every required variable (see [Environment variables](#environment-variables)). The app commonly uses **`.env`** at the repo root (Next loads it automatically).

3. **Database**

   Apply **all** migrations in `supabase/migrations/` **in numeric order** (001, 002, …). Easiest: [Supabase CLI](https://supabase.com/docs/guides/cli) `supabase db push`, or run each file in the SQL Editor.

4. **Google OAuth**

   In [Google Cloud Console](https://console.cloud.google.com/), create OAuth 2.0 **Web** credentials:

   - **Authorized JavaScript origins**: `http://127.0.0.1:3000` (and production URL).
   - **Authorized redirect URIs**: `http://127.0.0.1:3000/api/auth/callback/google`.

5. **Spotify**

   In [Spotify Developer Dashboard](https://developer.spotify.com/dashboard), create an app:

   - Redirect URI for connect flow: `http://127.0.0.1:3000/api/spotify/callback` (must match `SPOTIFY_REDIRECT_URI` / `NEXTAUTH_URL`).

6. **Run**

   ```bash
   npm run dev
   ```

   Open **`http://127.0.0.1:3000`** (must match **`NEXTAUTH_URL`** host/port).

---

## Environment variables

Copy **`.env.example`** to **`.env`**. Critical entries:

| Variable | Role |
|----------|------|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | NextAuth Google provider |
| `NEXTAUTH_SECRET` | NextAuth encryption (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | Public app URL (e.g. `http://127.0.0.1:3000`). In production, set to your canonical domain (e.g. `https://tracklistsocial.com`). |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only** — crons, admin writes, `spotify_tokens`, jobs |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | Spotify app |
| `SPOTIFY_REDIRECT_URI` | Optional; default pattern `{NEXTAUTH_URL}/api/spotify/callback` |
| `SPOTIFY_DEBUG` | `1` or `true` — log each Spotify Web API call (path, HTTP status, ms) to **server** stdout; never logs access tokens. |

**Spotify** uses two layers (see `lib/spotify-integration-enabled.ts`):

| Layer | What it controls | When it works |
|-------|------------------|---------------|
| **Catalog** (search, album metadata, `spotifyFetch` client-credentials) | `SPOTIFY_CLIENT_ID` + `SPOTIFY_CLIENT_SECRET` | Independent of OAuth — search and metadata work with credentials only. |
| **User integration** (OAuth, logging, sync, quick log, ingest cron) | Feature flags below | Off unless explicitly enabled. |

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_ENABLE_SPOTIFY` | Client-visible gate for **linking Spotify / logging** |
| `ENABLE_SPOTIFY_INTEGRATION` | Server gate for OAuth routes, ingest, user-token APIs |
| `EXPO_PUBLIC_ENABLE_SPOTIFY` | Expo — Spotify account features on mobile |
| `EXPO_PUBLIC_DISABLE_SPOTIFY_CATALOG` | Set `true` to hide mobile search UX (rare; server still controls API) |

**Catalog reads vs Spotify network** (`lib/spotify/catalog-read-policy.ts`):

| Variable | Purpose |
|----------|---------|
| `SPOTIFY_NETWORK_FOR_CATALOG_READS` | Set to `1` to allow `getOrFetch*` helpers to **call Spotify on cache miss** in server contexts (workers, cron). Default unset: DB-only reads unless `allowNetwork` is passed (e.g. some song pages for `lfm:*` ids). |

**Spotify `GET /artists/{id}/albums` (paginated discography)** — Spotify uses **one app-wide** Web API quota (rolling window, ~30s); this endpoint is **not** on a separate limit. We still give it a **dedicated Bottleneck** bucket (`packages/spotify-client`) so long discography pagination doesn’t starve search/other catalog calls, and add a small **gap between pages** in `lib/spotify/getAllArtistAlbums.ts`. **`REDIS_URL`** coordinates Bottleneck across instances. Tune if needed:

| Variable | Purpose |
|----------|---------|
| `SPOTIFY_ARTIST_ALBUMS_MIN_TIME_MS` | Min spacing between those calls (Bottleneck). Default `450`. |
| `SPOTIFY_ARTIST_ALBUMS_RESERVOIR_PER_MIN` | Token bucket per minute for this route only. Default `20`. |
| `SPOTIFY_ARTIST_ALBUMS_PAGE_GAP_MS` | Extra pause after each paginated page in `getAllArtistAlbums` (ms). Default `400`. |

**Last.fm (optional)**

| Variable | Purpose |
|----------|---------|
| `LASTFM_API_KEY` | `user.getRecentTracks` for profile import + cron |
| `TRACKLIST_DEBUG_LASTFM_MAPPING` | `1` for verbose Last.fm→Spotify mapping logs (also in `NODE_ENV=development`) |

**Jobs & queues**

| Variable | Purpose |
|----------|---------|
| `REDIS_URL` | **Optional.** Single Redis URL (`redis://` or `rediss://` for TLS). Caches and Spotify SWR use one **shared** ioredis connection ([`lib/redis-client.ts`](lib/redis-client.ts)); discover keys are shared between Next ([`lib/discover-cache.ts`](lib/discover-cache.ts)) and Express ([`backend/services/discoverService.ts`](backend/services/discoverService.ts)) via [`lib/discover-redis.ts`](lib/discover-redis.ts). **BullMQ** (`lib/jobs/spotifyQueue.ts`) uses its own connection (`maxRetriesPerRequest: null`). Bottleneck passes the URL string and manages its own Redis clients. If unset, caches fall back to per-process memory where implemented. **Production:** run `npm run worker:spotify-enrich` for queued enrichment (see `scripts/spotify-enrich-worker.ts`). |

**Profiling (before adding more Redis / stale-first)**

| Approach | Purpose |
|----------|---------|
| Vercel Observability / Speed Insights | Find slow routes and cold starts in production. |
| [`lib/profiling.ts`](lib/profiling) `logPerf` | Server-side timings in route handlers and data loaders. |

Use these to justify new caching: avoid Redis-wrapping **user-specific** or **rapidly mutating** responses unless keys and TTLs are clear.

**Operations**

| Variable | Purpose |
|----------|---------|
| `CRON_SECRET` | Shared secret for `Authorization: Bearer` on some cron routes (see individual handlers). |
| `MAINTENANCE_MODE` | `1` / `true` / `yes` — site-wide 503 (see `middleware.ts`). |

**Split API (advanced)**

| Variable | Read by | Purpose |
|----------|---------|---------|
| `API_BACKEND_URL` | Next **`middleware.ts`** | If set, browser **`/api/*`** (except `/api/auth/*` and `/api/leaderboard`) is proxied to this origin (e.g. Express `http://127.0.0.1:3001`). |
| `NEXT_API_FALLBACK` | **Express** `backend/routes/index.ts` | If a path is not implemented in Express, proxy to this Next origin (default dev: `http://127.0.0.1:3000`). |

**Important:** Do **not** set **`API_BACKEND_URL`** for simple local web development unless you intentionally route the browser through Express. Combining **`API_BACKEND_URL`** with Express’s fallback to Next can create a **Next ↔ Express request loop** (hung pages, infinite loading). For **`npm run dev`** on the web app alone, **leave `API_BACKEND_URL` unset** so Next serves **`/api/*`** directly. Use **`NEXT_API_FALLBACK`** when running **`cd backend && npm run dev`** (e.g. mobile hitting port 3001). Details: `.env.example` comments.

---

## Database & migrations

- **90+ migrations** under `supabase/migrations/` — naming `NNN_description.sql` (apply in order).
- Skipping migrations will break RPCs, indexes, and features (feed sessions, entity stats, Last.fm columns, communities, listening aggregates, etc.).
- Notable areas: users/follows/logs/reviews/likes/comments, Spotify tokens & catalog cache, lists, notifications, achievements, streaks, materialized views for discover, `entity_stats` / leaderboards, Last.fm username + sync watermark, **feed events** (`feed_events`), **communities** (members, invites, feed, comments, consensus, hidden gems), **user listening aggregates** (`077`–`079`), **Last.fm aggregate repair RPCs** (`088`), **onboarding + invite links** metadata (`087`), mobile log fields, Expo push token, co-occurrence / recommendation helpers.

**Clients**

- **`lib/supabase-server.ts`** — anon key + cookies (Route Handlers, Server Components).
- **`lib/supabase-admin.ts`** — service role (bypass RLS); **never** expose to the browser.

---

## Development workflows

| Command | Description |
|---------|-------------|
| `npm run dev` | Next.js dev server (default **3000**) |
| `npm run build` | Production build |
| `npm start` | Run production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run test:e2e` | Playwright tests |
| `npm run dev:backend` | `npm run dev` in `backend/` (Express, default **3001**) |

**WebSocket / `/_next/webpack-hmr` errors in the console** — normal in **`next dev`**: that is **Hot Module Replacement**, not application WebSocket code. It can fail behind some proxies; production builds do not use it.

---

## Optional: Express API (`backend/`)

The **`backend/`** package is an **Express + TypeScript** server that mirrors or extends **`/api/*`** for **mobile** and split hosting.

- **Install / run**: `cd backend && npm install && npm run dev` (port **3001**).
- **Env**: Loads **`../.env`** then **`backend/.env`** (`server.ts`).
- **Proxy**: Unhandled routes forward to **`NEXT_API_FALLBACK`** (Next), default **`http://127.0.0.1:3000`** in development — **must** be the Next dev server, not another Express port.
- **Full guide**: [`backend/README.md`](backend/README.md)

---

## Optional: Expo mobile (`mobile/`)

- **Expo** app under **`mobile/`** — Google sign-in, feed, logging, lists, profile, communities.
- Points **`EXPO_PUBLIC_API_URL`** at the **API** (typically Express **:3001**), not the Next UI port.
- **Detailed setup**: [`mobile/README.md`](mobile/README.md)

---

## Feature overview

| Area | Notes |
|------|-------|
| **Auth** | Google via NextAuth; user row in `users` on first login |
| **Onboarding** | Username, favorites, optional Last.fm — `users.onboarding_completed`; invite flow can land on `/onboarding` before community home |
| **Logging** | `logs` table — track listens, sources (`manual`, Spotify sync, Last.fm, etc.) |
| **Reviews** | Star ratings + text on albums/tracks (separate from bare listens) |
| **Feed** | Activity from followed users — listen sessions (collapsed summaries), reviews, follows, **feed stories** (`feed_events`); virtualized list on home |
| **Follow** | Follow graph, counts on profiles |
| **Discover** | Trending / rising / hidden gems (Supabase RPCs + materialized views + Spotify enrichment) |
| **Leaderboard** | Popular / top rated / most favorited — web route **`/leaderboard`** |
| **Lists** | User lists (albums/tracks), sharing |
| **Notifications** | In-app notification feed + optional Expo push (migrations + API) |
| **Achievements & streaks** | User streaks, badges (RPC + migrations) |
| **Spotify** | Connect OAuth, sync recently played into `logs`, search (when enabled) |
| **Last.fm** | Profile username, preview/import, daily cron sync; synthetic `lfm:*` song/artist ids + enrichment toward Spotify |
| **Taste match** | Compare two users’ taste (`/api/taste-match`) and **community-scoped** taste peers |
| **Communities** | See [Communities & social layer](#communities--social-layer) — shared billboard, desktop rails, invites, feed, consensus |

---

## Communities & social layer

| Area | Notes |
|------|-------|
| **Membership** | Public communities can be joined from the UI; **private** communities use **direct invites** (`community_invites`) and/or **shareable invite links** (`community_invite_links` with UUID token) |
| **Invite links** | Created by admins (`POST /api/community/invite`). **Invite URLs** use `getRequestOrigin()` + `getAppBaseUrl()` (`lib/app-url.ts`) so production links use the real host (not `127.0.0.1`). **`GET /api/community/invite?communityId=`** returns the latest reusable link for copy; the web **`InviteMembersPanel`** accepts **`initialInviteUrl`** from the server (including `null`) so the invite button is never stuck on “Loading…” while credentials-backed fetches run when no server value is passed. |
| **Join flow** | `GET/POST /api/community/join/[token]` and page **`/community/join/[token]`** — server-side join when logged in; Google sign-in returns to the same path via `callbackUrl` |
| **Activity feed** | Merged sources: member listens (RPC), `feed_events` stories, reviews, follows, milestones, fan-out `community_feed` rows — filters (all / listens / reviews / streaks / members). **Pagination**: fixed **10** items per page (`COMMUNITY_FEED_PAGE_SIZE`); API ignores `limit` query and uses that constant. Realtime refresh via Supabase channel on `community_feed` inserts |
| **Comments** | Threads on reviews, logs, or generic feed items (`activity-comments` APIs) |
| **Consensus** | Community-ranked tracks/albums/artists by time range (`/api/communities/[id]/consensus`) |
| **Hidden gems** | Community-scoped discovery (`/api/communities/[id]/hidden-gems`) |
| **Leaderboards** | Weekly leaderboard + member stats (full rows on the main **Listen leaders** block; sidebar preview omits streak/role tags for space) |
| **Insights & weekly summary** | Aggregated community vibes / weekly job output |
| **Taste** | Community taste match card + similar/opposite peers |

### Community detail page (web, `/communities/[id]`)

- **Layout shell**: The page uses **`communityWideContainer`** (width-safe `min-w-0` / overflow clipping) inside the global **`pageShell`** (`pageWidthShell` + `pagePadding` in `AppLayout`). On large viewports the **max width scales** (`xl` / `2xl` / `3xl` breakpoints in `lib/ui/layout.ts`) so ultra-wide monitors are not stuck at `max-w-6xl` only.
- **Desktop chart row (member view)**: Implemented as **CSS Grid** with explicit **`column-gap`** (`communityDesktopTopRow`) so the center **weekly billboard** and rails are visually separated. Below **3xl** the grid is **two columns** [main chart column | right sidebar]. At **3xl+** a third column appears: **“On this page”** left rail (narrow, sticky) | main | right sidebar. Related tokens: `communityDesktopLeftRailColumn`, `communityDesktopMainColumn`, `communityDesktopRightSidebar`, `communityDesktopSidebarCompact` (tighter cards/type in the right rail).
- **Left rail**: In-page anchors — **Weekly chart** → **Consensus** → **Activity** → **People** (matching the section stack: chart + taste rail, then consensus, feed, listen leaders & members).
- **Weekly community billboard** (`components/community/community-weekly-billboard-client.tsx`): **Tracks / Artists / Albums** tabs and a **week** selector with **Older / Newer** navigation (`/api/communities/[id]/charts`, `/charts/weeks`). **Loading UI**: skeleton placeholders (`CommunityBillboardBodySkeleton` / `CommunityBillboardSkeleton` in `components/community/community-section-skeleton.tsx`) for hero + rows while chart JSON loads. **Client caching & prefetch**: responses are cached in a **`Map`** keyed by chart type + week (`"__latest__"` when viewing the latest week). After the visible chart loads, the **other two** tab payloads for the **same** week are **prefetched** in the background; on mount, **all three** week lists are fetched **in parallel** so switching tabs is usually instant. Server-provided **`initialChartData`** / **`initialWeeks`** (from `getCachedCommunityBillboardTracksInitial` / cache) seed the client and avoid duplicate first fetches where applicable.
- **Billboard → catalog**: In **community** mode, **`WeeklyBillboardView`** links **#1** art/title and **ranks 2–10** (and **biggest movers** titles) to **`/song/[id]`**, **`/artist/[id]`**, or **`/album/[id]`** depending on the active tab and row `entity_id`. Synthetic / placeholder ids stay unlinked; checks use **`lib/charts/weekly-chart-entity-guards.ts`** (client-safe, no `server-only` transitive imports).
- **Right sidebar**: **Stats**, **Invite people** (when the viewer can invite), **Top contributors** (compact: rank + avatar + truncated username), optional **compact insights**; the main column can include **taste match** + **weekly teaser** beside the chart on wider layouts (`CommunityDesktopChartRailSlot`).

---

## Last.fm & catalog enrichment

- **Ingest** (`lib/lastfm/ingest.ts`) writes listens and upserts **synthetic** songs (`lfm:<hash>`) and artists (`lfm:<hash>`) with `lastfm_name` / `lastfm_artist_name`, then enqueues **Spotify resolution** jobs.
- **Mapping** (`lib/lastfm/map-to-spotify.ts`) scores Spotify search results vs Last.fm strings (thresholded); featured artists (e.g. “Disco Lines, Tinashe”) can be harder to match automatically.
- **Jobs** (`lib/jobs/resolve-spotify-enrichment.ts`, `lib/jobs/spotifyQueue.ts`) resolve Spotify ids and update `songs` / `listens`. **Cron** `spotify-enrichment-retry` re-queues pending rows; without Redis, jobs run inline in that request.
- **Cron** `repair-lastfm-aggregates` repairs analytics when Last.fm listens had not yet contributed to artist/album aggregates.
- **Catalog cache** (`lib/spotify-cache.ts`) reads DB first; synthetic LFM rows without enrichment use **last.fm** names for display; after `spotify_id` is set, track pages can resolve Spotify metadata (see `SPOTIFY_NETWORK_FOR_CATALOG_READS` and per-route `allowNetwork`).

---

## API surface (Next.js)

Handlers live under **`app/api/`**. Patterns:

- **Success**: `lib/api-response.ts` — `apiOk`, `apiBadRequest`, `apiUnauthorized`, `apiInternalError`, etc.
- **Auth**: `requireApiAuth` / `getServerSession` depending on route.

Representative routes (non-exhaustive):

- **Auth**: `/api/auth/*` (NextAuth)
- **Users**: `/api/users/me`, `/api/users/[username]`
- **Logs**: `/api/logs`, `/api/logs/[id]`
- **Feed**: `/api/feed`
- **Social**: `/api/follow`, `/api/likes`, `/api/comments`
- **Spotify**: `/api/spotify/connect`, `/callback`, `/status`, `/sync`, `/recently-played`, …
- **Search**: `/api/search`
- **Discover / taste**: `/api/discover/*`, `/api/taste-match`
- **Leaderboard**: `GET /api/leaderboard`
- **Last.fm**: `/api/lastfm/preview`, `/sync`, `/import`, cron `GET /api/cron/lastfm-sync`
- **Communities**: `/api/communities`, `/api/communities/[id]`, `/api/communities/[id]/feed`, `/api/communities/[id]/members/*`, `/api/communities/[id]/consensus`, `/api/communities/[id]/leaderboard`, `/api/communities/[id]/insights`, `/api/communities/[id]/weekly-summary`, `/api/communities/[id]/taste-matches`, `/api/communities/[id]/activity-comments`, `/api/communities/[id]/charts`, `/api/communities/[id]/charts/weeks`, `/api/communities/[id]/charts/share-image`, `/api/communities/invites`, …
- **Community join**: `/api/community/join/[token]`, `/api/community/invite`
- **Crons**: `/api/cron/*` — see [Background jobs](#background-jobs-queues--vercel-crons)

---

## Background jobs, queues & Vercel crons

### Vercel Cron (`vercel.json`)

| Schedule | Path | Purpose |
|----------|------|---------|
| `0 0 * * *` | `/api/cron/refresh-stats` | Refresh entity stats / discovery materializations (`refresh_entity_stats` RPC, favorite counts, etc.) |
| `30 0 * * *` | `/api/cron/compute-cooccurrence` | Co-occurrence / “fans also like” inputs |
| `0 0 * * *` | `/api/cron/lastfm-sync` | Last.fm scrobble import per user |
| `0 0 * * *` | `/api/cron/taste-identity-refresh` | Recompute `taste_identity_cache` |
| `15 3 * * 1` | `/api/cron/community-feature-weekly` | Weekly community feature / summary job |
| `20 1 * * *` | `/api/cron/listening-aggregates` | Roll logs into `user_listening_aggregates` |
| `40 1 * * *` | `/api/cron/repair-lastfm-aggregates` | Repair Last.fm aggregate coverage |

Secure production routes with **`CRON_SECRET`** (Vercel can send `Authorization: Bearer`) where implemented — verify each `app/api/cron/*/route.ts`.

### Additional cron / maintenance routes (manual or external scheduler)

| Path | Purpose |
|------|---------|
| `/api/cron/spotify-enrichment-retry` | Re-queue Last.fm→Spotify enrichment for pending `songs`/`artists`; runs inline when no Redis |
| `/api/cron/feed-events-sync` | Feed story / event sync |
| `/api/cron/spotify-ingest` | Spotify ingest pipeline |
| `/api/cron/hydrate-missing-catalog` | Hydrate missing catalog rows |
| `/api/cron/backfill-artist-metadata` | Backfill artist genres / popularity / images |
| `/api/cron/backfill-catalog-popularity` | Catalog popularity backfill |

**Taste identity**: Profiles and `GET /api/taste-identity` read `taste_identity_cache`. The daily cron recomputes from logs and upserts artwork-friendly payloads. Apply migrations through `063` for cache seeding behavior. **Artist metadata**: migration `061` + backfill route as needed.

---

## Testing & quality

```bash
npm run typecheck   # TypeScript
npm run lint        # ESLint
npm run test:e2e    # Playwright (requires dev server / env per project)
```

---

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| **Redirect URI mismatch** (Google / Spotify) | `NEXTAUTH_URL` and dashboard URIs must match **exactly** (scheme, host, path, no stray slash). |
| **Infinite loading** on pages using **`fetch('/api/...')`** | **`API_BACKEND_URL`** set + Express fallback loop — unset **`API_BACKEND_URL`** for web-only dev, or ensure Express **`NEXT_API_FALLBACK`** points to Next **3000** and avoid circular proxying. |
| **503** “API backend unavailable” | Middleware cannot reach **`API_BACKEND_URL`** (Express not running / wrong port). |
| **504** from Express to Next | Next not running on **`NEXT_API_FALLBACK`** URL, or timeout — start **`npm run dev`** on port 3000. |
| **Spotify logging / OAuth “disabled”** | Set **`NEXT_PUBLIC_ENABLE_SPOTIFY=true`** and **`ENABLE_SPOTIFY_INTEGRATION=true`** for user-linked features. **Search/catalog** only needs **`SPOTIFY_CLIENT_ID`** / **`SPOTIFY_CLIENT_SECRET`**. |
| **Spotify Web API 403** on `/v1/artists` (batch or single) | App restrictions in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard): Development Mode limits, quota, or policy — client-credentials still need a valid app; check the JSON **`error.message`** in logs. |
| **RLS / permission errors** on admin operations | Use **service role** only in trusted server code (`lib/supabase-admin.ts`). |
| **Session / 401** | **`NEXTAUTH_URL`** must match the browser origin. |
| **Invite links show localhost in prod** | Set **`NEXTAUTH_URL`** to the production origin; invite API uses **`getRequestOrigin`** + **`getAppBaseUrl`** — ensure Vercel **`VERCEL_URL`** / custom domain headers are correct. |
| **User joined in Chrome but not Safari** | Safari **ITP** / cross-site cookies can block OAuth session persistence; retry opening the invite link after sign-in; test with `NEXTAUTH_URL` exactly matching the live site. |
| **Community feed shows 0 items** | RLS / membership; user must be a member to read `GET /api/communities/[id]/feed`. |

---

## Further reading

- [`backend/README.md`](backend/README.md) — Express API, CORS, mobile Bearer auth
- [`mobile/README.md`](mobile/README.md) — Expo, OAuth, push, offline queue
- [Spotify Dashboard](https://developer.spotify.com/dashboard)
- [Supabase Docs](https://supabase.com/docs)
- [NextAuth.js](https://next-auth.js.org/)
