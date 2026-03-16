# Music Social Media — Tracklist

A music social app: sign in with Google, connect Spotify, search and log listens, follow users, and see a feed of activity. Built with Next.js (App Router), TypeScript, TailwindCSS, NextAuth, Supabase, and the Spotify Web API.

---

## 1. Project overview

### What it does

- **Authentication**: Sign in with Google (NextAuth). First-time users get a `users` row and a generated username.
- **Spotify**:
  - **Connect**: OAuth flow stores `access_token`, `refresh_token`, and `expires_at` in `spotify_tokens`. Tokens are refreshed automatically when expired (`lib/spotify-user.ts` → `getValidSpotifyAccessToken`).
  - **Recently played**: Cached in `spotify_recent_tracks`; refreshed from Spotify when cache is older than 5 minutes. Profile shows “Recently played” from this cache.
  - **Sync**: “Sync recently played” pulls from Spotify and inserts new album/song entries into `logs` (no duplicate `spotify_id` per user).
  - **Search**: Artists, albums, and tracks via Spotify (client-credentials in `lib/spotify.ts`; user-scoped calls use tokens from `spotify_tokens`).
- **Logging**: Log album or track listens with 1–5 rating, optional review and title, and listen date. Stored in `logs` with `spotify_id` and `type` (song/album).
- **Profiles**: Username, avatar, bio, followers/following, recent reviews, recent albums (from logs), taste match, and (when connected) recently played from cache. Own profile: edit bio/username/avatar, connect Spotify, sync, view recently played.
- **Follow system**: Follow/unfollow users; follower and following counts on profiles.
- **Feed**: Home and `/feed` show logs from users you follow (`lib/feed.ts` → `getFeedForUser`).
- **Likes & comments**: Like logs and comment on them; like counts and comment threads on feed and log cards.
- **Discover**: “Recently active” users based on latest album logs; follow from the grid.
- **Taste match**: Compare two users’ album logs and get a similarity score and shared albums (`/api/taste-match`).

### Main entrypoints

| Area           | Key files / modules                                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------------------------------- |
| App shell      | `app/layout.tsx`, `components/navbar.tsx`, `components/providers.tsx`                                                |
| Auth           | `app/api/auth/[...nextauth]/route.ts`, `lib/auth.ts`, `app/auth/signin/page.tsx`                                     |
| Spotify OAuth  | `app/api/spotify/connect/route.ts`, `app/api/spotify/callback/route.ts`, `lib/spotify-user.ts`                       |
| Spotify tokens | `lib/spotify-user.ts` (`getValidSpotifyAccessToken`, `refreshSpotifyAccessToken`), `lib/spotify-sync.ts`             |
| Search         | `app/search/page.tsx`, `app/search/search-content.tsx`, `lib/spotify.ts` (client credentials)                        |
| Logs & feed    | `app/api/logs/route.ts`, `lib/feed.ts`, `app/feed/page.tsx`, `app/page.tsx`                                          |
| Profile        | `app/profile/[username]/page.tsx`, `components/spotify-connection-card.tsx`, `components/recently-played-tracks.tsx` |
| API helpers    | `lib/api-response.ts`, `lib/validation.ts`                                                                           |
| DB (server)    | `lib/supabase.ts` (anon + service role), `lib/supabase-server.ts`, `lib/supabase-admin.ts`                           |

---

## 2. Setup instructions

### Prerequisites

- Node.js 18+
- npm (or yarn/pnpm)

### Steps

1. **Clone and install**

   ```bash
   git clone <repo-url>
   cd music-social-media
   npm install
   ```

2. **Environment variables**  
   Copy `.env.example` to `.env.local` and set every variable (see [Environment variables](#4-environment-variables)).

3. **Database**  
   Create a Supabase project at [supabase.com](https://supabase.com). In the SQL Editor, run migrations in order:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_audit_indexes.sql`
   - `supabase/migrations/003_spotify_tokens.sql`
   - `supabase/migrations/004_logs_spotify_created_index.sql`
   - `supabase/migrations/006_spotify_recent_tracks.sql`  
     Note: `005_token_policy.sql` targets Supabase Auth (`auth.users`). If you use only NextAuth and the custom `users` table, rely on 001 and 003; skip or adapt 005 if your schema uses `users(id)`.

4. **Google OAuth**  
   In [Google Cloud Console](https://console.cloud.google.com/): create OAuth 2.0 credentials (Web application).
   - Authorized JavaScript origins: `http://127.0.0.1:3000` (and production URL).
   - Authorized redirect URIs: `http://127.0.0.1:3000/api/auth/callback/google`.  
     Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env.local`.

5. **Spotify**  
   In [Spotify Developer Dashboard](https://developer.spotify.com/dashboard): create an app.
   - For **search** (client credentials): set Client ID and Client Secret.
   - For **Connect & recently played**: add Redirect URI exactly `http://127.0.0.1:3000/api/spotify/callback` (or your `SPOTIFY_REDIRECT_URI`). Set scopes as needed (e.g. `user-read-recently-played`).  
     Set `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, and optionally `SPOTIFY_REDIRECT_URI` in `.env.local`.

6. **Run**
   ```bash
   npm run dev
   ```
   Open `http://127.0.0.1:3000` (or the URL in `NEXTAUTH_URL`).

---

## 3. Dependencies

| Dependency                | Purpose                                    |
| ------------------------- | ------------------------------------------ |
| **Next.js** 16            | App Router, API routes, RSC                |
| **React** 19              | UI                                         |
| **NextAuth** 4            | Google OAuth, JWT session, user sync to DB |
| **@supabase/supabase-js** | PostgreSQL client (anon + service role)    |
| **TypeScript**            | Typing                                     |
| **TailwindCSS** 4         | Styling                                    |
| **Playwright**            | E2E tests                                  |

No ORM: Supabase client is used directly for all DB access.

---

## 4. Environment variables

Set these in `.env.local` (see `.env.example`).

| Variable                    | Required | Description                                                                                                                                           |
| --------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`          | Yes      | Google OAuth client ID                                                                                                                                |
| `GOOGLE_CLIENT_SECRET`      | Yes      | Google OAuth client secret                                                                                                                            |
| `NEXTAUTH_SECRET`           | Yes      | NextAuth encryption secret; e.g. `openssl rand -base64 32`                                                                                            |
| `NEXTAUTH_URL`              | Yes      | App URL, e.g. `http://127.0.0.1:3000` or `https://yourdomain.com`                                                                                     |
| `SUPABASE_URL`              | Yes      | Supabase project URL                                                                                                                                  |
| `SUPABASE_ANON_KEY`         | Yes      | Supabase anon/public key (used by client and some server code)                                                                                        |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes      | Supabase service role key; **server-only**; used to bypass RLS for `spotify_tokens`, `spotify_recent_tracks`, and other server operations             |
| `SPOTIFY_CLIENT_ID`         | Yes      | Spotify app client ID                                                                                                                                 |
| `SPOTIFY_CLIENT_SECRET`     | Yes      | Spotify app client secret                                                                                                                             |
| `SPOTIFY_REDIRECT_URI`      | No       | Exact redirect URI for Spotify OAuth. If unset, defaults to `{NEXTAUTH_URL}/api/spotify/callback` (e.g. `http://127.0.0.1:3000/api/spotify/callback`) |

Do **not** expose `NEXTAUTH_SECRET` or `SUPABASE_SERVICE_ROLE_KEY` to the client.

---

## 5. API routes

| Method        | Route                          | Purpose                                                                                                                                                                                        |
| ------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------- |
| NextAuth      | `/api/auth/*`                  | Google sign-in, session (see `app/api/auth/[...nextauth]/route.ts`)                                                                                                                            |
| GET           | `/api/spotify/connect`         | Start Spotify OAuth; sets `spotify_oauth_state` and `spotify_oauth_return_to` cookies; redirects to Spotify. Query: `returnTo` (optional path).                                                |
| GET           | `/api/spotify/callback`        | Spotify callback; validates state cookie, exchanges code, upserts `spotify_tokens` (only if no row yet for user), redirects to `returnTo` or profile. Uses `createSupabaseAdminClient` for DB. |
| GET           | `/api/spotify/status`          | Returns `{ connected, expires_at? }` for current user (reads `spotify_tokens`).                                                                                                                |
| POST          | `/api/spotify/sync`            | Sync recently played from Spotify into `logs`. Query: `mode=album                                                                                                                              | song | both`. Uses `getValidSpotifyAccessToken`, then `getRecentlyPlayed`. |
| GET           | `/api/spotify/recently-played` | Returns cached recently played (from `spotify_recent_tracks`). If cache older than 5 minutes, refreshes token, calls `syncRecentlyPlayed`, then returns cache (max 50).                        |
| GET           | `/api/spotify/album/[id]`      | Album details by Spotify ID (client credentials).                                                                                                                                              |
| GET           | `/api/search`                  | Search artists/albums/tracks. Query: `q`, `type`, `limit`. Uses `lib/spotify.ts`.                                                                                                              |
| GET / POST    | `/api/logs`                    | List logs (query: `user_id`, `limit`) or create a log (body: `spotify_id`, `type`, `rating`, etc.).                                                                                            |
| DELETE        | `/api/logs/[id]`               | Delete a log (owner only).                                                                                                                                                                     |
| GET           | `/api/feed`                    | Feed of logs from followed users. Query: `limit`. Uses `lib/feed.ts`.                                                                                                                          |
| POST / DELETE | `/api/follow`                  | Follow (body: `following_id`) or unfollow (body: `following_id`).                                                                                                                              |
| POST / DELETE | `/api/likes`                   | Like or unlike a log (body: `log_id`).                                                                                                                                                         |
| GET / POST    | `/api/comments`                | List comments for a log (query: `log_id`) or post a comment (body: `log_id`, `content`).                                                                                                       |
| GET           | `/api/discover`                | Discover “recently active” users (query: `limit`).                                                                                                                                             |
| GET           | `/api/taste-match`             | Taste match between two users. Query: `userA`, `userB`.                                                                                                                                        |
| GET / PATCH   | `/api/users/[username]`        | Get user by username or update own profile (PATCH: `username`, `bio`, `avatar_url`).                                                                                                           |

All authenticated routes use `getServerSession(authOptions)` from `app/api/auth/[...nextauth]/route.ts`. Helpers: `lib/api-response.ts` (`apiUnauthorized`, `apiBadRequest`, `apiInternalError`, etc.).

---

## 6. Authentication

- **Google OAuth**: NextAuth with Google provider. Sign-in page: `app/auth/signin/page.tsx`. Config: `app/api/auth/[...nextauth]/route.ts` (`authOptions`).
- **User record**: On first sign-in, `signIn` callback creates a row in `users` (email, generated username, avatar_url, bio). JWT callback loads `id`, `username`, `avatar_url`, `bio` from `users` and attaches them to the token; session callback exposes them on `session.user` (see `types/next-auth.d.ts`).
- **Session**: JWT-based; `getServerSession(authOptions)` in API routes and RSC. Client: `SessionProvider` in `components/providers.tsx`.
- **Spotify OAuth**: Separate from NextAuth. User clicks “Connect Spotify” → `/api/spotify/connect` → Spotify authorize → `/api/spotify/callback`. State is stored in cookies (`spotify_oauth_state`, `spotify_oauth_return_to`); callback validates state, exchanges code via `exchangeSpotifyCode` in `lib/spotify-user.ts`, and upserts `spotify_tokens` (only if user has no token yet). Redirect URI is built in `lib/spotify-user.ts` (`buildRedirectUri()`).

---

## 7. Database

### Tables (from migrations)

- **users**: `id` (UUID, PK), `email` (unique), `username` (unique), `avatar_url`, `bio`, `created_at`. Synced from NextAuth on first login.
- **follows**: `follower_id`, `following_id` → `users(id)`. Unique on (follower_id, following_id).
- **logs**: `user_id`, `spotify_id`, `type` (song/album), `title`, `rating` (1–5), `review`, `listened_at`, `created_at`. Indexes on `user_id`, `spotify_id`, `created_at`, (spotify_id, created_at).
- **likes**: `user_id`, `log_id`. Unique (user_id, log_id).
- **comments**: `user_id`, `log_id`, `content`, `created_at`.
- **spotify_tokens**: `user_id` (PK, FK → users), `access_token`, `refresh_token`, `expires_at`, `created_at`, `updated_at`. Used only by server (service role / admin client).
- **spotify_recent_tracks**: `user_id`, `track_id`, `track_name`, `artist_name`, `album_name`, `album_image`, `played_at`, `created_at`. Unique (user_id, track_id, played_at). Index (user_id, played_at DESC).
- **lists**, **list_items**: Present in 001 for future use.
- **user_favorite_albums**: Per-user ordered album favorites for profiles and “most favorited” leaderboard.

### RLS and client usage

- **Public client** (`lib/supabase-client.ts`): **anon key** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`). Safe for browser and server. RLS applies. Use for all normal application queries.
- **Server client** (`lib/supabase-server.ts`): **anon key** with cookie-based session support (`@supabase/ssr`). Use in Server Components, Route Handlers, Server Actions. When Supabase Auth is used, `auth.uid()` resolves so RLS works. Call with `await createSupabaseServerClient()`.
- **Admin client** (`lib/supabase-admin.ts`): **service role key** only. Use for cron jobs, `spotify_tokens`, ingestion, and other backend tasks that must bypass RLS. Never expose to the browser.
- **spotify_tokens** / **spotify_recent_tracks**: RLS enabled; no anon policies. All access via **admin client** (callback, token refresh, status, profile check, cron).
- **Other tables**: Use **server client** (anon + cookies) for feed, logs, follow, discover, taste-match, etc., so RLS can apply when Supabase Auth is in use.

---

## 8. Usage (after setup)

1. **Sign in**: Open app → “Sign in with Google”. First time creates your user and username.
2. **Profile**: Go to your profile (e.g. `/profile/<username>` from nav). Edit bio/username/avatar in the edit modal.
3. **Connect Spotify**: In the Spotify section on your profile, click “Connect Spotify”. Approve in Spotify, then you’re redirected back; a token is stored. If a token already exists, the callback returns “Spotify is already connected” and the Connect control is disabled.
4. **Recently played**: On your profile, “Recently played” is loaded from `/api/spotify/recently-played` (cache in `spotify_recent_tracks`; refreshed from Spotify if cache &gt; 5 min).
5. **Sync**: Click “Sync recently played” to import recent Spotify plays into `logs` (albums/songs). You can then rate and review them.
6. **Search**: Use Search to find artists, albums, or tracks (Spotify). Open an album/track and “Log” to add a log (rating, review, date).
7. **Feed**: Home and Feed show logs from users you follow. Like and comment on logs.
8. **Discover**: Discover page lists recently active users; you can follow them.
9. **Taste match**: On a profile, taste match compares your album logs with that user’s and shows a score and shared albums.

---

## 9. Troubleshooting

- **Spotify “redirect_uri_mismatch”**  
  Redirect URI in Spotify Dashboard must match **exactly** what the app sends (no trailing slash, correct scheme/host/path). For production, set `NEXTAUTH_URL` to your site URL (e.g. `https://tracklistsocial.com`); the app will use `{NEXTAUTH_URL}/api/spotify/callback`. Add that exact URL in [Spotify Dashboard](https://developer.spotify.com/dashboard) → your app → Redirect URIs. (Server logs log the redirect URI used when you click Connect—use that value if unsure.) For local dev use `http://127.0.0.1:3000/api/spotify/callback` and same base in `NEXTAUTH_URL`.

- **Token saving / “new row violates row-level security”**  
  Writes to `spotify_tokens` (and `spotify_recent_tracks`) must use a Supabase client with the **service role key** (or an admin client that uses it), not the anon key. Ensure:
  - `app/api/spotify/callback/route.ts` uses `createSupabaseAdminClient()` (from `lib/supabase-admin.ts`).
  - `lib/supabase-admin.ts` uses `SUPABASE_SERVICE_ROLE_KEY` for token/recent-tracks writes (if it currently uses anon key, RLS will block inserts; switch to service role for those operations).

- **“Spotify not connected” on sync or recently played**  
  User must complete “Connect Spotify” once so a row exists in `spotify_tokens`. If the row exists but refresh fails, check Spotify app settings (refresh token scope, redirect URI) and logs for refresh errors.

- **Session / 401 on API calls**  
  Ensure `NEXTAUTH_URL` matches the URL you’re using in the browser (e.g. `http://127.0.0.1:3000`). Cookies are set for that origin.

- **Migrations**  
  Run in order (001 → 006). If 005 references `auth.users` and you use only NextAuth + custom `users` table, 003’s `users(id)` reference is the one in use; skip or adapt 005 to avoid conflicts.

---

## 10. Optional features / future improvements

- **Lists / list_items**: Tables exist in schema; no UI or API yet.
- **Ratings on sync**: “Sync recently played” currently inserts logs with a placeholder rating; could add a flow to set rating/review on sync.
- **Top artists**: Profile has a “Top artists” placeholder; could derive from logs or Spotify API.
- **Notifications**: No in-app notifications for likes/comments/follows.
- **RLS for anon client**: Currently most access is server-side with service role. Could introduce anon key + RLS for selected tables and use it from client or from API routes that act “as” the user.
- **E2E**: Playwright tests in `tests/`; extend for Spotify connect, sync, and recently played flows.

---

For a minimal path to run: set all env vars, run migrations 001–004 and 006, configure Google and Spotify as above, then `npm run dev` and open `NEXTAUTH_URL`.
