# Tracklist — Music listening logs (Letterboxd for music)

A music social media MVP where users sign in with Google, search for music via Spotify, log and rate listens, follow users, and see a feed of activity. Built with Next.js (App Router), TypeScript, TailwindCSS, NextAuth.js, Supabase (PostgreSQL), and Spotify Web API.

## Features

- **Authentication**: Google OAuth via NextAuth.js; user record created on first login
- **Search**: Artists, albums, and tracks via Spotify Web API
- **Logging**: Log album or track listens with 1–5 rating, review, and listen date
- **Profiles**: Username, avatar, bio, followers/following, recent logs; edit own profile
- **Follow system**: Follow/unfollow users; follower/following counts
- **Activity feed**: Homepage feed of logs from users you follow
- **Likes & comments**: Like logs and comment on them

## Tech stack

- **Frontend & backend**: Next.js 16 (App Router), TypeScript, TailwindCSS
- **Auth**: NextAuth.js, Google OAuth
- **Database**: PostgreSQL on Supabase (Supabase JS client, no ORM)
- **Music data**: Spotify Web API
- **Testing**: Playwright E2E

## Getting started

### 1. Clone and install

```bash
git clone <repo>
cd music-social-media
npm install
```

### 2. Environment variables

Copy the example env and fill in values:

```bash
cp .env.example .env.local
```

Required variables:

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `NEXTAUTH_SECRET` | Secret for NextAuth (e.g. `openssl rand -base64 32`) |
| `NEXTAUTH_URL` | App URL (e.g. `http://localhost:3000`) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) |
| `SPOTIFY_CLIENT_ID` | Spotify app client ID |
| `SPOTIFY_CLIENT_SECRET` | Spotify app client secret |

### 3. Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. In the **SQL Editor**, run the **migrations in order** (paste each file’s contents and run):
   - `supabase/migrations/001_initial_schema.sql` — tables and initial indexes
   - `supabase/migrations/002_audit_indexes.sql` — feed/comments indexes  
   Run any newer migration files in numeric order if present.
3. Copy the project URL and keys from **Settings → API** into `.env.local`.

### 4. Google OAuth

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.
2. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
3. Application type: **Web application**.
4. Authorized JavaScript origins: `http://localhost:3000` (and your production URL later).
5. Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google`.
6. Copy Client ID and Client Secret into `.env.local`.

### 5. Spotify API

1. Open [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and create an app.
2. Copy Client ID and Client Secret into `.env.local`.
3. No redirect URI is needed for Client Credentials (search/artist/album) only.

### 6. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign in with Google, search for music, and log listens.

## Scripts

| Command | Description |
|--------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run test:e2e` | Run Playwright E2E tests |
| `npm run lint` | Run ESLint |

## E2E tests

Playwright tests cover:

- Authentication (sign-in page, feed redirect when unauthenticated)
- Search (search page, query and results)
- Feed (redirect or feed content)
- Logging (album page and log flow)
- Likes and comments (home/feed with log cards)
- Profile and follow (profile route, navbar)

Run with the app available (dev server is started automatically if not in CI):

```bash
npm run test:e2e
```

If the dev server fails to start (e.g. missing env), run it manually in another terminal (`npm run dev`) and then run `npm run test:e2e`. You can set `PLAYWRIGHT_TEST_BASE_URL` if the app runs on another port.

## Project structure

```
/app
  /api
    /auth/[...nextauth]   # NextAuth handler
    /logs                # Create, list logs
    /logs/[id]           # Delete own log
    /follow              # Follow / unfollow
    /feed                # Activity feed
    /comments            # Comments on logs
    /likes               # Like / unlike
    /search              # Spotify search proxy
    /users/[username]    # Get/update profile
  /artist/[id]           # Artist page
  /album/[id]            # Album page (with log button)
  /profile/[username]    # User profile
  /search                # Search page
  /feed                  # Feed page
  /auth/signin           # Sign-in page
/components              # Navbar, SearchBar, cards, LogCard, etc.
/lib
  supabase.ts            # Supabase clients
  spotify.ts             # Spotify API helpers
  auth.ts                # Session helpers
  feed.ts                # Feed aggregation
/types                   # Shared TypeScript types
/supabase
  migrations/           # Run in order in SQL Editor (001_..., 002_..., ...)
  schema.sql            # Pointer: use migrations, do not run directly
/tests                   # Playwright E2E
```

## Code quality and security

- **Database indexes**: Composite index `logs(user_id, created_at DESC)` for feed; `comments(log_id, created_at)` for ordered comments.
- **Feed performance**: Feed caps followed-user set (500) and limit (100); selects only needed columns.
- **API errors**: Standardized responses via `lib/api-response.ts`; 500s return a generic message (internal details only in server logs).
- **Input validation** (`lib/validation.ts`): UUIDs for `log_id`, `following_id`, `user_id`; Spotify ID format; username (3–30 chars, alphanumeric + underscore); comment/review/search length limits; clamped limits for `limit` params.
- **Security**: All ID path/query/body params validated; JSON body parse wrapped in try/catch; FK errors (e.g. like on missing log) return 400/409 instead of 500.

**SQL is migration-based.** Add new changes as numbered files in `supabase/migrations/` and run only the new ones in Supabase’s SQL Editor so you never have to reset the database.

## Database and migrations

All SQL changes live in **`supabase/migrations/`**. Apply them in order by pasting each file into the Supabase SQL Editor. New changes = new numbered migration file (e.g. `003_add_xyz.sql`), so you can paste forward without resetting the database.

## Database schema (summary)

- **users**: id, email, username, avatar_url, bio, created_at
- **follows**: follower_id, following_id
- **logs**: user_id, spotify_id, type (song|album), title, rating, review, listened_at
- **likes**: user_id, log_id
- **comments**: user_id, log_id, content
- **lists**, **list_items**, **favorites**: created for future use

## License

MIT
