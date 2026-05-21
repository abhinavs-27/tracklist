# Ratings as First-Class Objects — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make album/song ratings feed the taste system, power a profile diary, prioritize friends' reviews on entity pages, and replace the onboarding album picker with a genre-first rating flow.

**Architecture:** Ratings from the existing `reviews` table (NUMERIC 1–5 in 0.5 steps) are merged into `computeTasteIdentity` as synthetic play-weight signals. A new `Reviews` profile tab shows a diary ordered by `reviews.created_at`. Onboarding Step 2 is replaced: users pick genres → see curated albums per genre → rate them (half-stars, no minimum) → ratings batch-insert to `reviews` and seed the taste cache.

**Tech Stack:** Next.js App Router, Supabase (admin client for taste, server client for profile reads), Vitest unit tests, React Server Components + client components.

---

## File Map

**New files:**
- `supabase/migrations/166_preferred_genres.sql`
- `lib/taste/ratings-weight.ts` — pure `ratingToSyntheticWeight` + `ratingsToArtistCountMap`
- `lib/taste/ratings-weight.test.ts`
- `lib/onboarding/genre-map.ts` — 18 curated genre definitions + tag mappings
- `lib/onboarding/genre-albums.ts` — 6–8 curated album stubs per genre
- `app/api/onboarding/album-suggestions/route.ts`
- `app/api/users/[username]/reviews/route.ts`
- `components/onboarding/genre-picker.tsx`
- `components/onboarding/rating-grid.tsx`
- `components/profile/profile-diary-entry.tsx`
- `components/profile/profile-reviews-tab.tsx`

**Modified files:**
- `lib/taste/taste-identity.ts` — add `fetchUserAlbumRatings`, merge weights, replace seed fn
- `lib/queries.ts` — add `viewerId` to `getReviewsForEntity` for friends-first sort
- `components/profile/profile-tabs.tsx` — add `"reviews"` tab type + prop
- `app/profile/[id]/profile-deferred-body.tsx` — wire reviews tab + count
- `components/profile-header.tsx` — add `reviewCount` stat

---

## Task 1: DB Migration — `users.preferred_genres`

**Files:**
- Create: `supabase/migrations/166_preferred_genres.sql`

- [ ] **Step 1: Write migration**

```sql
-- supabase/migrations/166_preferred_genres.sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS preferred_genres TEXT[] NOT NULL DEFAULT '{}';
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push
```

Expected: migration applies cleanly, no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/166_preferred_genres.sql
git commit -m "feat: migration 166 — users.preferred_genres column"
```

---

## Task 2: Pure Rating Weight Helpers

**Files:**
- Create: `lib/taste/ratings-weight.ts`
- Create: `lib/taste/ratings-weight.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// lib/taste/ratings-weight.test.ts
import { describe, it, expect } from "vitest";
import { ratingToSyntheticWeight, ratingsToArtistCountMap } from "./ratings-weight";

describe("ratingToSyntheticWeight", () => {
  it("returns 15 for 5 stars", () => expect(ratingToSyntheticWeight(5)).toBe(15));
  it("returns 12 for 4.5 stars", () => expect(ratingToSyntheticWeight(4.5)).toBe(12));
  it("returns 8 for 4 stars", () => expect(ratingToSyntheticWeight(4)).toBe(8));
  it("returns 4 for 3.5 stars", () => expect(ratingToSyntheticWeight(3.5)).toBe(4));
  it("returns 2 for 3 stars", () => expect(ratingToSyntheticWeight(3)).toBe(2));
  it("returns 0 for 2.5 stars", () => expect(ratingToSyntheticWeight(2.5)).toBe(0));
  it("returns 0 for 1 star", () => expect(ratingToSyntheticWeight(1)).toBe(0));
});

describe("ratingsToArtistCountMap", () => {
  it("sums synthetic weights per artist", () => {
    const ratings = [
      { albumId: "a1", artistId: "artist1", rating: 5 },
      { albumId: "a2", artistId: "artist1", rating: 4 },
      { albumId: "a3", artistId: "artist2", rating: 3 },
    ];
    const result = ratingsToArtistCountMap(ratings);
    expect(result.get("artist1")).toBe(23); // 15 + 8
    expect(result.get("artist2")).toBe(2);
  });

  it("excludes ratings below 3 stars", () => {
    const ratings = [
      { albumId: "a1", artistId: "artist1", rating: 2.5 },
      { albumId: "a2", artistId: "artist1", rating: 1 },
    ];
    const result = ratingsToArtistCountMap(ratings);
    expect(result.size).toBe(0);
  });

  it("skips entries with no artistId", () => {
    const ratings = [{ albumId: "a1", artistId: null as unknown as string, rating: 5 }];
    const result = ratingsToArtistCountMap(ratings);
    expect(result.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm run test:unit -- lib/taste/ratings-weight.test.ts
```

Expected: FAIL — "Cannot find module './ratings-weight'"

- [ ] **Step 3: Implement**

```typescript
// lib/taste/ratings-weight.ts

export type RatingEntry = {
  albumId: string;
  artistId: string;
  rating: number;
};

/** Maps a half-star rating (1–5) to a synthetic play-count weight. < 3★ → 0. */
export function ratingToSyntheticWeight(rating: number): number {
  if (rating >= 5) return 15;
  if (rating >= 4.5) return 12;
  if (rating >= 4) return 8;
  if (rating >= 3.5) return 4;
  if (rating >= 3) return 2;
  return 0;
}

/**
 * Given rated albums (with resolved artistId), returns a Map<artistId, syntheticCount>
 * suitable for merging with log-derived artistCounts in computeTasteIdentity.
 */
export function ratingsToArtistCountMap(
  ratings: RatingEntry[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const { artistId, rating } of ratings) {
    if (!artistId) continue;
    const weight = ratingToSyntheticWeight(rating);
    if (weight === 0) continue;
    out.set(artistId, (out.get(artistId) ?? 0) + weight);
  }
  return out;
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm run test:unit -- lib/taste/ratings-weight.test.ts
```

Expected: PASS — 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/taste/ratings-weight.ts lib/taste/ratings-weight.test.ts
git commit -m "feat: ratingToSyntheticWeight + ratingsToArtistCountMap helpers"
```

---

## Task 3: Merge Ratings into `computeTasteIdentity`

**Files:**
- Modify: `lib/taste/taste-identity.ts`

- [ ] **Step 1: Add `fetchUserAlbumRatings` helper**

Add this function directly below the `fetchAlbumsBatch` helper (around line 985):

```typescript
/** Fetches all album reviews (rating ≥ 3) for a user, resolved to artistId. */
async function fetchUserAlbumRatings(
  admin: SupabaseClient,
  userId: string,
): Promise<import("./ratings-weight").RatingEntry[]> {
  const { data, error } = await admin
    .from("reviews")
    .select("entity_id, rating")
    .eq("user_id", userId)
    .eq("entity_type", "album")
    .gte("rating", 3);

  if (error || !data?.length) return [];

  const albumIds = data.map((r) => (r as { entity_id: string; rating: number }).entity_id);
  const albumMeta = await fetchAlbumsBatch(admin, albumIds);

  return data.map((r) => {
    const row = r as { entity_id: string; rating: number };
    const album = albumMeta.get(row.entity_id);
    return {
      albumId: row.entity_id,
      artistId: album?.artist_id ?? "",
      rating: row.rating,
    };
  });
}
```

- [ ] **Step 2: Add import at top of `taste-identity.ts`**

Find the existing import block at the top of the file and add:

```typescript
import { ratingsToArtistCountMap } from "./ratings-weight";
```

- [ ] **Step 3: Merge rating weights into `computeTasteIdentity`**

In `computeTasteIdentity`, find this block (around line 998):

```typescript
  if (totalLogs === 0 && artistAgg.length === 0) {
    return { ...EMPTY };
  }

  const artistCounts = new Map(artistAgg.map((r) => [r.entity_id, r.count]));
```

Replace with:

```typescript
  const [ratingEntries] = await Promise.all([
    fetchUserAlbumRatings(admin, userId),
  ]);
  const ratingArtistCounts = ratingsToArtistCountMap(ratingEntries);

  if (totalLogs === 0 && artistAgg.length === 0 && ratingArtistCounts.size === 0) {
    return { ...EMPTY };
  }

  const artistCounts = new Map(artistAgg.map((r) => [r.entity_id, r.count]));
  // Merge ratings-derived synthetic weights into log-derived counts.
  // For zero-log users, ratings carry the full signal.
  // For active listeners, the small synthetic weights (max 15/album) are a minor nudge.
  for (const [artistId, syntheticCount] of ratingArtistCounts) {
    artistCounts.set(artistId, (artistCounts.get(artistId) ?? 0) + syntheticCount);
  }
```

- [ ] **Step 4: Update cold-start summary text**

Find in `normalizeCachedTasteIdentity` (around line 268):

```typescript
    return { ...base, summary: EMPTY.summary, recent: undefined };
```

Replace with:

```typescript
    const ratingCount = base.topAlbums.length;
    const coldSummary = ratingCount > 0
      ? `Rated ${ratingCount} album${ratingCount === 1 ? "" : "s"} · taste profile built from your ratings`
      : EMPTY.summary;
    return { ...base, summary: coldSummary, recent: undefined };
```

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/taste/taste-identity.ts
git commit -m "feat: merge album ratings as synthetic weights in computeTasteIdentity"
```

---

## Task 4: `seedTasteIdentityFromRatings`

**Files:**
- Modify: `lib/taste/taste-identity.ts`

- [ ] **Step 1: Add new seed function**

Find `seedTasteIdentityFromFavoriteAlbums` (around line 1298) and add this new function immediately before it:

```typescript
/**
 * Batch-inserts onboarding ratings to `reviews`, saves preferred_genres,
 * and seeds taste_identity_cache. Replaces seedTasteIdentityFromFavoriteAlbums.
 */
export async function seedTasteIdentityFromRatings(
  userId: string,
  ratings: Array<{ albumId: string; rating: number; reviewText?: string }>,
  preferredGenres: string[],
): Promise<void> {
  const admin = createSupabaseAdminClient();

  // 1. Save preferred genres
  if (preferredGenres.length > 0) {
    await admin
      .from("users")
      .update({ preferred_genres: preferredGenres })
      .eq("id", userId);
  }

  // 2. Batch-insert reviews (upsert so re-running onboarding doesn't duplicate)
  const validRatings = ratings.filter((r) => r.albumId && r.rating >= 1 && r.rating <= 5);
  if (validRatings.length > 0) {
    const rows = validRatings.map((r) => ({
      user_id: userId,
      entity_type: "album" as const,
      entity_id: r.albumId,
      rating: r.rating,
      review_text: r.reviewText ?? null,
    }));
    await admin
      .from("reviews")
      .upsert(rows, { onConflict: "user_id,entity_type,entity_id", ignoreDuplicates: false });
  }

  // 3. Seed taste identity from the newly saved ratings
  if (validRatings.length > 0) {
    const albumIds = validRatings.map((r) => r.albumId);
    await seedTasteIdentityFromFavoriteAlbums(userId, albumIds);
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/taste/taste-identity.ts
git commit -m "feat: seedTasteIdentityFromRatings — batch-inserts reviews + seeds cache"
```

---

## Task 5: User Reviews API Endpoint

**Files:**
- Create: `app/api/users/[username]/reviews/route.ts`

- [ ] **Step 1: Check what data `getReviewsForUser` returns vs what we need**

We need album art, artist name, and listen count (when Last.fm connected). The existing `getReviewsForUser` returns `entity_id` but no joined metadata. We'll build the enrichment in the route.

- [ ] **Step 2: Create the route**

```typescript
// app/api/users/[username]/reviews/route.ts
import { withHandler } from "@/lib/api-handler";
import { apiNotFound, apiOk } from "@/lib/api-response";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const PAGE_SIZE = 30;

export const GET = withHandler(
  async (request, { user: viewer, params }) => {
    const { username } = await params as { username: string };
    const url = new URL(request.url);
    const filter = url.searchParams.get("filter") ?? "all";
    const yearParam = url.searchParams.get("year");
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));

    const supabase = await createSupabaseServerClient();

    // Resolve user by username
    const { data: profileUser } = await supabase
      .from("users")
      .select("id, lastfm_username")
      .eq("username", username)
      .maybeSingle();

    if (!profileUser) return apiNotFound("User not found");

    const admin = createSupabaseAdminClient();
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = admin
      .from("reviews")
      .select("id, entity_type, entity_id, rating, review_text, created_at")
      .eq("user_id", profileUser.id)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (filter === "albums") query = query.eq("entity_type", "album");
    if (filter === "tracks") query = query.eq("entity_type", "song");

    if (yearParam) {
      const y = parseInt(yearParam, 10);
      if (!isNaN(y)) {
        query = query
          .gte("created_at", `${y}-01-01T00:00:00Z`)
          .lt("created_at", `${y + 1}-01-01T00:00:00Z`);
      }
    }

    const { data: reviews, error } = await query;
    if (error) return apiOk({ reviews: [], hasLastfm: false });

    const rows = (reviews ?? []) as Array<{
      id: string;
      entity_type: string;
      entity_id: string;
      rating: number;
      review_text: string | null;
      created_at: string;
    }>;

    if (rows.length === 0) return apiOk({ reviews: [], hasLastfm: !!profileUser.lastfm_username });

    // Enrich album entities
    const albumIds = rows.filter((r) => r.entity_type === "album").map((r) => r.entity_id);
    const trackIds = rows.filter((r) => r.entity_type === "song").map((r) => r.entity_id);

    const [albumsRes, tracksRes] = await Promise.all([
      albumIds.length
        ? admin
            .from("albums")
            .select("id, name, image_url, artist_id")
            .in("id", albumIds)
        : Promise.resolve({ data: [] }),
      trackIds.length
        ? admin
            .from("tracks")
            .select("id, name, album_id, artist_id")
            .in("id", trackIds)
        : Promise.resolve({ data: [] }),
    ]);

    const albumMap = new Map(
      ((albumsRes.data ?? []) as Array<{ id: string; name: string; image_url: string | null; artist_id: string }>)
        .map((a) => [a.id, a]),
    );
    const trackMap = new Map(
      ((tracksRes.data ?? []) as Array<{ id: string; name: string; album_id: string | null; artist_id: string | null }>)
        .map((t) => [t.id, t]),
    );

    // Resolve artist names
    const artistIds = [
      ...new Set([
        ...Array.from(albumMap.values()).map((a) => a.artist_id),
        ...Array.from(trackMap.values()).map((t) => t.artist_id).filter(Boolean),
      ]),
    ] as string[];

    const { data: artistRows } = await admin
      .from("artists")
      .select("id, name")
      .in("id", artistIds);

    const artistMap = new Map(
      ((artistRows ?? []) as Array<{ id: string; name: string }>).map((a) => [a.id, a.name]),
    );

    // Listen counts from aggregates (only for album entries when Last.fm connected)
    const listenCountMap = new Map<string, number>();
    if (profileUser.lastfm_username && albumIds.length > 0) {
      const { data: aggRows } = await admin
        .from("user_listening_aggregates")
        .select("entity_id, count")
        .eq("user_id", profileUser.id)
        .eq("entity_type", "album")
        .in("entity_id", albumIds);

      for (const row of (aggRows ?? []) as Array<{ entity_id: string; count: number }>) {
        listenCountMap.set(
          row.entity_id,
          (listenCountMap.get(row.entity_id) ?? 0) + row.count,
        );
      }
    }

    const enriched = rows.map((r) => {
      if (r.entity_type === "album") {
        const album = albumMap.get(r.entity_id);
        return {
          id: r.id,
          entity_type: "album",
          entity_id: r.entity_id,
          rating: r.rating,
          review_text: r.review_text,
          created_at: r.created_at,
          name: album?.name ?? null,
          image_url: album?.image_url ?? null,
          artist_name: album ? (artistMap.get(album.artist_id) ?? null) : null,
          listen_count: listenCountMap.get(r.entity_id) ?? null,
        };
      }
      const track = trackMap.get(r.entity_id);
      return {
        id: r.id,
        entity_type: "song",
        entity_id: r.entity_id,
        rating: r.rating,
        review_text: r.review_text,
        created_at: r.created_at,
        name: track?.name ?? null,
        image_url: null,
        artist_name: track?.artist_id ? (artistMap.get(track.artist_id) ?? null) : null,
        listen_count: null,
      };
    });

    // Available years (for year picker)
    const { data: yearRows } = await admin
      .from("reviews")
      .select("created_at")
      .eq("user_id", profileUser.id)
      .order("created_at", { ascending: true })
      .limit(1);
    const earliest = (yearRows?.[0] as { created_at: string } | undefined)?.created_at;
    const currentYear = new Date().getFullYear();
    const earliestYear = earliest ? new Date(earliest).getFullYear() : currentYear;
    const availableYears = Array.from(
      { length: currentYear - earliestYear + 1 },
      (_, i) => currentYear - i,
    );

    return apiOk({
      reviews: enriched,
      hasLastfm: !!profileUser.lastfm_username,
      availableYears,
    });
  },
  { requireAuth: false },
);
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/users/\[username\]/reviews/route.ts
git commit -m "feat: GET /api/users/[username]/reviews — paginated diary endpoint"
```

---

## Task 6: `ProfileDiaryEntry` Component

**Files:**
- Create: `components/profile/profile-diary-entry.tsx`

- [ ] **Step 1: Create component**

```typescript
// components/profile/profile-diary-entry.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

export type DiaryEntry = {
  id: string;
  entity_type: "album" | "song";
  entity_id: string;
  rating: number;
  review_text: string | null;
  created_at: string;
  name: string | null;
  image_url: string | null;
  artist_name: string | null;
  listen_count: number | null;
};

function HalfStarDisplay({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const filled = rating >= i;
        const half = !filled && rating >= i - 0.5;
        return (
          <span key={i} className="relative inline-block h-3.5 w-3.5 text-zinc-700">
            <span className="absolute inset-0 flex items-center justify-center text-sm leading-none">★</span>
            <span
              className="absolute inset-y-0 left-0 overflow-hidden text-amber-400 text-sm leading-none flex items-center justify-center w-3.5"
              style={{ width: filled ? "100%" : half ? "50%" : "0%" }}
            >
              ★
            </span>
          </span>
        );
      })}
      <span className="ml-1 text-xs tabular-nums text-zinc-500">{rating}</span>
    </span>
  );
}

export function ProfileDiaryEntry({ entry }: { entry: DiaryEntry }) {
  const [expanded, setExpanded] = useState(false);
  const href = entry.entity_type === "album"
    ? `/album/${entry.entity_id}`
    : `/song/${entry.entity_id}`;

  const date = new Date(entry.created_at);
  const day = date.getDate();

  return (
    <div className="flex gap-3 py-3">
      {/* Day number */}
      <div className="w-7 shrink-0 pt-0.5 text-right text-sm tabular-nums text-zinc-600">
        {day}
      </div>

      {/* Art */}
      <Link href={href} className="shrink-0">
        {entry.image_url ? (
          <Image
            src={entry.image_url}
            alt={entry.name ?? ""}
            width={40}
            height={40}
            className="rounded object-cover"
          />
        ) : (
          <div className="h-10 w-10 rounded bg-zinc-800" />
        )}
      </Link>

      {/* Main content */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <Link href={href} className="truncate text-sm font-medium text-white hover:underline">
            {entry.name ?? "Unknown"}
          </Link>
          <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            {entry.entity_type === "album" ? "Album" : "Track"}
          </span>
          {entry.artist_name ? (
            <span className="truncate text-sm text-zinc-500">{entry.artist_name}</span>
          ) : null}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <HalfStarDisplay rating={entry.rating} />
          {entry.listen_count != null && entry.listen_count > 0 ? (
            <span className="text-xs text-zinc-600">
              played {entry.listen_count}×
            </span>
          ) : null}
        </div>

        {entry.review_text ? (
          <div className="mt-1.5">
            <p
              className={`text-sm leading-relaxed text-zinc-400 ${expanded ? "" : "line-clamp-2"}`}
            >
              {entry.review_text}
            </p>
            {entry.review_text.length > 120 ? (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-0.5 text-xs text-zinc-600 hover:text-zinc-400"
              >
                {expanded ? "less" : "more"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/profile/profile-diary-entry.tsx
git commit -m "feat: ProfileDiaryEntry component — half-star display, listen count, expandable review"
```

---

## Task 7: `ProfileReviewsTab` Component

**Files:**
- Create: `components/profile/profile-reviews-tab.tsx`

- [ ] **Step 1: Create component**

```typescript
// components/profile/profile-reviews-tab.tsx
"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ProfileDiaryEntry, type DiaryEntry } from "./profile-diary-entry";
import { LastfmConnectModal } from "@/components/onboarding/lastfm-connect-modal";

type Props = {
  username: string;
  isOwnProfile: boolean;
  hasLastfm: boolean;
  initialReviewCount: number;
};

type DiaryResponse = {
  reviews: DiaryEntry[];
  hasLastfm: boolean;
  availableYears: number[];
};

function groupByMonth(reviews: DiaryEntry[]): Array<{ label: string; entries: DiaryEntry[] }> {
  const groups = new Map<string, DiaryEntry[]>();
  for (const r of reviews) {
    const d = new Date(r.created_at);
    const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(r);
  }
  return Array.from(groups.entries()).map(([label, entries]) => ({ label, entries }));
}

export function ProfileReviewsTab({ username, isOwnProfile, hasLastfm, initialReviewCount }: Props) {
  const [filter, setFilter] = useState<"all" | "albums" | "tracks">("all");
  const [year, setYear] = useState<number | null>(null);
  const [lastfmModalOpen, setLastfmModalOpen] = useState(false);

  const { data, isLoading } = useQuery<DiaryResponse>({
    queryKey: ["profile-reviews", username, filter, year],
    queryFn: async () => {
      const params = new URLSearchParams({ filter });
      if (year) params.set("year", String(year));
      const res = await fetch(`/api/users/${username}/reviews?${params}`);
      if (!res.ok) throw new Error("Failed to load reviews");
      return res.json() as Promise<DiaryResponse>;
    },
  });

  const reviews = data?.reviews ?? [];
  const availableYears = data?.availableYears ?? [];
  const showLastfmNudge = isOwnProfile && !hasLastfm && initialReviewCount >= 3;
  const grouped = groupByMonth(reviews);

  return (
    <div>
      {showLastfmNudge ? (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm text-zinc-400">
          <span>Connect Last.fm to see how many times you've listened to each of these.</span>
          <button
            type="button"
            onClick={() => setLastfmModalOpen(true)}
            className="shrink-0 text-emerald-400 hover:text-emerald-300"
          >
            Connect →
          </button>
        </div>
      ) : null}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-zinc-800 bg-zinc-900 p-0.5 text-sm">
          {(["all", "albums", "tracks"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1 capitalize transition ${
                filter === f ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {availableYears.length > 1 ? (
          <select
            value={year ?? ""}
            onChange={(e) => setYear(e.target.value ? parseInt(e.target.value, 10) : null)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-300"
          >
            <option value="">All years</option>
            {availableYears.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        ) : null}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex gap-3">
              <div className="h-10 w-10 animate-pulse rounded bg-zinc-800" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-2/3 animate-pulse rounded bg-zinc-800" />
                <div className="h-3 w-1/3 animate-pulse rounded bg-zinc-800/70" />
              </div>
            </div>
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-600">
          {isOwnProfile ? "Rate some albums to build your diary." : "No reviews yet."}
        </p>
      ) : (
        <div>
          {grouped.map(({ label, entries }) => (
            <div key={label} className="mb-6">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-widest text-zinc-600">
                {label}
              </h3>
              <div className="divide-y divide-zinc-800/60">
                {entries.map((entry) => (
                  <ProfileDiaryEntry key={entry.id} entry={entry} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {lastfmModalOpen ? (
        <LastfmConnectModal
          open={lastfmModalOpen}
          onClose={() => setLastfmModalOpen(false)}
          onSkip={() => setLastfmModalOpen(false)}
          onConnected={() => setLastfmModalOpen(false)}
        />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/profile/profile-reviews-tab.tsx
git commit -m "feat: ProfileReviewsTab — diary with month grouping, filters, Last.fm nudge"
```

---

## Task 8: Wire Reviews Tab into Profile Page

**Files:**
- Modify: `components/profile/profile-tabs.tsx`
- Modify: `app/profile/[id]/profile-deferred-body.tsx`
- Modify: `components/profile-header.tsx`

- [ ] **Step 1: Add `reviews` to `ProfileTab` type and `ProfileTabsContainer`**

In `components/profile/profile-tabs.tsx`, replace:

```typescript
export type ProfileTab = "overview" | "lists" | "settings";

const BASE_TABS: { id: ProfileTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "lists", label: "Lists" },
];

export function ProfileTabsContainer({
  overviewContent,
  listsContent,
  settingsContent,
  defaultTab = "overview",
}: {
  overviewContent: ReactNode;
  listsContent: ReactNode;
  /** Only rendered when provided — settings tab is omitted for other-user profiles. */
  settingsContent?: ReactNode;
  defaultTab?: ProfileTab;
}) {
  const tabs = settingsContent
    ? [...BASE_TABS, { id: "settings" as ProfileTab, label: "Settings" }]
    : BASE_TABS;
```

With:

```typescript
export type ProfileTab = "overview" | "lists" | "reviews" | "settings";

const BASE_TABS: { id: ProfileTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "lists", label: "Lists" },
  { id: "reviews", label: "Reviews" },
];

export function ProfileTabsContainer({
  overviewContent,
  listsContent,
  reviewsContent,
  settingsContent,
  defaultTab = "overview",
}: {
  overviewContent: ReactNode;
  listsContent: ReactNode;
  reviewsContent: ReactNode;
  /** Only rendered when provided — settings tab is omitted for other-user profiles. */
  settingsContent?: ReactNode;
  defaultTab?: ProfileTab;
}) {
  const tabs = settingsContent
    ? [...BASE_TABS, { id: "settings" as ProfileTab, label: "Settings" }]
    : BASE_TABS;
```

Then find where tab panes are rendered near the bottom of `ProfileTabsContainer` and add the reviews pane:

```typescript
      <div className={active === "reviews" ? undefined : "hidden"}>
        {reviewsContent}
      </div>
```

(Add this after the existing `lists` pane div.)

- [ ] **Step 2: Add `reviewCount` to `ProfileHeader`**

In `components/profile-header.tsx`, find the Props type and add:

```typescript
  reviewCount?: number;
```

Then find the followers/following stat line (the `div` with `flex flex-wrap items-center gap-x-1`) and add a reviews count link after the following button:

```typescript
          <span className="text-zinc-600" aria-hidden>·</span>
          {typeof reviewCount === "number" && reviewCount > 0 ? (
            <span className="inline-flex items-baseline gap-1 px-1.5 py-0.5 text-sm text-zinc-400">
              <span className="font-medium tabular-nums text-zinc-200">{reviewCount}</span>
              <span>reviews</span>
            </span>
          ) : null}
```

- [ ] **Step 3: Wire into `profile-deferred-body.tsx`**

In `app/profile/[id]/profile-deferred-body.tsx`, add at the top of the file:

```typescript
import { ProfileReviewsTab } from "@/components/profile/profile-reviews-tab";
```

Then find `getReviewsForUser` or equivalent import/call and add a reviews count fetch. In the `ProfileDeferredBody` function body, add:

```typescript
  // Fetch review count for header stat
  const [reviewCountRes] = await Promise.all([
    // Reuse supabase client if available, or create one
    createSupabaseServerClient().then((sb) =>
      sb
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
    ),
  ]);
  const reviewCount = reviewCountRes.count ?? 0;
```

Then build the reviews tab content:

```typescript
  const reviewsTab = (
    <ProfileReviewsTab
      username={profile.username}
      isOwnProfile={isOwnProfile}
      hasLastfm={!!user.lastfm_username}
      initialReviewCount={reviewCount}
    />
  );
```

Pass `reviewsContent={reviewsTab}` to `ProfileTabsContainer`, and `reviewCount={reviewCount}` to `ProfileHeader`.

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Start dev server and verify Reviews tab appears**

```bash
npm run dev
```

Navigate to any profile page. Verify:
- "Reviews" tab appears between "Lists" and "Settings"
- Own profile with reviews shows the diary entries
- Empty state shows for users with no reviews

- [ ] **Step 6: Commit**

```bash
git add components/profile/profile-tabs.tsx app/profile/\[id\]/profile-deferred-body.tsx components/profile-header.tsx
git commit -m "feat: Reviews tab on profile page with diary view and review count stat"
```

---

## Task 9: Friends-First Reviews on Entity Pages

**Files:**
- Modify: `lib/queries.ts`

- [ ] **Step 1: Update `getReviewsForEntity` to accept `viewerId`**

In `lib/queries.ts`, find the `getReviewsForEntity` function signature:

```typescript
export async function getReviewsForEntity(
  entityType: "album" | "song",
  entityId: string,
  limit = 20,
): Promise<ReviewsResult | null> {
```

Replace with:

```typescript
export async function getReviewsForEntity(
  entityType: "album" | "song",
  entityId: string,
  limit = 20,
  viewerId?: string | null,
): Promise<ReviewsResult | null> {
```

- [ ] **Step 2: Add friends-first sort after building `reviews` array**

Find this block in `getReviewsForEntity` (around line 385):

```typescript
    const reviews: ReviewWithUser[] = reviewRows.map((r) => {
```

Add friend-id resolution before it:

```typescript
    let friendIds = new Set<string>();
    if (viewerId) {
      const { data: followRows } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", viewerId)
        .limit(500);
      friendIds = new Set((followRows ?? []).map((f) => (f as { following_id: string }).following_id));
    }
```

Then after building the `reviews` array, add the sort:

```typescript
    if (friendIds.size > 0) {
      reviews.sort((a, b) => {
        const aFriend = friendIds.has(a.user_id) ? 0 : 1;
        const bFriend = friendIds.has(b.user_id) ? 0 : 1;
        if (aFriend !== bFriend) return aFriend - bFriend;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    }
```

- [ ] **Step 3: Pass `viewerId` from album/song page callers**

Search for all callsites of `getReviewsForEntity`:

```bash
grep -rn "getReviewsForEntity" app/ --include="*.ts" --include="*.tsx"
```

For each callsite in an authenticated server component/route, pass the viewer's userId as the fourth argument. Example pattern:

```typescript
const reviews = await getReviewsForEntity(entityType, entityId, 20, session?.user?.id ?? null);
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/queries.ts
git commit -m "feat: friends-first sort in getReviewsForEntity when viewerId provided"
```

---

## Task 10: Explore — "Loved by Friends" RPC + UI

**Files:**
- Create: `supabase/migrations/167_loved_by_friends_rpc.sql`
- Modify: whichever component renders the "most talked about" section in `app/explore/`

- [ ] **Step 1: Write migration**

```sql
-- supabase/migrations/167_loved_by_friends_rpc.sql
CREATE OR REPLACE FUNCTION get_loved_by_friends(
  p_viewer_id UUID,
  p_entity_type TEXT DEFAULT 'album',
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  entity_id TEXT,
  entity_type TEXT,
  avg_friend_rating NUMERIC,
  friend_review_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.entity_id,
    r.entity_type,
    ROUND(AVG(r.rating)::numeric, 1) AS avg_friend_rating,
    COUNT(*)::bigint AS friend_review_count
  FROM reviews r
  INNER JOIN follows f
    ON f.following_id = r.user_id
    AND f.follower_id = p_viewer_id
  WHERE r.entity_type = p_entity_type
  GROUP BY r.entity_id, r.entity_type
  HAVING COUNT(*) >= 1
  ORDER BY avg_friend_rating DESC, friend_review_count DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
$$;
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push
```

- [ ] **Step 3: Find the "most talked about" component**

```bash
grep -rn "most.*talked\|talked.*about\|MostTalked\|review_count.*order\|order.*review_count" app/explore/ components/explore/ --include="*.tsx" --include="*.ts" | head -10
```

- [ ] **Step 4: Add "Loved by friends" sort toggle**

In the component that renders the most-talked-about section, add a sort state and a toggle button. When `sort === "friends"` and the viewer is logged in, call the new RPC:

```typescript
const { data } = await supabase.rpc("get_loved_by_friends", {
  p_viewer_id: viewerId,
  p_entity_type: "album",
  p_limit: 10,
});
```

Show a "Loved by friends / Most talked about" toggle above the section. Falls back to existing "most talked about" query when viewer is logged out or selects that option.

- [ ] **Step 5: Typecheck + verify in browser**

```bash
npm run typecheck && npm run dev
```

Navigate to `/explore`. Verify the toggle appears and "Loved by friends" shows friend-rated albums when logged in.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/167_loved_by_friends_rpc.sql
git commit -m "feat: get_loved_by_friends RPC + explore toggle"
```

---

## Task 11: Onboarding Static Data — Genre Map + Curated Albums

**Files:**
- Create: `lib/onboarding/genre-map.ts`
- Create: `lib/onboarding/genre-albums.ts`

- [ ] **Step 1: Create genre map**

```typescript
// lib/onboarding/genre-map.ts

export type GenreKey =
  | "rock" | "indie" | "pop" | "hip-hop" | "rnb-soul"
  | "electronic" | "jazz" | "classical" | "metal" | "folk"
  | "alternative" | "punk" | "funk" | "reggae" | "latin"
  | "ambient" | "experimental" | "country";

export type Genre = {
  key: GenreKey;
  label: string;
  /** Substrings matched against lowercase artist genre tags */
  tagMatches: string[];
};

export const GENRES: Genre[] = [
  { key: "rock",         label: "Rock",           tagMatches: ["rock"] },
  { key: "indie",        label: "Indie",          tagMatches: ["indie", "chamber pop", "lo-fi"] },
  { key: "pop",          label: "Pop",            tagMatches: ["pop"] },
  { key: "hip-hop",      label: "Hip-Hop",        tagMatches: ["hip hop", "hip-hop", "rap", "trap", "drill"] },
  { key: "rnb-soul",     label: "R&B / Soul",     tagMatches: ["r&b", "soul", "neo soul", "rhythm and blues"] },
  { key: "electronic",   label: "Electronic",     tagMatches: ["electronic", "techno", "house", "edm", "electro", "dance"] },
  { key: "jazz",         label: "Jazz",           tagMatches: ["jazz", "bebop", "fusion", "bossa nova"] },
  { key: "classical",    label: "Classical",      tagMatches: ["classical", "baroque", "orchestral", "opera", "symphony"] },
  { key: "metal",        label: "Metal",          tagMatches: ["metal", "doom", "sludge", "thrash", "black metal", "death metal"] },
  { key: "folk",         label: "Folk",           tagMatches: ["folk", "singer-songwriter", "americana", "bluegrass"] },
  { key: "alternative",  label: "Alternative",    tagMatches: ["alternative", "alt rock", "shoegaze", "noise rock", "post-rock"] },
  { key: "punk",         label: "Punk",           tagMatches: ["punk", "hardcore", "post-punk", "emo"] },
  { key: "funk",         label: "Funk",           tagMatches: ["funk", "groove", "disco"] },
  { key: "reggae",       label: "Reggae",         tagMatches: ["reggae", "dub", "dancehall", "ska"] },
  { key: "latin",        label: "Latin",          tagMatches: ["latin", "salsa", "cumbia", "bossa", "reggaeton"] },
  { key: "ambient",      label: "Ambient",        tagMatches: ["ambient", "drone", "new age", "atmospheric"] },
  { key: "experimental", label: "Experimental",   tagMatches: ["experimental", "avant-garde", "noise", "art rock"] },
  { key: "country",      label: "Country",        tagMatches: ["country", "outlaw country", "country rock"] },
];

export const GENRE_MAP = new Map<GenreKey, Genre>(GENRES.map((g) => [g.key, g]));
```

- [ ] **Step 2: Create curated album list**

```typescript
// lib/onboarding/genre-albums.ts
import type { GenreKey } from "./genre-map";

export type CuratedAlbum = {
  artistName: string;
  albumName: string;
};

export const GENRE_ALBUMS: Record<GenreKey, CuratedAlbum[]> = {
  rock: [
    { artistName: "The Beatles", albumName: "Abbey Road" },
    { artistName: "Nirvana", albumName: "Nevermind" },
    { artistName: "Radiohead", albumName: "OK Computer" },
    { artistName: "Pink Floyd", albumName: "The Dark Side of the Moon" },
    { artistName: "Led Zeppelin", albumName: "Led Zeppelin IV" },
    { artistName: "Fleetwood Mac", albumName: "Rumours" },
    { artistName: "Bruce Springsteen", albumName: "Born to Run" },
    { artistName: "The Rolling Stones", albumName: "Exile on Main St." },
  ],
  indie: [
    { artistName: "Arcade Fire", albumName: "Funeral" },
    { artistName: "The Strokes", albumName: "Is This It" },
    { artistName: "Neutral Milk Hotel", albumName: "In the Aeroplane Over the Sea" },
    { artistName: "Bon Iver", albumName: "For Emma, Forever Ago" },
    { artistName: "Sufjan Stevens", albumName: "Illinois" },
    { artistName: "Car Seat Headrest", albumName: "Twin Fantasy" },
    { artistName: "Big Thief", albumName: "Dragon New Warm Mountain I Believe in You" },
    { artistName: "Japanese Breakfast", albumName: "Soft Sounds from Another Planet" },
  ],
  pop: [
    { artistName: "Michael Jackson", albumName: "Thriller" },
    { artistName: "Beyoncé", albumName: "Lemonade" },
    { artistName: "Taylor Swift", albumName: "1989" },
    { artistName: "Prince", albumName: "Purple Rain" },
    { artistName: "Dua Lipa", albumName: "Future Nostalgia" },
    { artistName: "Adele", albumName: "21" },
    { artistName: "Frank Ocean", albumName: "channel ORANGE" },
    { artistName: "Robyn", albumName: "Body Talk" },
  ],
  "hip-hop": [
    { artistName: "Nas", albumName: "Illmatic" },
    { artistName: "Kendrick Lamar", albumName: "To Pimp a Butterfly" },
    { artistName: "Kanye West", albumName: "My Beautiful Dark Twisted Fantasy" },
    { artistName: "Jay-Z", albumName: "The Blueprint" },
    { artistName: "Kendrick Lamar", albumName: "good kid, m.A.A.d city" },
    { artistName: "Kanye West", albumName: "The College Dropout" },
    { artistName: "OutKast", albumName: "Aquemini" },
    { artistName: "Notorious B.I.G.", albumName: "Ready to Die" },
  ],
  "rnb-soul": [
    { artistName: "Marvin Gaye", albumName: "What's Going On" },
    { artistName: "Stevie Wonder", albumName: "Songs in the Key of Life" },
    { artistName: "Amy Winehouse", albumName: "Back to Black" },
    { artistName: "Frank Ocean", albumName: "Blonde" },
    { artistName: "D'Angelo", albumName: "Voodoo" },
    { artistName: "SZA", albumName: "SOS" },
    { artistName: "Lauryn Hill", albumName: "The Miseducation of Lauryn Hill" },
    { artistName: "Solange", albumName: "A Seat at the Table" },
  ],
  electronic: [
    { artistName: "Daft Punk", albumName: "Discovery" },
    { artistName: "Aphex Twin", albumName: "Selected Ambient Works 85-92" },
    { artistName: "Boards of Canada", albumName: "Music Has the Right to Children" },
    { artistName: "Daft Punk", albumName: "Random Access Memories" },
    { artistName: "The Avalanches", albumName: "Since I Left You" },
    { artistName: "Four Tet", albumName: "There Is Love in You" },
    { artistName: "LCD Soundsystem", albumName: "Sound of Silver" },
    { artistName: "Bicep", albumName: "Bicep" },
  ],
  jazz: [
    { artistName: "Miles Davis", albumName: "Kind of Blue" },
    { artistName: "John Coltrane", albumName: "A Love Supreme" },
    { artistName: "Dave Brubeck", albumName: "Time Out" },
    { artistName: "Herbie Hancock", albumName: "Head Hunters" },
    { artistName: "Charles Mingus", albumName: "Mingus Ah Um" },
    { artistName: "Miles Davis", albumName: "Bitches Brew" },
    { artistName: "Bill Evans", albumName: "Waltz for Debby" },
    { artistName: "Thelonious Monk", albumName: "Brilliant Corners" },
  ],
  classical: [
    { artistName: "Johann Sebastian Bach", albumName: "Goldberg Variations" },
    { artistName: "Ludwig van Beethoven", albumName: "Symphony No. 9" },
    { artistName: "Antonio Vivaldi", albumName: "The Four Seasons" },
    { artistName: "Igor Stravinsky", albumName: "The Rite of Spring" },
    { artistName: "Claude Debussy", albumName: "Préludes" },
    { artistName: "Wolfgang Amadeus Mozart", albumName: "Requiem in D minor" },
  ],
  metal: [
    { artistName: "Metallica", albumName: "Master of Puppets" },
    { artistName: "Black Sabbath", albumName: "Paranoid" },
    { artistName: "Tool", albumName: "Lateralus" },
    { artistName: "Iron Maiden", albumName: "The Number of the Beast" },
    { artistName: "Slayer", albumName: "Reign in Blood" },
    { artistName: "Opeth", albumName: "Blackwater Park" },
    { artistName: "Pantera", albumName: "Vulgar Display of Power" },
    { artistName: "Mastodon", albumName: "Crack the Skye" },
  ],
  folk: [
    { artistName: "Bob Dylan", albumName: "Blood on the Tracks" },
    { artistName: "Joni Mitchell", albumName: "Blue" },
    { artistName: "Nick Drake", albumName: "Pink Moon" },
    { artistName: "Bob Dylan", albumName: "The Freewheelin' Bob Dylan" },
    { artistName: "Simon & Garfunkel", albumName: "The Sound of Silence" },
    { artistName: "Sufjan Stevens", albumName: "Carrie & Lowell" },
    { artistName: "Fleet Foxes", albumName: "Fleet Foxes" },
    { artistName: "Iron & Wine", albumName: "The Creek Drank the Cradle" },
  ],
  alternative: [
    { artistName: "Radiohead", albumName: "The Bends" },
    { artistName: "Pixies", albumName: "Doolittle" },
    { artistName: "My Bloody Valentine", albumName: "Loveless" },
    { artistName: "The Smashing Pumpkins", albumName: "Siamese Dream" },
    { artistName: "R.E.M.", albumName: "Murmur" },
    { artistName: "Pavement", albumName: "Slanted and Enchanted" },
    { artistName: "The Cure", albumName: "Disintegration" },
    { artistName: "Weezer", albumName: "Weezer (Blue Album)" },
  ],
  punk: [
    { artistName: "The Clash", albumName: "London Calling" },
    { artistName: "Sex Pistols", albumName: "Never Mind the Bollocks" },
    { artistName: "Ramones", albumName: "Ramones" },
    { artistName: "Bad Brains", albumName: "Bad Brains" },
    { artistName: "Black Flag", albumName: "Damaged" },
    { artistName: "The Misfits", albumName: "Walk Among Us" },
  ],
  funk: [
    { artistName: "Parliament", albumName: "Mothership Connection" },
    { artistName: "Sly & the Family Stone", albumName: "There's a Riot Goin' On" },
    { artistName: "Prince", albumName: "Sign 'O' the Times" },
    { artistName: "James Brown", albumName: "Live at the Apollo" },
    { artistName: "Herbie Hancock", albumName: "Head Hunters" },
    { artistName: "George Clinton", albumName: "Computer Games" },
  ],
  reggae: [
    { artistName: "Bob Marley & The Wailers", albumName: "Catch a Fire" },
    { artistName: "Bob Marley & The Wailers", albumName: "Exodus" },
    { artistName: "Toots and the Maytals", albumName: "Funky Kingston" },
    { artistName: "Lee Scratch Perry", albumName: "Super Ape" },
    { artistName: "Augustus Pablo", albumName: "King Tubby Meets Rockers Uptown" },
  ],
  latin: [
    { artistName: "Buena Vista Social Club", albumName: "Buena Vista Social Club" },
    { artistName: "Celia Cruz", albumName: "La Negra Tiene Tumbao" },
    { artistName: "Carlos Santana", albumName: "Abraxas" },
    { artistName: "Caetano Veloso", albumName: "Transa" },
    { artistName: "Silvio Rodríguez", albumName: "Días y Flores" },
  ],
  ambient: [
    { artistName: "Brian Eno", albumName: "Music for Airports" },
    { artistName: "Aphex Twin", albumName: "Selected Ambient Works Volume II" },
    { artistName: "Stars of the Lid", albumName: "And Their Refinement of the Decline" },
    { artistName: "Brian Eno", albumName: "Discreet Music" },
    { artistName: "Grouper", albumName: "Dragging a Dead Deer Up a Hill" },
    { artistName: "William Basinski", albumName: "Disintegration Loops" },
  ],
  experimental: [
    { artistName: "Captain Beefheart", albumName: "Trout Mask Replica" },
    { artistName: "Can", albumName: "Tago Mago" },
    { artistName: "Swans", albumName: "To Be Kind" },
    { artistName: "Scott Walker", albumName: "Tilt" },
    { artistName: "Arca", albumName: "Mutant" },
    { artistName: "Bjork", albumName: "Homogenic" },
  ],
  country: [
    { artistName: "Johnny Cash", albumName: "American Recordings" },
    { artistName: "Willie Nelson", albumName: "Red Headed Stranger" },
    { artistName: "Kacey Musgraves", albumName: "Golden Hour" },
    { artistName: "Gram Parsons", albumName: "Grievous Angel" },
    { artistName: "Emmylou Harris", albumName: "Pieces of the Sky" },
    { artistName: "Townes Van Zandt", albumName: "Live at the Old Quarter, Houston, Texas" },
  ],
};
```

- [ ] **Step 3: Commit**

```bash
git add lib/onboarding/genre-map.ts lib/onboarding/genre-albums.ts
git commit -m "feat: curated genre map + album list for onboarding suggestions"
```

---

## Task 12: Album Suggestions API Endpoint

**Files:**
- Create: `app/api/onboarding/album-suggestions/route.ts`

- [ ] **Step 1: Create the endpoint**

```typescript
// app/api/onboarding/album-suggestions/route.ts
import { withHandler } from "@/lib/api-handler";
import { apiBadRequest, apiOk } from "@/lib/api-response";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { GENRE_ALBUMS } from "@/lib/onboarding/genre-albums";
import { GENRES, type GenreKey } from "@/lib/onboarding/genre-map";
import { getOrCreateEntity } from "@/lib/catalog/getOrCreateEntity";

const VALID_GENRE_KEYS = new Set<string>(GENRES.map((g) => g.key));
const MAX_GENRES = 5;
const ALBUMS_PER_GENRE = 8;

export const GET = withHandler(
  async (request) => {
    const url = new URL(request.url);
    const raw = url.searchParams.get("genres") ?? "";
    const requestedGenres = raw
      .split(",")
      .map((g) => g.trim().toLowerCase())
      .filter((g) => VALID_GENRE_KEYS.has(g))
      .slice(0, MAX_GENRES) as GenreKey[];

    if (requestedGenres.length === 0) {
      return apiBadRequest("At least one valid genre key required");
    }

    const admin = createSupabaseAdminClient();
    const seen = new Set<string>();
    const result: Array<{
      genreKey: string;
      genreLabel: string;
      albums: Array<{
        id: string;
        name: string;
        artistName: string;
        imageUrl: string | null;
      }>;
    }> = [];

    for (const genreKey of requestedGenres) {
      const stubs = (GENRE_ALBUMS[genreKey] ?? []).slice(0, ALBUMS_PER_GENRE);
      const genreLabel = GENRES.find((g) => g.key === genreKey)?.label ?? genreKey;
      const albums: Array<{ id: string; name: string; artistName: string; imageUrl: string | null }> = [];

      for (const stub of stubs) {
        try {
          // Look up by name in DB first; don't trigger network for suggestions
          const { data: dbAlbum } = await admin
            .from("albums")
            .select("id, name, image_url, artist_id")
            .ilike("name", stub.albumName)
            .limit(1)
            .maybeSingle();

          if (dbAlbum && !seen.has(dbAlbum.id)) {
            seen.add(dbAlbum.id);
            const { data: artist } = await admin
              .from("artists")
              .select("name")
              .eq("id", dbAlbum.artist_id)
              .maybeSingle();

            albums.push({
              id: dbAlbum.id,
              name: dbAlbum.name,
              artistName: (artist as { name: string } | null)?.name ?? stub.artistName,
              imageUrl: dbAlbum.image_url,
            });
          }
        } catch {
          // Skip albums that can't be resolved
        }
      }

      if (albums.length > 0) {
        result.push({ genreKey, genreLabel, albums });
      }
    }

    return apiOk({ suggestions: result });
  },
  { requireAuth: true },
);
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/onboarding/album-suggestions/route.ts
git commit -m "feat: GET /api/onboarding/album-suggestions — genre-keyed curated album lookup"
```

---

## Task 13: Onboarding — `GenrePicker` Component

**Files:**
- Create: `components/onboarding/genre-picker.tsx`

- [ ] **Step 1: Create component**

```typescript
// components/onboarding/genre-picker.tsx
"use client";

import { GENRES, type GenreKey } from "@/lib/onboarding/genre-map";

type Props = {
  selected: GenreKey[];
  onChange: (genres: GenreKey[]) => void;
  maxSelections?: number;
};

export function GenrePicker({ selected, onChange, maxSelections = 5 }: Props) {
  function toggle(key: GenreKey) {
    if (selected.includes(key)) {
      onChange(selected.filter((k) => k !== key));
    } else if (selected.length < maxSelections) {
      onChange([...selected, key]);
    }
  }

  return (
    <div>
      <p className="mb-3 text-sm text-zinc-500">
        Pick up to {maxSelections}. We'll show you albums to rate.
      </p>
      <div className="flex flex-wrap gap-2">
        {GENRES.map((genre) => {
          const active = selected.includes(genre.key);
          const disabled = !active && selected.length >= maxSelections;
          return (
            <button
              key={genre.key}
              type="button"
              onClick={() => toggle(genre.key)}
              disabled={disabled}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                active
                  ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                  : disabled
                  ? "cursor-not-allowed border-zinc-800 text-zinc-700"
                  : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white"
              }`}
            >
              {genre.label}
            </button>
          );
        })}
      </div>
      {selected.length > 0 ? (
        <p className="mt-3 text-xs text-zinc-600">
          {selected.length} selected
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/onboarding/genre-picker.tsx
git commit -m "feat: GenrePicker component — multi-select with max limit"
```

---

## Task 14: Onboarding — `RatingGrid` Component

**Files:**
- Create: `components/onboarding/rating-grid.tsx`

- [ ] **Step 1: Create component**

```typescript
// components/onboarding/rating-grid.tsx
"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import type { GenreKey } from "@/lib/onboarding/genre-map";
import { StarRatingInput } from "@/components/ui/star-rating";

export type AlbumSuggestion = {
  id: string;
  name: string;
  artistName: string;
  imageUrl: string | null;
};

export type RatedAlbum = {
  albumId: string;
  rating: number;
  reviewText?: string;
};

type GenreGroup = {
  genreKey: string;
  genreLabel: string;
  albums: AlbumSuggestion[];
};

type Props = {
  suggestions: GenreGroup[];
  onRatingsChange: (ratings: RatedAlbum[]) => void;
};

export function RatingGrid({ suggestions, onRatingsChange }: Props) {
  const [ratings, setRatings] = useState<Map<string, number>>(new Map());
  const [reviewTexts, setReviewTexts] = useState<Map<string, string>>(new Map());
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());

  const handleRating = useCallback(
    (albumId: string, rating: number) => {
      const next = new Map(ratings).set(albumId, rating);
      setRatings(next);
      const result: RatedAlbum[] = Array.from(next.entries()).map(([id, r]) => ({
        albumId: id,
        rating: r,
        reviewText: reviewTexts.get(id) || undefined,
      }));
      onRatingsChange(result);
    },
    [ratings, reviewTexts, onRatingsChange],
  );

  const handleReviewText = useCallback(
    (albumId: string, text: string) => {
      const next = new Map(reviewTexts).set(albumId, text);
      setReviewTexts(next);
      const result: RatedAlbum[] = Array.from(ratings.entries()).map(([id, r]) => ({
        albumId: id,
        rating: r,
        reviewText: next.get(id) || undefined,
      }));
      onRatingsChange(result);
    },
    [ratings, reviewTexts, onRatingsChange],
  );

  const toggleNote = (albumId: string) => {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      next.has(albumId) ? next.delete(albumId) : next.add(albumId);
      return next;
    });
  };

  const ratedCount = ratings.size;

  return (
    <div>
      {ratedCount > 0 ? (
        <p className="mb-4 text-sm text-zinc-500">
          {ratedCount} album{ratedCount === 1 ? "" : "s"} rated
        </p>
      ) : (
        <p className="mb-4 text-sm text-zinc-500">
          Rate albums you know. Skip anything unfamiliar.
        </p>
      )}

      <div className="space-y-8">
        {suggestions.map((group) => (
          <div key={group.genreKey}>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-600">
              {group.genreLabel}
            </h3>
            <div className="space-y-3">
              {group.albums.map((album) => {
                const currentRating = ratings.get(album.id) ?? 0;
                const noteExpanded = expandedNotes.has(album.id);
                return (
                  <div key={album.id} className="flex gap-3">
                    {album.imageUrl ? (
                      <Image
                        src={album.imageUrl}
                        alt={album.name}
                        width={48}
                        height={48}
                        className="shrink-0 rounded object-cover"
                      />
                    ) : (
                      <div className="h-12 w-12 shrink-0 rounded bg-zinc-800" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{album.name}</p>
                      <p className="truncate text-xs text-zinc-500">{album.artistName}</p>
                      <div className="mt-1.5 flex items-center gap-3">
                        <StarRatingInput
                          value={currentRating}
                          onChange={(r) => handleRating(album.id, r)}
                        />
                        {currentRating > 0 ? (
                          <button
                            type="button"
                            onClick={() => toggleNote(album.id)}
                            className="text-xs text-zinc-600 hover:text-zinc-400"
                          >
                            {noteExpanded ? "hide note" : "add note"}
                          </button>
                        ) : null}
                      </div>
                      {noteExpanded ? (
                        <textarea
                          rows={2}
                          placeholder="What do you think? (optional)"
                          value={reviewTexts.get(album.id) ?? ""}
                          onChange={(e) => handleReviewText(album.id, e.target.value)}
                          className="mt-2 w-full resize-none rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:border-emerald-600 focus:outline-none"
                        />
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/onboarding/rating-grid.tsx
git commit -m "feat: RatingGrid — genre-grouped album suggestions with half-star input and optional notes"
```

---

## Task 15: Wire Onboarding Step 2

**Files:**
- Modify: `components/onboarding/profile-onboarding.tsx`

- [ ] **Step 1: Add imports**

At the top of `profile-onboarding.tsx`, add:

```typescript
import { GenrePicker } from "@/components/onboarding/genre-picker";
import { RatingGrid, type RatedAlbum } from "@/components/onboarding/rating-grid";
import type { GenreKey } from "@/lib/onboarding/genre-map";
```

- [ ] **Step 2: Add new state variables**

Inside the `ProfileOnboarding` component, add after the existing `useState` declarations:

```typescript
  const [selectedGenres, setSelectedGenres] = useState<GenreKey[]>([]);
  const [genreSubstep, setGenreSubstep] = useState<"genres" | "albums">("genres");
  const [albumSuggestions, setAlbumSuggestions] = useState<Array<{
    genreKey: string; genreLabel: string;
    albums: Array<{ id: string; name: string; artistName: string; imageUrl: string | null }>;
  }>>([]);
  const [ratedAlbums, setRatedAlbums] = useState<RatedAlbum[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
```

- [ ] **Step 3: Replace `goStep2` with new genre-aware handler**

Find the existing `goStep2` function and replace it entirely with:

```typescript
  const loadSuggestions = useCallback(async (genres: GenreKey[]) => {
    if (genres.length === 0) return;
    setSuggestionsLoading(true);
    try {
      const params = new URLSearchParams({ genres: genres.join(",") });
      const res = await fetch(`/api/onboarding/album-suggestions?${params}`);
      if (res.ok) {
        const data = (await res.json()) as {
          suggestions: Array<{
            genreKey: string; genreLabel: string;
            albums: Array<{ id: string; name: string; artistName: string; imageUrl: string | null }>;
          }>;
        };
        setAlbumSuggestions(data.suggestions ?? []);
        setGenreSubstep("albums");
      }
    } finally {
      setSuggestionsLoading(false);
    }
  }, []);

  const goStep2 = useCallback(async () => {
    if (genreSubstep === "genres") {
      await loadSuggestions(selectedGenres);
      return;
    }
    // Submit ratings
    setStepBusy(true);
    try {
      const res = await fetch("/api/users/me/onboarding-ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ratings: ratedAlbums,
          preferredGenres: selectedGenres,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setFavoritesError(data.error ?? "Could not save ratings");
        return;
      }
      setStep(3);
    } finally {
      setStepBusy(false);
    }
  }, [genreSubstep, selectedGenres, ratedAlbums, loadSuggestions]);
```

- [ ] **Step 4: Replace Step 2 render block**

Find the Step 2 render block:

```typescript
          {step === 2 ? (
            <div className="mt-6 space-y-5 sm:mt-8">
              <div>
                <h2 className={h2}>Pick up to four favorite albums</h2>
                ...
              </div>
            </div>
          ) : null}
```

Replace with:

```typescript
          {step === 2 ? (
            <div className="mt-6 space-y-5 sm:mt-8">
              {genreSubstep === "genres" ? (
                <>
                  <div>
                    <h2 className={h2}>What do you listen to?</h2>
                    <p className={bodyMuted}>
                      Pick your genres and we'll show you albums to rate. This builds your taste profile right away — no Last.fm needed.
                    </p>
                  </div>
                  <GenrePicker
                    selected={selectedGenres}
                    onChange={setSelectedGenres}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setStep(1)} disabled={stepBusy} className={secondaryBtn}>
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => void goStep2()}
                      disabled={stepBusy || selectedGenres.length === 0 || suggestionsLoading}
                      className={primaryBtn}
                    >
                      {suggestionsLoading ? (
                        <><InlineSpinner tone="emerald" /> Loading…</>
                      ) : (
                        "See albums →"
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep(3)}
                      disabled={stepBusy}
                      className="text-sm text-zinc-600 hover:text-zinc-400"
                    >
                      Skip
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <h2 className={h2}>Rate what you know</h2>
                    <p className={bodyMuted}>
                      Half-stars welcome. Skip anything you haven't heard.
                    </p>
                  </div>
                  <RatingGrid
                    suggestions={albumSuggestions}
                    onRatingsChange={setRatedAlbums}
                  />
                  {favoritesError ? (
                    <p className="text-sm text-red-400" role="alert">{favoritesError}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setGenreSubstep("genres")} disabled={stepBusy} className={secondaryBtn}>
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => void goStep2()}
                      disabled={stepBusy}
                      className={primaryBtn}
                    >
                      {stepBusy ? (
                        <><InlineSpinner tone="emerald" /> Saving…</>
                      ) : ratedAlbums.length > 0 ? (
                        `Save ${ratedAlbums.length} rating${ratedAlbums.length === 1 ? "" : "s"} →`
                      ) : (
                        "Continue →"
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : null}
```

- [ ] **Step 5: Create `POST /api/users/me/onboarding-ratings` endpoint**

```typescript
// app/api/users/me/onboarding-ratings/route.ts
import { withHandler } from "@/lib/api-handler";
import { apiBadRequest, apiOk } from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import { seedTasteIdentityFromRatings } from "@/lib/taste/taste-identity";

export const POST = withHandler(
  async (request, { user }) => {
    const { data: body, error: parseErr } = await parseBody<{
      ratings?: unknown;
      preferredGenres?: unknown;
    }>(request);
    if (parseErr) return parseErr;

    const rawRatings = body!.ratings;
    if (!Array.isArray(rawRatings)) return apiBadRequest("ratings must be an array");

    const ratings = rawRatings
      .filter(
        (r): r is { albumId: string; rating: number; reviewText?: string } =>
          typeof r === "object" &&
          r !== null &&
          typeof (r as Record<string, unknown>).albumId === "string" &&
          typeof (r as Record<string, unknown>).rating === "number",
      )
      .slice(0, 100);

    const rawGenres = body!.preferredGenres;
    const preferredGenres = Array.isArray(rawGenres)
      ? rawGenres.filter((g): g is string => typeof g === "string").slice(0, 10)
      : [];

    await seedTasteIdentityFromRatings(user!.id, ratings, preferredGenres);

    return apiOk({ saved: ratings.length });
  },
  { requireAuth: true },
);
```

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 7: Test onboarding flow end-to-end**

```bash
npm run dev
```

Sign in with a fresh account (or clear `onboarding_completed` in DB for a test user). Walk through:
1. Step 1 — username/avatar (unchanged)
2. Step 2 — genre picker appears → pick 2 genres → "See albums →" → album grid appears → rate a few → "Save N ratings →" → advances to step 3
3. Verify: after completing onboarding, profile shows Reviews tab with rated albums

- [ ] **Step 8: Commit**

```bash
git add components/onboarding/profile-onboarding.tsx app/api/users/me/onboarding-ratings/route.ts
git commit -m "feat: genre-first rating step in onboarding — replaces favorite album picker"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Task 1 — DB migration `users.preferred_genres`
- ✅ Tasks 2–4 — Taste system: `ratingsToArtistCountMap`, merge into `computeTasteIdentity`, `seedTasteIdentityFromRatings`
- ✅ Tasks 5–8 — Profile diary: API endpoint, entry component, tab component, wired into profile page
- ✅ Task 9 — Friends-first reviews on entity pages
- ✅ Task 10 — Explore "Loved by Friends" RPC + UI toggle
- ✅ Tasks 11–15 — Onboarding: genre map, album list, suggestions API, GenrePicker, RatingGrid, wired into Step 2

**Notes for implementer:**
- Task 8 Step 3 requires reading `profile-deferred-body.tsx` fully to place the review count fetch and `ProfileReviewsTab` construction correctly — the existing `use()` pattern for async promises must be followed.
- Task 10 Step 3 requires locating the actual "most talked about" component (grep provided) before editing — the exact file path depends on how explore sections are structured.
- `seedTasteIdentityFromFavoriteAlbums` is kept in place (not deleted) since it's called internally from `seedTasteIdentityFromRatings`. Do not remove it.
