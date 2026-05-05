# Tracklist

A **music social** web and mobile app: log listens, rate albums and tracks with reviews, follow people, browse a personalized feed, discover trending music, compete on leaderboards, join **communities** with shared activity and taste tools, explore your **taste identity** over time, surface personalised **blind spots**, and optionally import **Last.fm** scrobbles mapped to the **Spotify** catalog (including synthetic `lfm:*` track rows when no native Spotify id exists yet).

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
12. [Listening reports & sharing](#listening-reports--sharing)
13. [Taste intelligence & profile](#taste-intelligence--profile)
14. [Communities & social layer](#communities--social-layer)
15. [Last.fm & catalog enrichment](#lastfm--catalog-enrichment)
16. [API surface (Next.js)](#api-surface-nextjs)
17. [Background jobs, queues & crons](#background-jobs-queues--crons)
18. [Testing & quality](#testing--quality)
19. [Troubleshooting](#troubleshooting)
20. [Further reading](#further-reading)

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
┌─────────────────┐     BullMQ / SQS jobs (Spotify enrichment, taste snapshots)
│  Redis / SQS    │     when REDIS_URL / AWS creds are set; otherwise jobs run
└─────────────────┘     inline in the same Node process
```

- **Primary web app**: Next.js **App Router** on port **3000** (`npm run dev`). Most **`/api/*`** route handlers live under `app/api/`.
- **Auth**: **NextAuth** (Google) for the web; session is JWT-based. API routes use `getServerSession` / `requireApiAuth` as appropriate.
- **Data**: **Supabase** — `anon` + cookies for user-scoped server code, **service role** for admin/cron/Spotify tokens and jobs that bypass RLS.
- **Optional Express**: `backend/` serves **`/api/*`** for mobile and split deployments. When enabled, **Next middleware** can forward browser **`/api/*`** to Express (see [Optional: Express API](#optional-express-api-backend)).
- **Optional Redis**: **`REDIS_URL`** enables shared **API caches** (stale-first, community, discover sections), **Spotify client** shared limits/SWR, and **BullMQ** enrichment (`lib/jobs/spotifyQueue.ts`; run `npm run worker:spotify-enrich` in production). Without Redis, caches are per-instance memory and eligible work still runs **inline**.
- **Optional AWS**: **SQS** worker (`npm run worker:sqs`) and **Lambda** functions (`infra/aws/lambda/`) handle async Spotify enrichment at scale. CloudFormation templates under `infra/aws/`.

---

## Repository layout

| Path | Purpose |
|------|---------|
| `app/` | Next.js routes, layouts, `app/api/*` route handlers |
| `app/reports/(tabs)/` | Reports route group — `layout.tsx` provides the persistent back-link + Story / Rankings / Year tab strip; only the content area swaps on navigation, eliminating layout shift |
| `app/reports/shared/[id]/` | Public shareable report pages with hero, follow button, OG metadata |
| `components/` | React UI components (web), organised by feature area |
| `components/reports/` | Share modal (bottom-sheet, matches `ChartShareModal`), tab strip, share card, share image modal |
| `components/profile/` | Profile sections: listening report preview, taste timeline, taste blind spots, insight cards, taste identity display |
| `lib/` | Server utilities: queries, Spotify cache, feed, auth, Last.fm ingest/mapping, communities, discovery, analytics |
| `lib/analytics/` | Listening report computation — `build-listening-report.ts` (full-log scan, React-cached per request), `getListeningReports`, compare/rolling helpers |
| `lib/reports/` | Weekly story (`weekly-listening-story.ts`), saved-report helpers, Satori share-image templates (`report-share-image-template.tsx`, `report-spotlight-image-template.tsx`) |
| `lib/profile/` | Cached profile data, taste insights, taste timeline (`taste-timeline.ts`), blind spots (`taste-blind-spots.ts`), listening report preview, weekly narrative |
| `lib/charts/` | Weekly chart types, hydration, share image template + generation (`generate-chart-share-image.tsx`), font loading, share data formatting |
| `lib/community/` | Invite helpers, consensus, hidden gems, leaderboards |
| `lib/jobs/` | BullMQ queue setup, SQS worker, Spotify enrichment job handlers |
| `lib/feed/` | Feed generation, listen sessions, story aggregation |
| `lib/lastfm/` | Last.fm API fetch, ingest, mapping to Spotify, enrichment |
| `lib/ui/layout.ts` | Shared layout tokens (`pageWidthShell`, `contentMax2xl`, `communityDesktop*` grid columns) |
| `lib/app-url.ts` | Canonical app base URL + `getRequestOrigin()` (invite links, prod-safe URLs) |
| `lib/charts/weekly-chart-entity-guards.ts` | Client-safe checks for synthetic chart `entity_id` values — avoids importing `server-only` modules from client chart UI |
| `middleware.ts` | Optional proxy of `/api/*` to Express when `API_BACKEND_URL` is set; maintenance mode (`MAINTENANCE_MODE`) |
| `packages/spotify-client/` | Workspace package: shared Spotify HTTP client + three Bottleneck rate-limiters |
| `infra/aws/` | CloudFormation stacks + Lambda source for enrichment drain scheduler and taste-snapshot scheduler |
| `supabase/migrations/` | **Ordered** SQL migrations — apply all in numeric sequence |
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
| Virtualized lists | **TanStack Virtual** (home feed, report lists) |
| Music APIs | **Spotify Web API** (OAuth + client credentials) |
| Scrobbles | **Last.fm** public API (optional) |
| Share image generation | **`@vercel/og`** + Satori — server-side PNG rendering (charts, reports) |
| Background jobs | **BullMQ** + **Redis** (optional); **AWS SQS** + Lambda (optional) |
| E2E | **Playwright** |
| Unit | **Vitest** |
| Analytics | Vercel Analytics & Speed Insights (optional) |

---

## Prerequisites

- **Node.js 18+** (Node **20+** recommended for `backend/`)
- **npm** (ships with Node)
- A **Supabase** project
- **Google Cloud** OAuth credentials (web sign-in)
- **Spotify** developer app (search, connect, catalog) — when integration flags are enabled
- **Optional**: **Redis** (`REDIS_URL`) for queued Spotify enrichment and cross-instance rate limiting
- **Optional**: **AWS** credentials for SQS worker and Lambda enrichment pipeline

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

   Fill every required variable (see [Environment variables](#environment-variables)). The app uses **`.env`** at the repo root (Next loads it automatically).

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
| `NEXTAUTH_URL` | Public app URL (e.g. `http://127.0.0.1:3000`). In production set to `https://tracklistsocial.com`. |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only** — crons, admin writes, `spotify_tokens`, jobs |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | Spotify app |
| `SPOTIFY_REDIRECT_URI` | Optional; default pattern `{NEXTAUTH_URL}/api/spotify/callback` |
| `SPOTIFY_DEBUG` | `1` or `true` — log each Spotify Web API call (path, status, ms) to server stdout; never logs tokens |

**Spotify** uses two layers (see `lib/spotify-integration-enabled.ts`):

| Layer | What it controls | When it works |
|-------|------------------|---------------|
| **Catalog** (search, metadata, `spotifyFetch` client-credentials) | `SPOTIFY_CLIENT_ID` + `SPOTIFY_CLIENT_SECRET` | Independent of OAuth |
| **User integration** (OAuth, sync, ingest) | Feature flags below | Off unless explicitly enabled |

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_ENABLE_SPOTIFY` | Client gate for linking Spotify / logging |
| `ENABLE_SPOTIFY_INTEGRATION` | Server gate for OAuth routes, ingest, user-token APIs |
| `EXPO_PUBLIC_ENABLE_SPOTIFY` | Expo — Spotify account features on mobile |
| `SPOTIFY_NETWORK_FOR_CATALOG_READS` | `1` to allow `getOrFetch*` helpers to call Spotify on cache miss in server contexts |

**Spotify artist albums rate limiting** — dedicated Bottleneck bucket to avoid starving other catalog calls:

| Variable | Default | Purpose |
|----------|---------|---------|
| `SPOTIFY_ARTIST_ALBUMS_MIN_TIME_MS` | `450` | Min spacing between paginated discography calls |
| `SPOTIFY_ARTIST_ALBUMS_RESERVOIR_PER_MIN` | `20` | Token bucket per minute for this route |
| `SPOTIFY_ARTIST_ALBUMS_PAGE_GAP_MS` | `400` | Extra pause between pages in `getAllArtistAlbums` |

**Last.fm (optional)**

| Variable | Purpose |
|----------|---------|
| `LASTFM_API_KEY` | `user.getRecentTracks` for profile import + cron |
| `TRACKLIST_DEBUG_LASTFM_MAPPING` | `1` for verbose Last.fm→Spotify mapping logs |

**Jobs & queues**

| Variable | Purpose |
|----------|---------|
| `REDIS_URL` | **Optional.** Single Redis URL. Shared ioredis connection for caches + Spotify SWR; separate connection for BullMQ so job polling doesn't contend with cache traffic. Without Redis, caches fall back to per-process memory. |

**AWS (optional — SQS enrichment worker + Lambda)**

| Variable | Purpose |
|----------|---------|
| `AWS_REGION` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Credentials for SQS worker and Lambda deployments |
| `SQS_QUEUE_URL` | Queue URL for Spotify enrichment messages (`npm run worker:sqs`) |

**Operations**

| Variable | Purpose |
|----------|---------|
| `CRON_SECRET` | `Authorization: Bearer` secret for cron route handlers |
| `MAINTENANCE_MODE` | `1` / `true` / `yes` — site-wide 503 |

**Split API (advanced)**

| Variable | Read by | Purpose |
|----------|---------|---------|
| `API_BACKEND_URL` | Next `middleware.ts` | If set, browser `/api/*` (except `/api/auth/*` and `/api/leaderboard`) is proxied to this origin |
| `NEXT_API_FALLBACK` | Express `backend/routes/index.ts` | Proxy unhandled routes to this Next origin (default dev: `http://127.0.0.1:3000`) |

**Important:** Do **not** set `API_BACKEND_URL` for simple local web development. Combining it with Express's `NEXT_API_FALLBACK` creates a request loop (hung pages, infinite loading). For `npm run dev` on the web app alone, leave `API_BACKEND_URL` unset.

---

## Database & migrations

- **149+ migrations** under `supabase/migrations/` — naming `NNN_description.sql` (apply all in order).
- Skipping migrations will break RPCs, indexes, and features.

**Recent notable migrations:**

| Migration | Table / feature |
|-----------|----------------|
| `146` | `logs_user_track_index` — performance index on logs |
| `147` | `community_leaderboard_rpc` — community consensus/leaderboard RPC |
| `148` | `taste_snapshots` — monthly taste history per user (top artists, genres, scores) |
| `149` | `user_blind_spots` — cached blind-spot artist recommendations |

**Earlier notable areas:** users/follows/logs/reviews/likes/comments, Spotify tokens & catalog cache, lists, notifications, achievements, streaks, materialized views for discover, `entity_stats` / leaderboards, Last.fm username + sync watermark, `feed_events`, communities (members, invites, feed, comments, consensus, hidden gems), `user_listening_aggregates` (`077`–`079`), `saved_reports`, `taste_identity_cache`, co-occurrence / recommendation helpers.

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
| `npm run test:e2e` | Playwright E2E tests (requires dev server) |
| `npm run test:unit` | Vitest unit tests |
| `npm run dev:backend` | Express API server (default **3001**) |
| `npm run worker:spotify-enrich` | BullMQ Spotify enrichment worker |
| `npm run worker:sqs` | AWS SQS enrichment worker |

**WebSocket / `/_next/webpack-hmr` errors in the console** — normal in `next dev` (Hot Module Replacement). Production builds do not use it.

---

## Optional: Express API (`backend/`)

The **`backend/`** package is an **Express + TypeScript** server that mirrors or extends **`/api/*`** for **mobile** and split hosting.

- **Install / run**: `cd backend && npm install && npm run dev` (port **3001**).
- **Env**: Loads **`../.env`** then **`backend/.env`** (`server.ts`).
- **Proxy**: Unhandled routes forward to **`NEXT_API_FALLBACK`** (Next), default **`http://127.0.0.1:3000`** in development.
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
| **Feed** | Activity from followed users — listen sessions (collapsed summaries), reviews, follows, feed stories (`feed_events`); virtualized list on home |
| **Follow** | Follow graph, counts on profiles |
| **Discover** | Trending / rising / hidden gems (Supabase RPCs + materialized views + Spotify enrichment) |
| **Leaderboard** | Popular / top rated / most favorited — `/leaderboard` |
| **Lists** | User lists (albums/tracks), sharing |
| **Notifications** | In-app notification feed + optional Expo push |
| **Achievements & streaks** | User streaks, badges (RPC + migrations) |
| **Spotify** | Connect OAuth, sync recently played into `logs`, search |
| **Last.fm** | Profile username, preview/import, daily cron sync; synthetic `lfm:*` ids + Spotify enrichment |
| **Taste match** | Compare two users' taste (`/api/taste-match`) and community-scoped taste peers |
| **Listening reports** | See [Listening reports & sharing](#listening-reports--sharing) — Story / Rankings / Year views, save & share with server-side share image generation |
| **Taste intelligence** | See [Taste intelligence & profile](#taste-intelligence--profile) — taste identity, timeline (monthly snapshots), blind spots (undiscovered artists) |
| **Communities** | See [Communities & social layer](#communities--social-layer) — shared billboard, invites, feed, consensus, leaderboard |

---

## Listening reports & sharing

Three views under `/reports/`, unified by a persistent route-group layout (`app/reports/(tabs)/layout.tsx`) so the back-link and tab strip never remount on navigation. Each tab has a matching skeleton `loading.tsx` that fills the content area while the server component renders.

| Route | Tab | Notes |
|-------|-----|-------|
| `/reports/week` | **Story** | Narrative weekly summary — auto-generated sentence, 4 stat cards (total listens, unique artists, new artists, streak), top artist/album/track with cover art, insight bullets, week-over-week % change. Browsable by past weeks (`?offset=N`). Month/year show a stat-grid fallback view. |
| `/reports/listening` | **Rankings** | Full ranked lists (artists / albums / tracks / genres) with play counts, rank movement arrows, period comparison vs. prior window. Week / month / year / custom date ranges. Save reports privately or with a public share link. |
| `/reports/year` | **Year** | Server-rendered year-in-review — hero card for #1 artist with blurred background, top-5 grids for each category. Synthetic `__tl_*` entities filtered out. Data cached 1 hour via `unstable_cache` to avoid full-year log scans on every visit. |
| `/reports/shared/[id]` | — | Public landing page for a saved report: hero with blurred cover art background, owner `@handle` + follow/join button, stat pills (entity type, period, total plays), share image and copy-link actions, full ranked list, sign-up CTA for logged-out visitors. Full OG metadata (`og:title`, `og:description`, `og:image` from snapshot). |

### Saving & public links

Reports are saved to the `saved_reports` table with an optional `snapshot_json` (frozen `ListeningReportSnapshotV1`) so the shared view never recomputes from live logs. When `is_public = true`, the saved report is accessible at `/reports/shared/[id]` without authentication.

### Share image generation

`POST /api/reports/share-image` returns a PNG generated server-side with **`@vercel/og`** + Satori, avoiding the CORS canvas-tainting issue that affects `html-to-image` with Spotify CDN images in the browser.

| `variant` | Size | Layout |
|-----------|------|--------|
| `"list"` _(default)_ | 1080 × 1350 | Top-5 ranked list, `@username` in header, period + total plays in subheader, `tracklistsocial.com` footer |
| `"spotlight"` | 1080 × 1080 | Full-bleed cover art of #1 item with dark gradient overlay, large name, play count — Instagram-story proportions. Disabled in the modal when #1 item has no image. |

The `ShareReportModal` is a bottom-sheet component (matching the `ChartShareModal` pattern: drag handle on mobile, icon grid for Copy Link / Share / Instagram / Download, Cancel button) that lets users pick a card variant, copy a public link (saving as public on first click), or trigger the native Web Share API / PNG download.

The chart share system (`/api/charts/share-image`, `lib/charts/`) follows the same server-side Satori pattern and is also used for community weekly billboard sharing.

---

## Taste intelligence & profile

### Taste identity

`taste_identity_cache` stores a computed taste snapshot per user (top artists, albums, genres, obscurity/diversity scores, listening style label). Updated daily by the `taste-identity-refresh` cron and on-demand. Surfaced on profiles via `TasteIdentitySection` and `ProfileInsightCards`.

- **`GET /api/taste-identity`** — returns the cached identity for the authed user.
- **`lib/taste/`** — score computation and type definitions.

### Taste timeline

Monthly snapshots stored in `taste_snapshots` (migration 148):

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | UUID | FK → `users` |
| `snapshot_month` | DATE | First day of the month |
| `top_artists` | JSONB | `[{id, name, plays, imageUrl?}]` |
| `top_genres` | JSONB | Genre play counts |
| `total_logs` | INT | Total plays that month |
| `obscurity_score` | 0–100 | How niche the listening is |
| `diversity_score` | 0–10 | Distinct genres (capped) |

- **`lib/profile/taste-timeline.ts`** — aggregates snapshots into chart-ready data.
- **`components/profile/taste-timeline.tsx`** — visualises taste evolution across months on the profile page.
- Snapshots generated monthly by the AWS Lambda `taste-snapshot-scheduler` (`infra/aws/lambda/taste-snapshot-scheduler/`) and backfilled via `scripts/backfill-taste-snapshots.ts`.

### Blind spots

`user_blind_spots` (migration 149) caches personalised "artists you should know" recommendations per user (7-day TTL).

**Algorithm** (`lib/profile/taste-blind-spots.ts`):
1. Collect all played artist names from recent taste snapshots.
2. Pick up to 6 seed artists from the user's top artists.
3. Call the Last.fm Similar Artists API for each seed.
4. Filter out artists already in the user's listening history.
5. Rank survivors by connection count (how many seed artists reference them).
6. Resolve Spotify metadata (image, genres, ID) for the top results.
7. Return top 6 with a `becauseOf` list explaining the connection.

- **`components/profile/taste-blind-spots.tsx`** — displays blind-spot suggestions on the profile page with artist images and "because you listen to X" context.

### Profile listening report preview

`lib/profile/listening-report-preview.ts` fetches a lightweight weekly snapshot (top 3 artists with images, top genre, period label) cached via `unstable_cache` for fast profile renders. Displayed in the "Listening report" section of every profile page via `ProfileListeningReportPreview`.

---

## Communities & social layer

| Area | Notes |
|------|-------|
| **Membership** | Public communities joinable from UI; private use direct invites (`community_invites`) and/or shareable invite links (`community_invite_links` with UUID token) |
| **Invite links** | Created by admins (`POST /api/community/invite`). URLs use `getRequestOrigin()` + `getAppBaseUrl()` so production links use the real host. |
| **Join flow** | `GET/POST /api/community/join/[token]` and `/community/join/[token]` — server-side join when logged in; Google sign-in returns via `callbackUrl` |
| **Activity feed** | Merged sources: member listens (RPC), `feed_events` stories, reviews, follows, milestones, `community_feed` rows — filters (all / listens / reviews / streaks / members). Fixed 10 items/page. Realtime via Supabase channel on `community_feed` inserts |
| **Comments** | Threads on reviews, logs, or generic feed items (`activity-comments` APIs) |
| **Consensus** | Community-ranked tracks/albums/artists by time range |
| **Hidden gems** | Community-scoped discovery |
| **Leaderboards** | Weekly listen leaderboard + member stats |
| **Insights & weekly summary** | Aggregated community vibes / weekly job output |
| **Taste** | Community taste match card + similar/opposite peers |

### Community detail page (web, `/communities/[id]`)

- **Layout shell**: Uses `communityWideContainer` (width-safe `min-w-0`) inside the global `pageShell`. Max-width scales at `xl` / `2xl` / `3xl` breakpoints in `lib/ui/layout.ts`.
- **Desktop chart row**: CSS Grid (`communityDesktopTopRow`) — below 3xl: two columns [chart | right sidebar]; at 3xl+: three columns [left rail | chart | right sidebar].
- **Left rail**: In-page anchors for Weekly chart → Consensus → Activity → People.
- **Weekly community billboard** (`community-weekly-billboard-client.tsx`): Tracks / Artists / Albums tabs, week selector, client-side cache keyed by chart type + week. After load, prefetches the other two tab payloads in the background; on mount fetches all three week lists in parallel. Server-provided `initialChartData` / `initialWeeks` seed the client.
- **Billboard → catalog**: Links #1 art, ranks 2–10, and biggest movers to `/song/[id]`, `/artist/[id]`, `/album/[id]`. Synthetic IDs checked via `lib/charts/weekly-chart-entity-guards.ts` (client-safe).
- **Share image**: `GET /api/communities/[id]/charts/share-image` — server-side 1080 × 1350 PNG via Satori. Same infrastructure as report share images.

---

## Last.fm & catalog enrichment

- **Ingest** (`lib/lastfm/ingest.ts`) writes listens and upserts synthetic songs/artists (`lfm:<hash>`), then enqueues Spotify resolution jobs.
- **Mapping** (`lib/lastfm/map-to-spotify.ts`) scores Spotify search results vs. Last.fm strings (thresholded fuzzy match).
- **Jobs** (`lib/jobs/resolve-spotify-enrichment.ts`, `lib/jobs/spotifyQueue.ts`) resolve Spotify IDs and update catalog rows. Without Redis, run inline in the cron handler.
- **SQS worker** (`npm run worker:sqs`) — pulls enrichment messages from AWS SQS for high-throughput prod deployments; Lambda drain scheduler at `infra/aws/lambda/enrich-drain-scheduler/`.
- **Cron** `repair-lastfm-aggregates` repairs analytics when Last.fm listens had not yet contributed to aggregates.
- **Catalog cache** (`lib/spotify-cache.ts`) reads DB first; synthetic LFM rows use Last.fm names until `spotify_id` is resolved.

---

## API surface (Next.js)

Handlers live under **`app/api/`**. All responses use `lib/api-response.ts` helpers (`apiOk`, `apiBadRequest`, `apiUnauthorized`, `apiInternalError`, …). Auth via `requireApiAuth` / `getServerSession`.

Representative routes (non-exhaustive):

- **Auth**: `/api/auth/*` (NextAuth)
- **Users**: `/api/users/me`, `/api/users/[username]`, `/api/users/[username]/followers`, `/api/users/[username]/following`, `/api/users/[username]/lists`
- **Logs**: `/api/logs`, `/api/logs/[id]`
- **Feed**: `/api/feed`
- **Social**: `/api/follow`, `/api/likes`, `/api/reactions`, `/api/comments`
- **Spotify**: `/api/spotify/connect`, `/callback`, `/status`, `/sync`, `/recently-played`, `/album/[id]`, `/song/[id]`
- **Search**: `/api/search`, `/api/search/users`
- **Discover / taste**: `/api/discover/*`, `/api/explore/*`, `/api/taste-match`, `/api/taste-identity`, `/api/taste/matches`
- **Leaderboard**: `GET /api/leaderboard`
- **Last.fm**: `/api/lastfm/preview`, `/sync`, `/import`
- **Reports**: `GET /api/reports`, `POST /api/reports/save`, `GET /api/reports/saved`, `GET|DELETE /api/reports/saved/[id]`, `GET /api/reports/compare`, `POST /api/reports/share-image` (server-side PNG; `variant: "list"|"spotlight"`), `POST /api/reports/warm-catalog`
- **Charts**: `GET /api/charts`, `/api/charts/weeks`, `GET /api/charts/share-image`
- **Communities**: `/api/communities`, `/api/communities/[id]`, `/api/communities/[id]/feed`, `/api/communities/[id]/members/*`, `/api/communities/[id]/consensus`, `/api/communities/[id]/leaderboard`, `/api/communities/[id]/insights`, `/api/communities/[id]/weekly-summary`, `/api/communities/[id]/taste-matches`, `/api/communities/[id]/activity-comments`, `/api/communities/[id]/charts`, `/api/communities/[id]/charts/weeks`, `/api/communities/[id]/charts/share-image`
- **Community join**: `/api/community/join/[token]`, `/api/community/invite`
- **Lists**: `/api/lists`, `/api/lists/[listId]`, `/api/lists/[listId]/items`
- **Albums / Artists / Songs**: `/api/albums/[id]`, `/api/artists/[id]`, `/api/track-stats`
- **Crons**: `/api/cron/*` — see [Background jobs](#background-jobs-queues--crons)

---

## Background jobs, queues & crons

### Vercel Cron (`vercel.json`)

| Schedule | Path | Purpose |
|----------|------|---------|
| `0 0 * * *` | `/api/cron/refresh-stats` | Entity stats + discovery materializations |
| `30 0 * * *` | `/api/cron/compute-cooccurrence` | Co-occurrence / "fans also like" inputs |
| `0 0 * * *` | `/api/cron/lastfm-sync` | Last.fm scrobble import per user |
| `0 0 * * *` | `/api/cron/taste-identity-refresh` | Recompute `taste_identity_cache` |
| `15 3 * * 1` | `/api/cron/community-feature-weekly` | Weekly community summary job |
| `20 1 * * *` | `/api/cron/listening-aggregates` | Roll logs into `user_listening_aggregates` |
| `40 1 * * *` | `/api/cron/repair-lastfm-aggregates` | Repair Last.fm aggregate coverage |

Secure with **`CRON_SECRET`** (`Authorization: Bearer`) — verify each `app/api/cron/*/route.ts`.

### Additional cron / maintenance routes

| Path | Purpose |
|------|---------|
| `/api/cron/spotify-enrichment-retry` | Re-queue Last.fm→Spotify enrichment for pending rows |
| `/api/cron/feed-events-sync` | Feed story / event sync |
| `/api/cron/spotify-ingest` | Spotify ingest pipeline |
| `/api/cron/hydrate-missing-catalog` | Hydrate missing catalog rows |
| `/api/cron/backfill-artist-metadata` | Backfill artist genres / popularity / images |
| `/api/cron/backfill-catalog-popularity` | Catalog popularity backfill |
| `/api/cron/weekly-charts` | Generate weekly chart data |
| `/api/cron/weekly-charts-users` | Per-user weekly chart rollup |
| `/api/cron/weekly-charts-communities` | Per-community weekly chart rollup |

### AWS Lambda functions (`infra/aws/lambda/`)

| Lambda | Trigger | Purpose |
|--------|---------|---------|
| `enrich-drain-scheduler` | EventBridge (scheduled) | Drains Spotify enrichment jobs from SQS for async processing at scale |
| `taste-snapshot-scheduler` | EventBridge (2nd of month) | Generates monthly `taste_snapshots` records for all users |

CloudFormation templates and build scripts under `infra/aws/`. Local Lambda code built via `scripts/build-lambda-*.mjs`.

---

## Testing & quality

```bash
npm run typecheck   # TypeScript (tsc --noEmit)
npm run lint        # ESLint
npm run test:unit   # Vitest unit tests
npm run test:e2e    # Playwright E2E (requires dev server + env)
```

---

## Troubleshooting

| Symptom | Likely cause |
|---------|-------------|
| **Redirect URI mismatch** (Google / Spotify) | `NEXTAUTH_URL` and dashboard URIs must match **exactly** (scheme, host, path, no trailing slash). |
| **Infinite loading** on pages using `fetch('/api/...')` | `API_BACKEND_URL` set + Express fallback loop — unset for web-only dev, or ensure Express `NEXT_API_FALLBACK` → Next 3000. |
| **503** "API backend unavailable" | Middleware can't reach `API_BACKEND_URL` (Express not running / wrong port). |
| **504** from Express to Next | Next not running on `NEXT_API_FALLBACK` URL — start `npm run dev`. |
| **Spotify logging / OAuth "disabled"** | Set `NEXT_PUBLIC_ENABLE_SPOTIFY=true` and `ENABLE_SPOTIFY_INTEGRATION=true`. Search/catalog only needs `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`. |
| **Spotify Web API 403** on `/v1/artists` | App restrictions in Spotify Developer Dashboard (Development Mode, quota, policy) — check the JSON `error.message` in server logs. |
| **Report share image fails** | The `/api/reports/share-image` route requires auth (session cookie). Ensure the request is made from an authenticated browser context. Font loading (`loadChartShareImageFonts`) fetches Inter from Google Fonts on cold start — allow outbound network in your deployment. |
| **Year report page is slow (first load)** | `buildListeningReport` scans the full year of logs — expected on cold cache. Subsequent visits within 1 hour return from `unstable_cache`. |
| **Weekly story shows no top artist** | `hydrateTop` in `weekly-listening-story.ts` reads from the `artists` / `albums` / `tracks` DB tables using internal UUIDs. If an artist has no DB row (e.g. enrichment hasn't run), the top pick will be null. Run the Spotify enrichment worker / cron. |
| **RLS / permission errors** on admin operations | Use service role only in trusted server code (`lib/supabase-admin.ts`). |
| **Session / 401** | `NEXTAUTH_URL` must match the browser origin. |
| **Invite links show localhost in prod** | Set `NEXTAUTH_URL` to the production origin; ensure Vercel `VERCEL_URL` / custom domain headers are correct. |
| **Community feed shows 0 items** | RLS / membership — user must be a member to read `GET /api/communities/[id]/feed`. |

---

## Further reading

- [`backend/README.md`](backend/README.md) — Express API, CORS, mobile Bearer auth
- [`mobile/README.md`](mobile/README.md) — Expo, OAuth, push, offline queue
- [Spotify Dashboard](https://developer.spotify.com/dashboard)
- [Supabase Docs](https://supabase.com/docs)
- [NextAuth.js](https://next-auth.js.org/)
- [Vercel OG Image Generation](https://vercel.com/docs/functions/og-image-generation)
