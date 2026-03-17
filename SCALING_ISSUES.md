# Scaling Analysis Report - Tracklist

This report identifies the critical scaling bottlenecks and potential weak points in the Tracklist system as it scales to a larger user base and higher activity volume.

## 1. Data Ingestion & Synchronization
*   **Sequential Background Ingestion:** The `spotify-ingest` cron job (`app/api/cron/spotify-ingest/route.ts`) processes users in batches but executes ingestion logic sequentially for each user. As the user base grows, the current 500-user cap per run will cause a significant lag in data freshness.
*   **Ingestion Resource Contention:** Each user sync triggers multiple database checks and metadata hydration calls. High volumes of concurrent syncs (from both cron and manual "Sync" buttons) could saturate database connection pools and the Spotify API quota.

## 2. Application Logic & Memory Management
*   **In-Memory Feed Merging:** The activity feed (`getActivityFeed` in `lib/queries.ts`) fetches reviews, follows, and listen sessions separately and merges them in the application layer. It performs O(N) sorting and "collapsing" logic on the combined result set, which increases memory pressure and latency as the feed size grows.
*   **Unbounded "Popularity" Calculations:** `getPopularAlbumsForArtist` fetches a deep tree of data (all albums → all songs → all logs → all reviews) to calculate a score in-memory. This will fail or time out for established artists with large catalogs.
*   **Non-Distributed Local Caching:** The system uses standard JavaScript `Map` objects for hot caches (entity stats, Spotify metadata). In a distributed or serverless environment, these caches are local to each instance, leading to low hit rates and redundant load on the database and Spotify API.
*   **Taste Match Intersection:** The taste match algorithm fetches up to 1,000 reviews per user and performs intersection logic in-memory. This becomes increasingly expensive as users accumulate interaction history.

## 3. Database Performance & Query Patterns
*   **Live Aggregation Fallbacks:** When precomputed stats are missing, `getEntityStatsLive` performs `count(*)` and `avg()` queries directly on the raw `logs` and `reviews` tables. For popular entities, these live calculations can significantly degrade database performance.
*   **"Pull" Model for Feed Sessions:** The `get_feed_listen_sessions` RPC aggregates logs from all followed users in real-time. For "heavy followers," the database must scan and aggregate logs across thousands of user IDs on every feed load, which is inefficient compared to a "push" or "fan-out" model.
*   **Hydration Round-trips (N+1 Patterns):** Most queries fetch primary entities first and then hydrate related data (like user profiles) via secondary `IN` queries rather than using database-level joins, leading to excessive network round-trips.
*   **Recommendation Matrix Scalability:** Real-time recommendation RPCs based on co-occurrence (`get_album_recommendations`) perform heavy join operations on the `logs` table. As the dataset grows, these calculations will become too slow for live API responses.

## 4. External API & Integration
*   **Spotify API Quota Management:** There is no centralized rate-limit coordinator for the Spotify API across the system. High traffic or aggressive ingestion can easily exhaust the application's global quota, affecting all users.
*   **Synchronous Metadata Hydration:** The system often blocks on Spotify API calls during request handling (e.g., `refreshAlbumFromSpotify`). Any latency or intermittent failure from Spotify directly impacts the user experience and thread availability.

## 5. Leaderboard & Search Bottlenecks
*   **Application-Layer Sorting:** The leaderboard logic (`getLeaderboard`), particularly for "Most Favorited," fetches large sets of data and performs sorting in TypeScript. This is significantly less efficient than using database-level indexes for ordered retrieval.
*   **Unbounded Global Search:** The search endpoints for users and lists use `ILIKE` patterns that, even with GIN index optimization, may struggle as the number of rows reaches high volumes.
