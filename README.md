# Tracklist — Music Social Media

Tracklist is a music social platform that integrates deeply with Spotify to allow users to log their listening history, rate and review music, follow friends, and discover new tracks through a data-driven community experience.

---

## 🏗 System Architecture

Tracklist is built with a modern full-stack architecture focusing on type-safety, performance, and real-time capabilities.

### Tech Stack
- **Framework**: Next.js 16 (App Router, Server Components)
- **UI**: React 19, Tailwind CSS 4
- **Authentication**: NextAuth.js 4 (Google OAuth)
- **Database**: Supabase (Postgres + Row Level Security)
- **Data Fetching**: TanStack Query v5
- **External API**: Spotify Web API

### Data Flow & Security
The application utilizes three distinct Supabase client configurations to balance security and functionality:
1.  **Public Client (`lib/supabase-client.ts`)**: Uses the anon key. Applies Row Level Security (RLS) policies. Used for browser-side interactions.
2.  **Server Client (`lib/supabase-server.ts`)**: Uses `@supabase/ssr` for cookie-based auth in Server Components and Route Handlers. Honors user-level RLS.
3.  **Admin Client (`lib/supabase-admin.ts`)**: Uses the Service Role key. Bypasses RLS for system-level tasks like token management, background ingestion, and cache warming. **Never exposed to the client.**

---

## ✨ Core Features & Flows

### 1. Authentication & User Onboarding
- **Google Sign-In**: Powered by NextAuth. On first login, a record is automatically provisioned in the `users` table with a generated unique username.
- **Profile Management**: Users can customize their bio, avatar, and username. Profile data is synced between the database and the NextAuth session.

### 2. Spotify Integration
The "heart" of the app, providing a seamless bridge to the user's music library.
- **OAuth Flow**: Separate from main auth, users "Connect Spotify" to grant `user-read-recently-played` scopes. Tokens are stored securely in `spotify_tokens`.
- **Automated Ingestion**:
    - **Manual Sync**: Users can trigger a sync from their profile to pull the last 50 tracks.
    - **Background Cron**: A system-level cron job (`/api/cron/spotify-ingest`) iterates through connected users to ingest listening history into the `logs` table.
- **Caching Layer**: To avoid Spotify API rate limits, entities (Artists, Albums, Tracks) are cached in local tables (`artists`, `albums`, `songs`) with a TTL managed via `cached_at`.

### 3. Logging & Reviews
- **Passive Logs**: Automated ingestion from Spotify creates entries in the `logs` table. These represent "listens" without manual input.
- **Active Reviews**: Users can explicitly "Rate & Review" any album or track. This adds a 1-5 star rating and optional text to the `reviews` table.
- **Engagement**: Users can "Like" and "Comment" on reviews, fostering discussion.

### 4. Social Graph & Activity Feed
- **Follow System**: A classic follower/following model stored in the `follows` table.
- **Unified Feed**: The feed (`/feed`) aggregates three types of activity from followed users:
    - **New Reviews**: High-priority items showing ratings and text.
    - **Follow Events**: When a friend follows someone new.
    - **Listen Sessions**: Passive listens are intelligently grouped into 30-minute buckets. Consecutive listens from the same user are collapsed into "N songs" summaries to prevent feed flooding.

### 5. Discovery & Insights
- **Advanced RPCs**: The system uses PostgreSQL functions (RPCs) for complex data aggregation:
    - `get_trending_entities`: Identifies hot tracks/albums based on recent log volume.
    - `get_rising_artists`: Detects artists with the highest growth in unique listeners.
    - `get_hidden_gems`: Finds highly-rated entities with low total listen counts.
- **Taste Match**: A comparison engine that calculates a similarity score (0-100) between two users based on their shared highly-rated albums.
- **Leaderboards**: Community-wide rankings for Popular, Top Rated (weighted by volume), and Most Favorited entities.

### 6. Engagement Systems
- **Streaks**: Tracks consecutive days of listening activity.
- **Achievements**: Gamified badges (e.g., "First Review", "List Maker") granted via database triggers and RPCs.
- **Weekly Reports**: Automated summaries of a user's top tracks, artists, and total listen time.

---

## 📊 Data Model

### Key Tables
- `users`: Core profile data.
- `logs`: Passive listening history (Track ID + Timestamp).
- `reviews`: Manual ratings and text (Entity ID + Rating + Text).
- `follows`: User relationship mapping.
- `spotify_tokens`: Secure storage for encrypted Spotify refresh tokens.
- `lists`: User-curated collections of albums or songs.
- `notifications`: Actor-based alerts for social interactions.
- `user_favorite_albums`: Managed "Top 10" or similar favorites for profile display.

---

## 🚀 Getting Started

### Environment Variables
Required keys in `.env.local`:
```env
# Auth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000

# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Spotify
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REDIRECT_URI=http://localhost:3000/api/spotify/callback

# System
CRON_SECRET=
```

### Installation
```bash
npm install
npm run dev
```

### Database Setup
Apply migrations located in `supabase/migrations/` in numerical order using the Supabase SQL Editor.

---

## 🛠 Development Guide

- **Linting**: `npm run lint`
- **Type Checking**: `npm run typecheck`
- **E2E Testing**: `npm run test:e2e` (Requires `NEXT_PUBLIC_E2E=1`)
- **API Response**: Always use the helpers in `lib/api-response.ts` (`apiOk`, `apiError`, etc.) for consistency.
- **Audit Logs**: All mutations should follow the logging pattern: `console.log('[service] action', { metadata })`.
