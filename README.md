# Tracklist

A **music social** web and mobile app: log listens, rate albums and tracks with reviews, follow people, browse a personalized feed, discover trending music, compete on leaderboards, and optionally import **Last.fm** scrobbles mapped to **Spotify** catalog rows.

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
12. [API surface (Next.js)](#api-surface-nextjs)
13. [Background jobs & Vercel crons](#background-jobs--vercel-crons)
14. [Testing & quality](#testing--quality)
15. [Troubleshooting](#troubleshooting)
16. [Further reading](#further-reading)

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
```

- **Primary web app**: Next.js **App Router** on port **3000** (`npm run dev`). Most **`/api/*`** route handlers live under `app/api/`.
- **Auth**: **NextAuth** (Google) for the web; session is JWT-based. API routes use `getServerSession`.
- **Data**: **Supabase** — `anon` + cookies for user-scoped server code, **service role** for admin/cron/Spotify tokens.
- **Optional Express**: `backend/` serves **`/api/*`** for mobile and for split deployments. When enabled, **Next middleware** can forward browser **`/api/*`** to Express (see [Optional: Express API](#optional-express-api-backend)).

---

## Repository layout

| Path | Purpose |
|------|---------|
| `app/` | Next.js routes, layouts, `app/api/*` route handlers |
| `components/` | React UI (web) |
| `lib/` | Server utilities: queries, Spotify, feed, auth helpers, Last.fm mapping |
| `middleware.ts` | Optional proxy of `/api/*` to Express when `API_BACKEND_URL` is set |
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
| Music APIs | **Spotify Web API** (OAuth + client credentials) |
| Scrobbles | **Last.fm** public API (optional) |
| E2E | **Playwright** |
| Analytics | Vercel Analytics & Speed Insights (optional) |

---

## Prerequisites

- **Node.js 18+** (Node **20+** recommended for `backend/`)
- **npm** (ships with Node)
- A **Supabase** project
- **Google Cloud** OAuth credentials (web sign-in)
- **Spotify** developer app (search, connect, catalog) — when integration flags are enabled

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
| `NEXTAUTH_URL` | Public app URL (e.g. `http://127.0.0.1:3000`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only** — crons, admin writes, `spotify_tokens` |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | Spotify app |
| `SPOTIFY_REDIRECT_URI` | Optional; default pattern `{NEXTAUTH_URL}/api/spotify/callback` |

**Spotify + search + OAuth behavior** are gated by feature flags (default off if unset):

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_ENABLE_SPOTIFY` | Client-visible gate |
| `ENABLE_SPOTIFY_INTEGRATION` | Server-side gate for API routes / jobs |
| `EXPO_PUBLIC_ENABLE_SPOTIFY` | Expo / mobile builds |

See `lib/spotify-integration-enabled.ts`.

**Last.fm (optional)**

| Variable | Purpose |
|----------|---------|
| `LASTFM_API_KEY` | `user.getRecentTracks` for profile import + cron |
| `TRACKLIST_DEBUG_LASTFM_MAPPING` | `1` for verbose Last.fm→Spotify mapping logs (also in `NODE_ENV=development`) |

**Split API (advanced)**

| Variable | Read by | Purpose |
|----------|---------|---------|
| `API_BACKEND_URL` | Next **`middleware.ts`** | If set, browser **`/api/*`** (except `/api/auth/*` and `/api/leaderboard`) is proxied to this origin (e.g. Express `http://127.0.0.1:3001`). |
| `NEXT_API_FALLBACK` | **Express** `backend/routes/index.ts` | If a path is not implemented in Express, proxy to this Next origin (default dev: `http://127.0.0.1:3000`). |

**Important:** Do **not** set **`API_BACKEND_URL`** for simple local web development unless you intentionally route the browser through Express. Combining **`API_BACKEND_URL`** with Express’s fallback to Next can create a **Next ↔ Express request loop** (hung pages, infinite loading). For **`npm run dev`** on the web app alone, **leave `API_BACKEND_URL` unset** so Next serves **`/api/*`** directly. Use **`NEXT_API_FALLBACK`** when running **`cd backend && npm run dev`** (e.g. mobile hitting port 3001). Details: `.env.example` comments.

---

## Database & migrations

- **61+ migrations** under `supabase/migrations/` — naming `NNN_description.sql`.
- Apply **in order** from `001` upward. Skipping migrations will break RPCs, indexes, and features (feed sessions, entity stats, Last.fm columns, etc.).
- Notable areas covered by migrations: users/follows/logs/reviews/likes/comments, Spotify tokens & catalog cache, lists, notifications, achievements, streaks, materialized views for discover, `entity_stats` / leaderboards, Last.fm username + sync watermark, mobile log fields, Expo push token, co-occurrence / recommendation helpers.

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

- **Expo** app under **`mobile/`** — Google sign-in, feed, logging, lists, profile.
- Points **`EXPO_PUBLIC_API_URL`** at the **API** (typically Express **:3001**), not the Next UI port.
- **Detailed setup**: [`mobile/README.md`](mobile/README.md)

---

## Feature overview

| Area | Notes |
|------|------|
| **Auth** | Google via NextAuth; user row in `users` on first login |
| **Logging** | `logs` table — track listens, sources (`manual`, Spotify sync, Last.fm, etc.) |
| **Reviews** | Star ratings + text on albums/tracks (separate from bare listens) |
| **Feed** | Activity from followed users (`lib/feed.ts`, listen sessions, union feeds) |
| **Follow** | Follow graph, counts on profiles |
| **Discover** | Trending / rising / hidden gems (Supabase RPCs + materialized views + Spotify enrichment) |
| **Leaderboard** | Popular / top rated / most favorited (`lib/queries.getLeaderboard`) — web route **`/leaderboard`** |
| **Lists** | User lists (albums/tracks), sharing |
| **Notifications** | In-app notification feed + optional Expo push (migrations + API) |
| **Achievements & streaks** | User streaks, badges (RPC + migrations) |
| **Spotify** | Connect OAuth, sync recently played into `logs`, search (when enabled) |
| **Last.fm** | Profile username, preview/import, daily cron sync |
| **Taste match** | Compare two users’ taste (`/api/taste-match`) |

---

## API surface (Next.js)

Handlers live under **`app/api/`**. Patterns:

- **Success**: `lib/api-response.ts` — `apiOk`, `apiBadRequest`, `apiUnauthorized`, `apiInternalError`, etc.
- **Auth**: `requireApiAuth` / `getServerSession` depending on route.

Representative routes (non-exhaustive; see `app/api/` and existing README tables in git history):

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
- **Crons**: `/api/cron/*` (stats refresh, co-occurrence, Last.fm — see below)

---

## Background jobs & Vercel crons

`vercel.json` defines schedules:

| Schedule | Path | Purpose |
|----------|------|---------|
| `0 0 * * *` | `/api/cron/refresh-stats` | Refresh entity/stats materializations |
| `30 0 * * *` | `/api/cron/compute-cooccurrence` | Co-occurrence / recommendation inputs |
| `0 0 * * *` | `/api/cron/lastfm-sync` | Last.fm scrobble import per user |
| manual | `/api/cron/backfill-artist-metadata` | Spotify artist **genres**, **popularity**, **images** for rows missing data (client credentials; optional `Authorization: Bearer CRON_SECRET` when set) |

Cron routes must be secured (e.g. `CRON_SECRET` / Vercel headers) per your deployment — verify `app/api/cron/*` implementations.

**Taste identity** reads `artists.genres` (and track popularity for obscurity). Apply migration `061_add_artist_genres_popularity.sql`, then hit the backfill route so existing artists get full metadata from Spotify.

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
| **Spotify “disabled”** | Set **`NEXT_PUBLIC_ENABLE_SPOTIFY=true`** and **`ENABLE_SPOTIFY_INTEGRATION=true`** (or equivalent). |
| **Spotify Web API 403** on `/v1/artists` (batch or single) | App restrictions in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard): Development Mode limits, quota, or policy — client-credentials still need a valid app; check the JSON **`error.message`** in logs. |
| **RLS / permission errors** on admin operations | Use **service role** only in trusted server code (`lib/supabase-admin.ts`). |
| **Session / 401** | **`NEXTAUTH_URL`** must match the browser origin. |

---

## Further reading

- [`backend/README.md`](backend/README.md) — Express API, CORS, mobile Bearer auth
- [`mobile/README.md`](mobile/README.md) — Expo, OAuth, push, offline queue
- [Spotify Dashboard](https://developer.spotify.com/dashboard)
- [Supabase Docs](https://supabase.com/docs)
- [NextAuth.js](https://next-auth.js.org/)

---
