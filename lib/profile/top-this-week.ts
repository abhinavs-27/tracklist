import "server-only";

import { currentWeekStart } from "@/lib/analytics/period-now";
import {
  getOrFetchArtistsBatch,
  getOrFetchTracksBatch,
} from "@/lib/spotify-cache";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const TOP_N = 10;

export type TopWeekTrack = {
  trackId: string;
  albumId: string;
  name: string;
  artistName: string;
  albumImageUrl: string | null;
  playCount: number;
};

export type TopWeekArtist = {
  artistId: string;
  name: string;
  imageUrl: string | null;
  playCount: number;
};

export type TopThisWeekResult = {
  /** e.g. Week of Jan 6 */
  rangeLabel: string;
  tracks: TopWeekTrack[];
  artists: TopWeekArtist[];
};

function weekRangeLabel(weekStartYmd: string): string {
  const d = new Date(`${weekStartYmd}T12:00:00.000Z`);
  return `Week of ${d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })}`;
}

/** Reject null DB values and string placeholders that become `/artist/null` in URLs. */
function isValidCatalogId(id: unknown): id is string {
  if (id == null || typeof id !== "string") return false;
  const t = id.trim();
  if (t.length === 0) return false;
  if (t === "null" || t === "undefined") return false;
  return true;
}

/**
 * Top tracks and artists for the **current UTC week** (Mon–Sun), same source as
 * Listening reports → Weekly (`user_listening_aggregates` + `currentWeekStart()`).
 */
export async function getTopThisWeek(userId: string): Promise<TopThisWeekResult> {
  const weekStart = currentWeekStart();
  const rangeLabel = weekRangeLabel(weekStart);

  const empty = (): TopThisWeekResult => ({
    rangeLabel,
    tracks: [],
    artists: [],
  });

  const uid = userId?.trim();
  if (!uid) return empty();

  const admin = createSupabaseAdminClient();
  const catalogOpts = { allowNetwork: true as const };

  const [artistRes, trackRes] = await Promise.all([
    admin
      .from("user_listening_aggregates")
      .select("entity_id, count, cover_image_url")
      .eq("user_id", uid)
      .eq("entity_type", "artist")
      .eq("week_start", weekStart)
      .is("month", null)
      .is("year", null)
      .order("count", { ascending: false })
      .limit(TOP_N),
    admin
      .from("user_listening_aggregates")
      .select("entity_id, count, cover_image_url")
      .eq("user_id", uid)
      .eq("entity_type", "track")
      .eq("week_start", weekStart)
      .is("month", null)
      .is("year", null)
      .order("count", { ascending: false })
      .limit(TOP_N),
  ]);

  if (artistRes.error) {
    console.error("[top-this-week] artist aggregates:", artistRes.error);
  }
  if (trackRes.error) {
    console.error("[top-this-week] track aggregates:", trackRes.error);
  }

  const artistRows = (artistRes.data ?? []) as {
    entity_id: string;
    count: number;
    cover_image_url: string | null;
  }[];
  const trackRows = (trackRes.data ?? []) as {
    entity_id: string;
    count: number;
    cover_image_url: string | null;
  }[];

  const artistIds = artistRows.map((r) => r.entity_id).filter(isValidCatalogId);
  const trackIds = trackRows.map((r) => r.entity_id).filter(isValidCatalogId);

  const [artistMetaList, trackMetaList] = await Promise.all([
    artistIds.length
      ? getOrFetchArtistsBatch(artistIds, catalogOpts)
      : Promise.resolve([] as Awaited<ReturnType<typeof getOrFetchArtistsBatch>>),
    trackIds.length
      ? getOrFetchTracksBatch(trackIds, catalogOpts)
      : Promise.resolve([] as Awaited<ReturnType<typeof getOrFetchTracksBatch>>),
  ]);

  const artistMetaById = new Map(
    artistIds.map((id, i) => [id, artistMetaList[i] ?? null] as const),
  );
  const trackMetaById = new Map(
    trackIds.map((id, i) => [id, trackMetaList[i] ?? null] as const),
  );

  const artists: TopWeekArtist[] = [];
  for (const r of artistRows) {
    if (!isValidCatalogId(r.entity_id)) continue;
    const a = artistMetaById.get(r.entity_id);
    artists.push({
      artistId: r.entity_id,
      name: a?.name ?? r.entity_id,
      imageUrl: a?.images?.[0]?.url ?? r.cover_image_url ?? null,
      playCount: r.count,
    });
  }

  const tracks: TopWeekTrack[] = [];
  for (const r of trackRows) {
    if (!isValidCatalogId(r.entity_id)) continue;
    const t = trackMetaById.get(r.entity_id);
    const albumId = t?.album?.id?.trim();
    if (!isValidCatalogId(albumId)) continue;
    tracks.push({
      trackId: r.entity_id,
      albumId,
      name: t?.name ?? r.entity_id,
      artistName: t?.artists?.[0]?.name ?? "—",
      albumImageUrl: t?.album?.images?.[0]?.url ?? r.cover_image_url ?? null,
      playCount: r.count,
    });
  }

  return { rangeLabel, tracks, artists };
}
