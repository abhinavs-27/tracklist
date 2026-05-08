import { getSupabase } from "../lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ExploreRangeParam = "24h" | "week";

export type ExploreMovement = {
  rank_delta: number | null;
  badge: "new" | "hot" | null;
};

export type ExploreDiscoveryTrackItem = {
  kind: "track";
  id: string;
  name: string;
  artist: string;
  image_url: string | null;
  href: string;
  movement: ExploreMovement;
  stat_label: string;
};

export type ExploreDiscoveryAlbumItem = {
  kind: "album";
  id: string;
  name: string;
  artist: string;
  image_url: string | null;
  href: string;
  movement: ExploreMovement;
  stat_label: string;
  review_snippet: string | null;
};

export type ExploreDiscoveryReviewEntityItem =
  | ExploreDiscoveryAlbumItem
  | (ExploreDiscoveryTrackItem & { review_snippet: string | null });

export type ExploreCommunityContrastRow = {
  community_id: string;
  community_name: string;
  top_track_id: string;
  top_track_name: string;
  top_track_image: string | null;
  href: string;
};

export type ExploreDiscoveryBundle = {
  range: ExploreRangeParam;
  blowing_up: ExploreDiscoveryTrackItem[];
  most_talked_about: ExploreDiscoveryReviewEntityItem[];
  most_loved: ExploreDiscoveryTrackItem[];
  hidden_gems: Array<ExploreDiscoveryTrackItem | ExploreDiscoveryAlbumItem>;
  across_communities: ExploreCommunityContrastRow[];
};

type TrackCatalog = {
  dbId: string;
  spotifyId: string;
  name: string;
  artist: string;
  image_url: string | null;
};

type AlbumCatalog = {
  dbId: string;
  spotifyId: string;
  name: string;
  artist: string;
  image_url: string | null;
};

function movementFromGrowth(args: {
  prev_listens: number;
  growth: number;
  prev_rank: number | null;
  curr_rank: number | null;
}): ExploreMovement {
  const { prev_listens, growth, prev_rank, curr_rank } = args;
  let rank_delta: number | null = null;
  if (prev_rank != null && curr_rank != null && prev_rank > 0 && curr_rank > 0) {
    rank_delta = prev_rank - curr_rank;
  }
  const isNew = prev_listens === 0;
  const hot = !isNew && (growth >= 1.25 || (prev_listens > 0 && growth >= 0.75 && prev_listens < 30));
  let badge: "new" | "hot" | null = null;
  if (isNew) badge = "new";
  else if (hot) badge = "hot";
  return { rank_delta, badge };
}

function movementSimple(args: { rank_delta: number | null; is_new: boolean; hot: boolean }): ExploreMovement {
  let badge: "new" | "hot" | null = null;
  if (args.is_new) badge = "new";
  else if (args.hot) badge = "hot";
  return { rank_delta: args.rank_delta, badge };
}

async function resolveTracksByDbIds(
  supabase: SupabaseClient,
  dbIds: string[],
): Promise<Map<string, TrackCatalog>> {
  if (!dbIds.length) return new Map();

  const [tracksRes, extRes] = await Promise.all([
    supabase
      .from("tracks")
      .select("id, name, album_id, artist_id")
      .in("id", dbIds),
    supabase
      .from("track_external_ids")
      .select("track_id, external_id")
      .eq("source", "spotify")
      .in("track_id", dbIds),
  ]);

  const tracks = (tracksRes.data ?? []) as { id: string; name: string; album_id: string | null; artist_id: string | null }[];
  const extById = new Map((extRes.data ?? []).map((r: { track_id: string; external_id: string }) => [r.track_id, r.external_id]));

  const albumIds = [...new Set(tracks.map((t) => t.album_id).filter((x): x is string => Boolean(x)))];
  const artistIds = [...new Set(tracks.map((t) => t.artist_id).filter((x): x is string => Boolean(x)))];

  const [albumsRes, artistsRes] = await Promise.all([
    albumIds.length ? supabase.from("albums").select("id, image_url").in("id", albumIds) : Promise.resolve({ data: [] }),
    artistIds.length ? supabase.from("artists").select("id, name").in("id", artistIds) : Promise.resolve({ data: [] }),
  ]);

  const albumImg = new Map((albumsRes.data ?? []).map((a: { id: string; image_url: string | null }) => [a.id, a.image_url]));
  const artistName = new Map((artistsRes.data ?? []).map((a: { id: string; name: string }) => [a.id, a.name]));

  const out = new Map<string, TrackCatalog>();
  for (const t of tracks) {
    const spotifyId = extById.get(t.id) ?? t.id;
    out.set(t.id, {
      dbId: t.id,
      spotifyId,
      name: t.name,
      artist: (t.artist_id ? artistName.get(t.artist_id) : null) ?? "",
      image_url: (t.album_id ? albumImg.get(t.album_id) : null) ?? null,
    });
  }
  return out;
}

async function resolveAlbumsByDbIds(
  supabase: SupabaseClient,
  dbIds: string[],
): Promise<Map<string, AlbumCatalog>> {
  if (!dbIds.length) return new Map();

  const [albumsRes, extRes] = await Promise.all([
    supabase.from("albums").select("id, name, image_url, artist_id").in("id", dbIds),
    supabase.from("album_external_ids").select("album_id, external_id").eq("source", "spotify").in("album_id", dbIds),
  ]);

  const albums = (albumsRes.data ?? []) as { id: string; name: string; image_url: string | null; artist_id: string | null }[];
  const extById = new Map((extRes.data ?? []).map((r: { album_id: string; external_id: string }) => [r.album_id, r.external_id]));

  const artistIds = [...new Set(albums.map((a) => a.artist_id).filter((x): x is string => Boolean(x)))];
  const artistsRes = artistIds.length
    ? await supabase.from("artists").select("id, name").in("id", artistIds)
    : { data: [] };
  const artistName = new Map((artistsRes.data ?? []).map((a: { id: string; name: string }) => [a.id, a.name]));

  const out = new Map<string, AlbumCatalog>();
  for (const a of albums) {
    const spotifyId = extById.get(a.id) ?? a.id;
    out.set(a.id, {
      dbId: a.id,
      spotifyId,
      name: a.name,
      artist: (a.artist_id ? artistName.get(a.artist_id) : null) ?? "",
      image_url: a.image_url ?? null,
    });
  }
  return out;
}

async function getBlowingUp(supabase: SupabaseClient, range: ExploreRangeParam, limit: number): Promise<ExploreDiscoveryTrackItem[]> {
  const { data, error } = await supabase.rpc("get_explore_blowing_up_tracks", { p_range: range, p_limit: limit });
  if (error || !data?.length) return [];

  const rows = data as { track_id: string; curr_listens: number; prev_listens: number; growth: number; prev_rank: number | null; curr_rank: number | null }[];
  const catalog = await resolveTracksByDbIds(supabase, rows.map((r) => r.track_id));

  return rows.flatMap((r) => {
    const t = catalog.get(r.track_id);
    if (!t) return [];
    return [{
      kind: "track" as const,
      id: t.spotifyId,
      name: t.name,
      artist: t.artist,
      image_url: t.image_url,
      href: `/song/${t.spotifyId}`,
      movement: movementFromGrowth({ prev_listens: Number(r.prev_listens) || 0, growth: Number(r.growth) || 0, prev_rank: r.prev_rank, curr_rank: r.curr_rank }),
      stat_label: `${Number(r.growth || 0).toFixed(2)}× vs last window`,
    }];
  });
}

async function getMostTalkedAbout(supabase: SupabaseClient, range: ExploreRangeParam, limit: number): Promise<ExploreDiscoveryReviewEntityItem[]> {
  const { data, error } = await supabase.rpc("get_explore_most_reviewed_entities", { p_range: range, p_limit: limit });
  if (error || !data?.length) return [];

  const rows = data as { entity_id: string; entity_type: string; review_count: number; snippet: string | null }[];
  const albumIds = rows.filter((r) => r.entity_type === "album").map((r) => r.entity_id);
  const songIds = rows.filter((r) => r.entity_type === "song").map((r) => r.entity_id);

  const [albums, songs] = await Promise.all([
    resolveAlbumsByDbIds(supabase, albumIds),
    resolveTracksByDbIds(supabase, songIds),
  ]);

  const out: ExploreDiscoveryReviewEntityItem[] = [];
  let idx = 0;
  for (const r of rows) {
    idx++;
    const rc = Number(r.review_count) || 0;
    const snippet = r.snippet?.trim() || null;
    const movement = movementSimple({ rank_delta: null, is_new: idx <= 3 && rc <= 5, hot: rc >= 8 });

    if (r.entity_type === "album") {
      const al = albums.get(r.entity_id);
      if (!al) continue;
      out.push({ kind: "album", id: al.spotifyId, name: al.name, artist: al.artist, image_url: al.image_url, href: `/album/${al.spotifyId}`, movement, stat_label: `${rc} reviews`, review_snippet: snippet });
    } else {
      const t = songs.get(r.entity_id);
      if (!t) continue;
      out.push({ kind: "track", id: t.spotifyId, name: t.name, artist: t.artist, image_url: t.image_url, href: `/song/${t.spotifyId}`, movement, stat_label: `${rc} reviews`, review_snippet: snippet });
    }
  }
  return out;
}

async function getMostLoved(supabase: SupabaseClient, range: ExploreRangeParam, limit: number): Promise<ExploreDiscoveryTrackItem[]> {
  const { data, error } = await supabase.rpc("get_explore_most_loved_tracks", { p_range: range, p_limit: limit });
  if (error || !data?.length) return [];

  const rows = data as { track_id: string; window_listens: number; repeat_extra: number; favorite_count: number; love_score: number }[];
  const catalog = await resolveTracksByDbIds(supabase, rows.map((r) => r.track_id));

  return rows.flatMap((r) => {
    const t = catalog.get(r.track_id);
    if (!t) return [];
    const fav = Number(r.favorite_count) || 0;
    const rep = Number(r.repeat_extra) || 0;
    const wl = Number(r.window_listens) || 0;
    return [{
      kind: "track" as const,
      id: t.spotifyId,
      name: t.name,
      artist: t.artist,
      image_url: t.image_url,
      href: `/song/${t.spotifyId}`,
      movement: movementSimple({ rank_delta: null, is_new: fav === 0 && rep === 0 && wl >= 15, hot: fav >= 3 || rep >= 5 }),
      stat_label: fav > 0 ? `${fav} saves · ${wl} plays` : `${wl} plays · ${rep} repeats`,
    }];
  });
}

async function getHiddenGems(supabase: SupabaseClient, limit: number): Promise<Array<ExploreDiscoveryTrackItem | ExploreDiscoveryAlbumItem>> {
  const { data, error } = await supabase.rpc("get_explore_hidden_gems_entities", { p_limit: limit });
  if (error || !data?.length) return [];

  const rows = data as { entity_id: string; entity_type: string; play_count: number; review_count: number; avg_rating: number; gem_score: number }[];
  const albumIds = rows.filter((r) => r.entity_type === "album").map((r) => r.entity_id);
  const songIds = rows.filter((r) => r.entity_type === "song").map((r) => r.entity_id);

  const [albums, songs] = await Promise.all([
    resolveAlbumsByDbIds(supabase, albumIds),
    resolveTracksByDbIds(supabase, songIds),
  ]);

  const out: Array<ExploreDiscoveryTrackItem | ExploreDiscoveryAlbumItem> = [];
  for (const r of rows) {
    const pc = Number(r.play_count) || 0;
    const reviews = Number(r.review_count) || 0;
    const score = Number(r.gem_score) || 0;
    const movement = movementSimple({ rank_delta: null, is_new: pc <= 25, hot: reviews >= 4 && score >= 2 });
    const stat_label = `${reviews} reviews · ${pc.toLocaleString()} plays`;

    if (r.entity_type === "album") {
      const al = albums.get(r.entity_id);
      if (!al) continue;
      out.push({ kind: "album", id: al.spotifyId, name: al.name, artist: al.artist, image_url: al.image_url, href: `/album/${al.spotifyId}`, movement, stat_label, review_snippet: null });
    } else {
      const t = songs.get(r.entity_id);
      if (!t) continue;
      out.push({ kind: "track", id: t.spotifyId, name: t.name, artist: t.artist, image_url: t.image_url, href: `/song/${t.spotifyId}`, movement, stat_label });
    }
  }
  return out;
}

async function getAcrossCommunities(supabase: SupabaseClient, limit: number): Promise<ExploreCommunityContrastRow[]> {
  const { data: comms, error } = await supabase
    .from("communities")
    .select("id, name")
    .eq("is_private", false)
    .order("created_at", { ascending: false })
    .limit(24);

  if (error || !comms?.length) return [];

  // Fetch all community ranking caches in one batched query instead of N sequential queries.
  const communityIds = comms.map((c) => c.id as string);
  const { data: caches } = await supabase
    .from("community_rankings_cache")
    .select("community_id, payload")
    .in("community_id", communityIds)
    .eq("entity_type", "track")
    .eq("range", "month");

  const cacheMap = new Map(
    (caches ?? []).map((r: { community_id: string; payload: unknown }) => [r.community_id, r.payload]),
  );

  const out: ExploreCommunityContrastRow[] = [];
  for (const c of comms) {
    if (out.length >= limit) break;
    const communityId = c.id as string;
    const payload = cacheMap.get(communityId) as { items?: Array<Record<string, unknown>> } | undefined;
    const top = (payload?.items ?? [])[0] as { entityId?: string; name?: string; image?: string | null } | undefined;
    if (!top?.entityId) continue;
    out.push({
      community_id: communityId,
      community_name: (c.name as string) || "Community",
      top_track_id: top.entityId,
      top_track_name: top.name ?? "Track",
      top_track_image: top.image ?? null,
      href: `/communities/${communityId}`,
    });
  }
  return out;
}

type BundleCache = { data: ExploreDiscoveryBundle; expiresAt: number };
const bundleCache = new Map<string, BundleCache>();
const BUNDLE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getExploreDiscoveryBundle(range: ExploreRangeParam): Promise<ExploreDiscoveryBundle> {
  const cacheKey = `bundle:${range}`;
  const cached = bundleCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const supabase = getSupabase();
  const cap = 20;
  const [blowing_up, most_talked_about, most_loved, hidden_gems, across_communities] = await Promise.all([
    getBlowingUp(supabase, range, cap),
    getMostTalkedAbout(supabase, range, 12),
    getMostLoved(supabase, range, cap),
    getHiddenGems(supabase, 12),
    getAcrossCommunities(supabase, 4),
  ]);
  const bundle: ExploreDiscoveryBundle = { range, blowing_up, most_talked_about, most_loved, hidden_gems, across_communities };
  bundleCache.set(cacheKey, { data: bundle, expiresAt: Date.now() + BUNDLE_TTL_MS });
  return bundle;
}
