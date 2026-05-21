# Ratings as First-Class Objects

**Date:** 2026-05-21
**Status:** Approved — ready for implementation planning

---

## Problem

Ratings are secondary data today. They don't feed the taste system, don't drive social matching, and have no dedicated UI surface. This creates two compounding problems:

1. **Cold start blocks casual users.** The app's best features (taste identity, social matching, community recommendations) require listening history via Last.fm. Users who won't create a Last.fm account have no path to value — their profile is empty regardless of how much music they know and love.

2. **Ratings feel invisible.** A user who rates 30 albums has the same taste signal as a brand new user. There's no diary, no profile section, no social layer — rating something goes nowhere.

The fix: make ratings a first-class signal algorithmically, and a first-class surface in the UI.

---

## Goals

- Ratings feed the taste identity and social matching system as a primary signal when logs are sparse or absent
- Users can see their ratings as a chronological diary on their profile
- Friends' reviews are prioritized on album/song pages
- Last.fm is incentivized organically through the diary — not through warnings or walls
- Onboarding's album-picker step is reframed as "build your taste profile" with star ratings

---

## Non-Goals

- Activity feed events for ratings (not a feed-based product)
- Half-star precision changes (schema already supports 1–5 in 0.5 steps)
- Apple Music integration (future)
- Full onboarding restructure (separate spec)

---

## Architecture

### 1. Taste System — Ratings as Primary Signal

**Current:** `computeTasteIdentity` reads only from `user_listening_aggregates`. `seedTasteIdentityFromFavoriteAlbums` bootstraps up to 4 albums from onboarding, then gets fully replaced on the first real cron run.

**New:** Ratings are a parallel input stream into `computeTasteIdentity`. When logs exist, ratings augment them. When logs are absent or sparse (< ~50 total plays), ratings carry the full weight.

**Rating → synthetic weight mapping:**

| Rating | Weight |
|--------|--------|
| 5★     | 15     |
| 4.5★   | 12     |
| 4★     | 8      |
| 3.5★   | 4      |
| 3★     | 2      |
| < 3★   | 0 (excluded) |

This maps to a synthetic "play count" for that album's artist and genres. The existing genre/artist weight accumulation logic in `computeTasteIdentity` accepts this as input without structural changes — it's a new data source feeding the same pipeline.

**Implementation touch points in `lib/taste/taste-identity.ts`:**
- New helper: `fetchUserRatings(admin, userId)` — fetches `reviews` joined to `albums`/`tracks` for artist and album metadata
- New helper: `ratingsToWeightMap(ratings)` — maps rating scores to synthetic weights per artist/genre
- Merge step in `computeTasteIdentity`: blend ratings-derived weights with log-derived weights before building `topArtists`, `topAlbums`, `topGenres`
- `seedTasteIdentityFromFavoriteAlbums`: expand album cap from 4 to unlimited (all onboarding picks contribute, not just 4)

**Social matching** (`lib/taste/taste-match.ts`, `getUserMatches.ts`): no changes needed — taste vectors are already built from the identity, so fixing the identity fixes matching automatically.

**Cold-start summary text**: when `totalLogs === 0` but ratings exist, replace `"Log more listens to build your taste profile."` with `"Rated {n} albums · taste profile built from your ratings"`.

---

### 2. Profile Diary Tab

New `"Reviews"` tab on user profiles. Visible to any visitor (follows existing `logs_private` semantics — if logs are private, reviews tab is still public unless we later add a separate reviews_private flag).

**Entry anatomy (per review):**
- Month/year group header ("May 2026")
- Album art or track thumbnail (40×40px)
- Entity type badge: small "Album" / "Track" pill
- Entity name + artist name
- Half-star rating display (read-only `StarGlyph` component, already exists)
- Review text snippet if present (2 lines, expandable inline)
- Listen count: "played 23×" — **only shown if user has Last.fm connected**. Pulled from `user_listening_aggregates`. Absent when no Last.fm — creates a visible data gap that organically incentivizes connection.

**Sorting/filtering:**
- Default: reverse chronological by `reviews.created_at`
- Filter toggle: All / Albums / Tracks
- Year picker (generated from the user's review date range)

**Last.fm incentivization callout:**
When a user has ≥ 3 reviews but no `lastfm_username`:

> *"Connect Last.fm to see how many times you've listened to each of these."*

Single line, shown once at the top of the diary. Links to the Last.fm connect modal. Not a wall — the diary is fully usable without it.

**Profile header stat:** Add "X reviews" to the stat line alongside followers/following. Links to the Reviews tab.

**New files:**
- `components/profile/profile-reviews-tab.tsx` — tab container with filter state
- `components/profile/profile-diary-entry.tsx` — single diary entry row
- `app/api/users/[username]/reviews/route.ts` — paginated reviews for a user, joined to album/track/artist metadata and listen counts

**Existing files modified:**
- `app/profile/[username]/page.tsx` (or equivalent) — add Reviews tab
- `components/profile-header.tsx` — add review count stat

---

### 3. Album/Song Pages — Friends First

**Current:** Reviews section shows all reviews sorted by recency or helpfulness.

**Change:** Reviews from followed users are sorted to the top. A subtle "Friends" label groups them. Non-friend reviews follow below.

Implementation: the existing reviews query adds a join/subquery on `follows` for the viewer's userId. If viewer is not logged in, no change — existing sort applies.

**Touch point:** wherever the album/song reviews are fetched for the page (likely in `lib/queries.ts` or the album page server component). No new API endpoint needed — augment the existing reviews query with a `viewer_id` parameter.

---

### 4. Onboarding — Rating-First Reframe

The existing Step 2 (favorite albums picker) is reframed, not restructured.

**Current framing:** "Pick your favorite albums" — feels like a preference form, no sense of permanence.

**New framing:** "Rate albums you know and love" — same album picker, but:
- Star rating input appears per album (can pick album then immediately rate it 1–5★ in 0.5 steps)
- Subtitle changes to: "These ratings build your taste profile and help you find people with similar taste."
- Album cap removed: users can rate as many albums as they want, not just 4
- `seedTasteIdentityFromFavoriteAlbums` replaced with `seedTasteIdentityFromRatings` which saves ratings to the `reviews` table (not just the taste cache) — so these are real, permanent ratings that appear in their diary

**Post-onboarding state:** a user who rates 10 albums during onboarding immediately has:
- A populated taste identity and listening style label
- Matched users and community recommendations
- 10 entries in their diary

This is the core unlock for non-Last.fm users.

---

### 5. Explore — "Loved by Friends" Sort

**Current:** "Most talked about" section on explore page orders by review count.

**Change:** Add a sort option alongside it: "Loved by friends" — orders by average rating from users the viewer follows, minimum 2 friend ratings required to appear. Falls back to global avg rating if viewer has few follows or is logged out.

Touch point: new or modified RPC in Supabase (`get_loved_by_friends`) — joins `reviews` to `follows` on `follower_id = viewer_id`, aggregates avg rating per entity among followed users.

---

## Data Flow

```
Onboarding album rating
        │
        ▼
  reviews table ──────────────────────────────────┐
        │                                          │
        │  fetchUserRatings()                      │
        ▼                                          ▼
  ratingsToWeightMap()                   Profile diary query
        │                                (with listen counts
        │                                 from user_listening_aggregates
        ▼                                 when Last.fm connected)
  computeTasteIdentity()
  (merged with log-derived weights)
        │
        ├──► topArtists / topAlbums / topGenres
        ├──► listeningStyle
        ├──► social matching vectors
        └──► community recommendations
```

---

## Testing

- Unit: `ratingsToWeightMap` — correct weights for each half-star step, 0 for < 3★
- Unit: `computeTasteIdentity` with ratings only (no logs) — produces non-empty identity
- Unit: `computeTasteIdentity` with both ratings and logs — logs don't get overridden by ratings
- E2E: new user rates 5 albums in onboarding → profile shows taste identity + Reviews tab with 5 entries
- E2E: album page shows friend reviews above stranger reviews when logged in
- E2E: diary listen count visible when Last.fm connected, absent when not

---

## Open Questions

1. Should ratings made during onboarding be marked differently (e.g., `source: 'onboarding'`) or treated as normal reviews? Leaning toward normal — they're real ratings, not synthetic seeds.
2. Does the Reviews tab appear on your own profile only, or on any user's profile? Leaning toward any user's profile (public by default, same as other profile content).
3. Rate limiting on the `seedTasteIdentityFromRatings` path during onboarding — if a user rates 30 albums, this could be a lot of DB writes. Batch insert is cleaner.
