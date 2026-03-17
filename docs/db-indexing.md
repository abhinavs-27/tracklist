### Database indexing in Tracklist

This project relies heavily on Postgres for queries over logs, reviews, follows, recommendations, and leaderboards. Well‑chosen indexes are critical to keep those queries fast as the dataset grows.

This document explains the most important indexes, which queries they support, and how to think about adding new ones.

---

### Key index groups

- **Logs (`logs`)**
  - `idx_logs_user` / `idx_logs_user_id`: filter by `user_id` for per‑user history and streaks.
  - `idx_logs_track_id` and `idx_logs_track_user_listened_at`: support queries like “friends who listened to this track/album” and time‑ordered track activity.
  - `idx_logs_listened_at` / `idx_logs_created_at`: power time‑based reports and recent‑activity feeds.

- **Reviews (`reviews`)**
  - `idx_reviews_user` / `idx_reviews_user_id`: fetch reviews by a given user quickly.
  - `idx_reviews_entity` and `idx_reviews_entity_created_at`: support album / song pages (all reviews for a given entity, ordered by time) and rating aggregates.

- **Follows (`follows`)**
  - `idx_follows_follower` and `idx_follows_following`: enable fast lookups of “who I follow” and “who follows me”, and are used by feed and recommendation queries that join through the follow graph.

- **Favorites (`user_favorite_albums`)**
  - `idx_user_favorite_albums_user`, `idx_favorites_user`, `idx_favorites_album`: speed up “favorite albums for this user” and “how many users favorited this album” style queries and leaderboards.

- **Precomputed stats (`album_stats`, `track_stats`, `entity_stats`)**
  - Primary keys and `idx_entity_stats_primary` on `(entity_type, entity_id)` make it cheap to fetch cached counts and averages by entity without scanning `logs` or `reviews`.
  - These tables are written by cron jobs or small RPC helpers and read on hot paths like album/song pages and leaderboards.

- **Search support (`users`, `albums`, `songs`)**
  - `idx_users_username` / `idx_users_username_trgm`: used by user search endpoints and “suggested users”.
  - `idx_albums_name` and existing `idx_songs_album` / `idx_songs_artist`: support album and track search / browse.

---

### When to add a new index

Add a new index when all of the following are true:

1. **Query is on a hot path**
   - Runs on user‑facing pages (feed, discover, leaderboards, detail pages), or in cron jobs that must stay fast as data grows.
2. **Query filters or joins on one or more columns**
   - Example patterns:
     - `WHERE user_id = ...`
     - `WHERE entity_type = 'album' AND entity_id = ...`
     - `JOIN ... ON track_id`
     - `ORDER BY created_at DESC LIMIT 50`
3. **The table is expected to grow large**
   - Logs, reviews, follows, notifications, and stats tables are prime candidates.

Before adding:

- **Check existing migrations** under `supabase/migrations/` and `db/migrations/` for an index on the same column(s).
  - Prefer `CREATE INDEX IF NOT EXISTS` to keep repeated migrations safe.
  - Avoid duplicating identical indexes under different names unless there is a clear benefit (e.g. different column order or operator class).

---

### Common index patterns

- **Single‑column indexes**
  - `CREATE INDEX ... ON table(user_id);`
  - Best for simple equality filters.

- **Composite indexes**
  - `CREATE INDEX ... ON reviews(entity_type, entity_id, created_at DESC);`
  - Use when you frequently filter on the left‑most column(s) and sort on the later ones.

- **Covering time‑ordered queries**
  - For “latest N events” by some key:
    - `CREATE INDEX ... ON logs(track_id, user_id, listened_at DESC);`

- **Text search**
  - For simple prefix or equality search, a plain btree index on `username` or `name` is often enough.
  - For fuzzy search, use trigram or full‑text indexes (see `idx_users_username_trgm`).

---

### Adding future indexes

When you notice a slow query (via EXPLAIN, logs, or observability tools):

1. **Capture the exact query** (including `WHERE`, `JOIN`, and `ORDER BY`).
2. **Run `EXPLAIN (ANALYZE, BUFFERS)` in Postgres** to see whether it’s doing a sequential scan.
3. **Design an index** that matches:
   - The filter columns (left‑most in the index),
   - And, if needed, the sort column(s).
4. **Add a migration** (e.g. under `supabase/migrations/` or `db/migrations/`) with:
   - `CREATE INDEX IF NOT EXISTS ...`
   - A short comment about which query it is meant to support.
5. **Re‑run EXPLAIN** to ensure the planner now uses the index and performance improves.

Keeping these guidelines in mind will help future contributors reason about indexes, avoid duplication, and keep Tracklist’s database fast as it grows.

