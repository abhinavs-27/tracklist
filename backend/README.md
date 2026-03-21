# Tracklist API backend (Express + TypeScript)

Standalone Node server that serves **`/api/*`** for the Tracklist **web** and **mobile** apps.

## Prerequisites

- Node 20+ recommended
- Same environment variables as the Next.js app for Supabase, NextAuth (`NEXTAUTH_SECRET`), and Spotify client credentials (see `.env.example`).
- **`SUPABASE_SERVICE_ROLE_KEY`** is required for database-backed endpoints (reviews, comments, discover, stats). Never ship this key to clients.

## Install

```bash
cd backend
npm install
```

## Development

Loads env from **`../.env`** (repo root) first, then **`backend/.env`**.

```bash
npm run dev
```

The server listens on **`0.0.0.0`** at **`PORT`** (default **3001** so **Next.js can use 3000** for the web UI on the same machine):

```text
[tracklist-backend] listening on http://0.0.0.0:3001
```

Opening **`http://127.0.0.1:3001/`** in a browser shows a short JSON note (this process is API-only, not your Next app).

## Production build

```bash
npm run build
npm start
```

Output is compiled to **`dist/`** (`outDir` from `tsconfig.json`).

## CORS

Allowed origins:

- `http://localhost:3000`, `http://127.0.0.1:3000`
- `http://localhost:3001`, `http://127.0.0.1:3001` (typical Next.js dev port when API is split)
- Any **`http(s)://<LAN-IP>:<port>`** matching private ranges (`192.168.x.x`, `10.x.x.x`, `172.16–31.x.x`)

`credentials: true` is enabled so browsers can send cookies (e.g. NextAuth session cookie) when calling this API from the web app.

## Mobile (Expo)

1. Put your machine’s LAN IP in **`mobile/.env`**:

   ```bash
   EXPO_PUBLIC_API_URL=http://<LAN_IP>:3001
   ```

2. Phone/simulator must be on the **same Wi‑Fi** as your computer.

3. Start **this backend first** (`npm run dev` in `backend/`), then Expo:

   ```bash
   cd mobile
   npx expo start -c
   ```

4. Authenticated calls: **web** sends the **NextAuth session cookie**; the **Expo app** sends **`Authorization: Bearer <Supabase access token>`** (same Supabase project). The backend resolves `public.users` by email and can create a row on first mobile login (mirrors web NextAuth `signIn`).

## Web (Next.js)

**Recommended on one machine:** Next.js on **3000** (the site at `http://127.0.0.1:3000`), Express on **3001** (API only).

```bash
cd backend && npm run dev          # default :3001
cd .. && npx next dev              # default :3000
```

In root **`.env`**, point the Next proxy at the API:

```bash
API_BACKEND_URL=http://127.0.0.1:3001
```

Keep **`NEXTAUTH_URL=http://127.0.0.1:3000`** (or whatever host/port you use for Next). Do **not** open **`http://127.0.0.1:3001/`** expecting the UI—that’s only the API server.

3. **NextAuth / Google OAuth** still use Next’s **`/api/auth/*`**. For Express routes not implemented yet, set **`NEXT_API_FALLBACK=http://127.0.0.1:3000`** on the **backend** so it proxies to Next’s remaining **`/api/*`** handlers.

## Implemented routes (native Express)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/health` | Liveness |
| GET | `/api/leaderboard` | Query: `type` or `metric`, `entity`, `cursor`, `limit`, year filters. Uses DB when configured; otherwise **example items**. |
| GET | `/api/discover` | Recent reviewers / users |
| GET | `/api/discover/rising-artists` | `limit`, `windowDays`. Example data if DB missing. |
| GET | `/api/discover/trending` | |
| GET | `/api/discover/hidden-gems` | `limit`, `minRating`, `maxListens` |
| GET/POST | `/api/reviews` | |
| PATCH/DELETE | `/api/reviews/:id` | |
| GET/POST | `/api/comments` | Includes `review_id` / `log_id` schema fallback |
| POST/DELETE | `/api/likes` | |
| GET | `/api/search` | Spotify search |
| GET | `/api/search/users` | DB user search (auth required) |
| GET | `/api/albums/:id` | Spotify album + DB stats when configured |
| GET | `/api/spotify/song/:id` | Rate limited |
| GET | `/api/auth/session` | **Minimal** session JSON for clients expecting NextAuth shape |

## Migrating from Next.js `/app/api`

1. **Implement** new handlers under `backend/routes/` (small routers) or `backend/services/` (shared logic).
2. **Register** the router in `backend/routes/index.ts` **before** the fallback proxy.
3. **Remove** the matching route from `app/api` in Next.js when you no longer need the proxy.

### Optional: proxy unimplemented routes

If Next.js still has legacy handlers, set:

```bash
NEXT_API_FALLBACK=http://127.0.0.1:3000
```

(Use the origin where **Next.js** is running.) Any request under `/api` that is **not** handled in Express is forwarded to that origin (e.g. `/api/feed` → Next).

## Extending

- Add **`routes/myFeature.ts`** exporting an `express.Router()`.
- **`api.use("/my-feature", myFeatureRouter)`** in `routes/index.ts`.
- Keep handlers thin; put Supabase/Spotify logic in **`services/`**.

## Scripts (from requirements)

- **`npm run dev`** — `nodemon --watch './**/*.ts' --exec 'ts-node' server.ts`
- **`npm start`** — `node dist/server.js`
