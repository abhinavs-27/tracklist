import { withHandler } from "@/lib/api-handler";
import { apiBadRequest, apiNotFound, apiOk } from "@/lib/api-response";
import { isValidLfmCatalogId, isValidSpotifyId, isValidUuid } from "@/lib/validation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { resolveCanonicalTrackUuidFromEntityId } from "@/lib/catalog/entity-resolution";
import { getEntityStats, getReviewsForEntity } from "@/lib/queries";
import { getSongInfoTabData } from "@/lib/musicbrainz/db-queries";

/**
 * GET /api/songs/:id — full song detail bundle for the mobile app (and any
 * client hitting this deployment directly rather than the Express backend).
 *
 * Response is a superset: the song/stats/reviews/recent_listens/recommended
 * bundle that `useSong` consumes, PLUS the credits fields
 * (producers/songwriters/credits_enriched_at/…) that the web song page polls.
 * Credits-only consumers should prefer `/api/songs/:id/info`.
 *
 * Accepts Spotify base62 IDs and canonical UUIDs.
 */
export const GET = withHandler(
  async (_request, { params, user }) => {
    const { id } = params;
    // Accept Spotify base62, canonical UUID, and Last.fm catalog ids (lfm:…) —
    // explore/discovery hrefs can carry any of these; the resolver handles all.
    if (!isValidSpotifyId(id) && !isValidUuid(id) && !isValidLfmCatalogId(id))
      return apiBadRequest("Invalid song id");

    const supabase = await createSupabaseServerClient();
    const viewerId = user?.id ?? null;

    const canonicalId = await resolveCanonicalTrackUuidFromEntityId(supabase, id);
    if (!canonicalId) return apiNotFound("Song not found");

    // Track row + its Spotify external id (drives the public `song.id`).
    const [trackRowRes, extIdRes] = await Promise.all([
      supabase
        .from("tracks")
        .select("id, name, duration_ms, track_number, album_id")
        .eq("id", canonicalId)
        .maybeSingle(),
      supabase
        .from("track_external_ids")
        .select("external_id, source")
        .eq("track_id", canonicalId),
    ]);

    const trackRow = trackRowRes.data as
      | { id: string; name: string; duration_ms: number | null; track_number: number | null; album_id: string | null }
      | null;
    if (!trackRow) return apiNotFound("Song not found");

    const spotifyId =
      ((extIdRes.data ?? []) as { external_id: string; source: string }[]).find(
        (e) => e.source === "spotify",
      )?.external_id ?? null;

    // Album + artist.
    let album: AlbumRow | null = null;
    let artist: { name: string; id: string | null } = { name: "", id: null };
    if (trackRow.album_id) {
      const { data: albumRow } = await supabase
        .from("albums")
        .select("id, name, image_url, release_date, artist_id")
        .eq("id", trackRow.album_id)
        .maybeSingle();
      album = (albumRow as AlbumRow | null) ?? null;
      if (album?.artist_id) {
        const { data: artistRow } = await supabase
          .from("artists")
          .select("id, name")
          .eq("id", album.artist_id)
          .maybeSingle();
        artist = {
          name: (artistRow as { name?: string } | null)?.name ?? "",
          id: (artistRow as { id?: string } | null)?.id ?? null,
        };
      }
    }

    // Kick off credits enrichment (no-op if already enriched), matching /info.
    void import("@/lib/jobs/musicbrainzQueue").then(({ enqueueMusicBrainzEnrich }) =>
      enqueueMusicBrainzEnrich({ name: "enrich_song", songId: canonicalId }),
    );

    const [stats, reviewsResult, recentListens, recommended, info, creditsMeta] =
      await Promise.all([
        getEntityStats("song", canonicalId),
        getReviewsForEntity("song", canonicalId, 5, viewerId),
        getRecentListens(supabase, canonicalId),
        getRecommended(supabase, canonicalId),
        getSongInfoTabData(supabase, canonicalId),
        supabase.from("tracks").select("credits_enriched_at").eq("id", canonicalId).maybeSingle(),
      ]);

    const reviewItems = (reviewsResult?.reviews ?? []).map((r) => ({
      id: r.id,
      user_id: r.user_id,
      username: r.username ?? null,
      avatar_url: r.user?.avatar_url ?? null,
      rating: r.rating,
      review_text: r.review_text ?? null,
      created_at: r.created_at,
      like_count: r.like_count ?? 0,
    }));

    return apiOk({
      song: {
        id: spotifyId ?? canonicalId,
        canonical_id: canonicalId,
        name: trackRow.name,
        artist: artist.name ?? "",
        artist_id: spotifyId ? artist.id : null,
        duration_ms: trackRow.duration_ms ?? null,
        track_number: trackRow.track_number ?? null,
        image_url: album?.image_url ?? null,
        release_date: album?.release_date ?? null,
        album_name: album?.name ?? null,
        album_id: album?.id ?? null,
      },
      stats: {
        average_rating: stats.average_rating,
        play_count: stats.listen_count,
        favorite_count: 0,
        review_count: stats.review_count,
        rating_distribution: stats.rating_distribution ?? null,
      },
      reviews: {
        items: reviewItems,
        average_rating: reviewsResult?.average_rating ?? null,
        count: reviewsResult?.count ?? 0,
        my_review: reviewsResult?.my_review
          ? {
              id: reviewsResult.my_review.id,
              rating: reviewsResult.my_review.rating,
              review_text: reviewsResult.my_review.review_text ?? null,
            }
          : null,
      },
      recent_listens: recentListens,
      recommended,
      // Credits (web song-page-tabs polls these here).
      producers: info.producers,
      songwriters: info.songwriters,
      featuring: info.featuring,
      samples: info.samples,
      sampled_by: info.sampledBy,
      covers: info.covers,
      credits_enriched_at:
        (creditsMeta.data as { credits_enriched_at?: string | null } | null)?.credits_enriched_at ?? null,
    });
  },
  { requireAuth: false },
);

type Supa = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type AlbumRow = {
  id: string;
  name: string;
  image_url: string | null;
  release_date: string | null;
  artist_id: string | null;
};

/** Last 10 unique users who played this track. */
async function getRecentListens(supabase: Supa, canonicalId: string) {
  const { data: logs } = await supabase
    .from("logs")
    .select("user_id, listened_at")
    .eq("track_id", canonicalId)
    .order("listened_at", { ascending: false })
    .limit(50);
  const rows = (logs ?? []) as { user_id: string; listened_at: string }[];
  if (!rows.length) return [];

  const seen = new Set<string>();
  const unique = rows
    .filter((l) => (seen.has(l.user_id) ? false : (seen.add(l.user_id), true)))
    .slice(0, 10);

  const { data: users } = await supabase
    .from("users")
    .select("id, username, avatar_url")
    .in(
      "id",
      unique.map((l) => l.user_id),
    );
  const userMap = new Map(
    ((users ?? []) as { id: string; username: string; avatar_url: string | null }[]).map((u) => [u.id, u]),
  );

  return unique
    .map((l) => {
      const u = userMap.get(l.user_id);
      if (!u) return null;
      return { user_id: l.user_id, username: u.username, avatar_url: u.avatar_url ?? null, listened_at: l.listened_at };
    })
    .filter(Boolean);
}

/** Co-occurrence-based recommended tracks (same source as the web related rail). */
async function getRecommended(supabase: Supa, canonicalId: string) {
  const { data: coRows } = await supabase
    .from("media_cooccurrence")
    .select("related_content_id, score")
    .eq("content_type", "song")
    .eq("content_id", canonicalId)
    .order("score", { ascending: false })
    .limit(12);
  const co = (coRows ?? []) as { related_content_id: string; score: number }[];
  if (!co.length) return [];

  const relatedIds = co.map((r) => r.related_content_id);
  const { data: relatedTracks } = await supabase
    .from("tracks")
    .select("id, name, album_id, track_external_ids(external_id, source)")
    .in("id", relatedIds);
  const tracks = (relatedTracks ?? []) as {
    id: string;
    name: string;
    album_id: string | null;
    track_external_ids: { external_id: string; source: string }[] | null;
  }[];
  if (!tracks.length) return [];

  const albumIds = [...new Set(tracks.map((t) => t.album_id).filter(Boolean))] as string[];
  const { data: albumRows } = albumIds.length
    ? await supabase.from("albums").select("id, name, image_url, artist_id").in("id", albumIds)
    : { data: [] };
  const albumMap = new Map(
    ((albumRows ?? []) as { id: string; name: string; image_url: string | null; artist_id: string | null }[]).map((a) => [
      a.id,
      a,
    ]),
  );

  const artistIds = [
    ...new Set(((albumRows ?? []) as { artist_id: string | null }[]).map((a) => a.artist_id).filter(Boolean)),
  ] as string[];
  const { data: artistRows } = artistIds.length
    ? await supabase.from("artists").select("id, name").in("id", artistIds)
    : { data: [] };
  const artistMap = new Map(((artistRows ?? []) as { id: string; name: string }[]).map((a) => [a.id, a]));

  const trackMap = new Map(tracks.map((t) => [t.id, t]));
  return relatedIds
    .map((rid) => {
      const t = trackMap.get(rid);
      if (!t) return null;
      const alb = t.album_id ? albumMap.get(t.album_id) : null;
      const art = alb?.artist_id ? artistMap.get(alb.artist_id) : null;
      const sId = (t.track_external_ids ?? []).find((e) => e.source === "spotify")?.external_id ?? null;
      return {
        id: sId ?? t.id,
        canonical_id: t.id,
        name: t.name,
        artist: art?.name ?? "",
        image_url: alb?.image_url ?? null,
        album_name: alb?.name ?? null,
        album_id: alb?.id ?? null,
        listen_count: 0,
        average_rating: null,
      };
    })
    .filter(Boolean);
}
