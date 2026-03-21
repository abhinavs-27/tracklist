# Tracklist mobile (Expo)

Until you sign in with Google, the app only shows the **login** screen (no tabs or other screens). After sign-in, the main app loads and your session is stored on device.

## 1. Environment (`mobile/.env`)

Create or edit **`mobile/.env`** (not committed with secrets in production):

```bash
# Express API — use your Mac’s LAN IP on a physical device (same Wi‑Fi)
EXPO_PUBLIC_API_URL=http://192.168.1.42:3001

# Same Supabase project as web (Settings → API in dashboard)
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

Optional overrides:

```bash
# Native iOS/Android OAuth return (defaults to tracklist://auth/callback; must match app.json "scheme")
# EXPO_PUBLIC_NATIVE_OAUTH_REDIRECT_URI=tracklist://auth/callback

# HTTPS Supabase callback (used only for optional HTTPS redirect detection / testing)
# EXPO_PUBLIC_SUPABASE_OAUTH_REDIRECT_URL=https://YOUR_PROJECT.supabase.co/auth/v1/callback
```

- **Simulator**: often `http://127.0.0.1:3001` works for the API if the backend runs on the host.
- **Physical device**: use the computer’s LAN IP, not `127.0.0.1`.

## 2. OAuth (Google)

### Native (iOS / Android)

Uses a **custom URL scheme** so `WebBrowser.openAuthSessionAsync` completes reliably with `ASWebAuthenticationSession` / `callbackURLScheme`:

- Default: **`tracklist://auth/callback`** (must match `"scheme": "tracklist"` in [`app.json`](app.json)).
- Flow: `signInWithOAuth` with that `redirectTo` → in-app browser → Supabase redirects to **`tracklist://auth/callback?code=...`** → session returns to the app → `getSessionFromUrl` / `exchangeCodeForSession`.

### Web

Uses **`Linking.createURL('/auth/callback')`** (exact URL must be allowlisted in Supabase; often `http://localhost:8081/--/auth/callback` in dev).

### Supabase dashboard

1. **Project** → **Settings** → **API**: copy **Project URL** and **anon public** key into `.env`.
2. **Authentication** → **Providers** → **Google**: enable and add **Client ID** / **Client secret** from [Google Cloud Console](https://console.cloud.google.com/) (OAuth client type **Web application** is typical for Supabase).
3. **Authentication** → **URL configuration** → **Redirect URLs** — add **all** of these you use:
   - **`tracklist://auth/callback`** (native)
   - **`https://<project-ref>.supabase.co/auth/v1/callback`** (Supabase / Google server-side flow)
   - Your Expo web callback, e.g. `http://localhost:8081/--/auth/callback` in dev — use `Linking.createURL('/auth/callback')` once and add the exact string Supabase shows.

### Google Cloud

For the OAuth client used by Supabase, **Authorized redirect URIs** must include Supabase’s callback:

`https://<project-ref>.supabase.co/auth/v1/callback`

## Native dependency

```bash
cd mobile && npx expo install @react-native-async-storage/async-storage
```

After install or env changes: `npx expo start -c`.

**Changing `scheme` or native OAuth** requires a native rebuild (not Expo Go):

```bash
npx expo prebuild && npx expo run:ios
# or
npx expo run:android
```

### Testing Google sign-in

1. Use a **development or standalone build** (not Expo Go) for native OAuth.
2. Tap **Continue with Google** → Safari / Chrome Custom Tab → after Google, the app should reopen with **`tracklist://...?code=`** and store the session.
3. Watch Metro for **`[oauth]`** logs: `redirectTo`, `redirect_uri` in the authorize URL, **`openAuthSessionAsync full result`**, and `result.type`. If the system returns an error string on cancel, the login screen shows that message instead of a generic cancel.

## Backend API

The app talks to your **Express** API (`EXPO_PUBLIC_API_URL`), not the Next.js UI port.

- From repo root: `cd backend && npm run dev` (default port **3001**).
- Backend needs the same Supabase setup so **Bearer** tokens from the mobile app resolve to `public.users`.
- **`GET /api/feed`** and **`GET /api/lists/:id`** (and other routes not yet in Express) are served by **Next.js**. In development the backend **proxies** unhandled `/api/*` to Next on **http://127.0.0.1:3000** by default. Run **`npm run dev`** in the repo root (Next on 3000) **and** the backend. Override with **`NEXT_API_FALLBACK`** in `backend/.env` if your Next app uses another origin.
- **HTTP 504** from the API (e.g. `/api/lists/...`) usually means the Express proxy could not reach Next in time, or **Next isn’t running** on the fallback URL (the proxy maps `ECONNREFUSED` to 504). Start the Next dev server and confirm the port matches **`NEXT_API_FALLBACK`**.
- **User lists UI**: `/user/[username]/lists` uses **`GET /api/users/:userId/lists`**; **`/list/[id]`** uses **`GET /api/lists/:id`**, which is implemented in **Express** (same JSON as web — no Next.js proxy required for reads).

### Notifications & push

- **In-app**: `GET /api/notifications`, `POST /api/notifications/mark-read` (same as web). Actor avatars/usernames are resolved via Supabase `users` (anon read must be allowed for `id, username, avatar_url`, or names fall back to “Someone”).
- **Expo push**: the app registers for notifications after sign-in and `POST`s the Expo token to **`POST /api/users/me/push-token`** (stores `users.expo_push_token` — apply migration **`051_expo_push_token.sql`**). Clearing runs on sign-out.
- **EAS project ID**: `getExpoPushTokenAsync` needs `extra.eas.projectId` in **`app.json`** (or your EAS config). Without it, push registration is skipped (dev logs a warning). Server-side sending of pushes is separate from this client work.

## Run Expo

```bash
cd mobile
npx expo start
```

## Commands (reference)

```bash
npx expo run:ios
```

```bash
pkill -f expo
pkill -f node
```

```bash
rm -rf node_modules .expo package-lock.json
npm install
npx expo start -c
npx expo run:ios
```
