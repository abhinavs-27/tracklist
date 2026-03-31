import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

async function repointCommunityFeedTrackMerge(
  supabase: SupabaseClient,
  loserId: string,
  winnerId: string,
): Promise<void> {
  const { error } = await supabase.rpc("repoint_community_feed_track_merge", {
    p_loser: loserId,
    p_winner: winnerId,
  });
  if (error) {
    console.warn(
      "[mergeCanonicalTracks] repoint_community_feed_track_merge",
      error.message,
    );
  }
}

async function repointCommunityFeedArtistMerge(
  supabase: SupabaseClient,
  loserId: string,
  winnerId: string,
): Promise<void> {
  const { error } = await supabase.rpc("repoint_community_feed_artist_merge", {
    p_loser: loserId,
    p_winner: winnerId,
  });
  if (error) {
    console.warn(
      "[mergeCanonicalArtists] repoint_community_feed_artist_merge",
      error.message,
    );
  }
}

/**
 * `user_top_artists` PK is (user_id, artist_id, period). Merging two artist UUIDs can collide;
 * merge listen_count into the winner row and drop the loser row when both exist.
 */
async function repointUserTopArtistsForMerge(
  supabase: SupabaseClient,
  winnerId: string,
  loserId: string,
): Promise<void> {
  const { data: loserRows, error: qErr } = await supabase
    .from("user_top_artists")
    .select("user_id, period, listen_count")
    .eq("artist_id", loserId);

  if (qErr) {
    console.warn("[mergeCanonicalArtists] user_top_artists list failed", qErr);
    await supabase
      .from("user_top_artists")
      .update({ artist_id: winnerId })
      .eq("artist_id", loserId);
    return;
  }

  for (const row of loserRows ?? []) {
    const r = row as { user_id: string; period: string; listen_count: number };
    const { data: winRow } = await supabase
      .from("user_top_artists")
      .select("listen_count")
      .eq("user_id", r.user_id)
      .eq("period", r.period)
      .eq("artist_id", winnerId)
      .maybeSingle();

    if (winRow) {
      const wlc = (winRow as { listen_count?: number }).listen_count ?? 0;
      const llc = r.listen_count ?? 0;
      await supabase
        .from("user_top_artists")
        .update({ listen_count: wlc + llc })
        .eq("user_id", r.user_id)
        .eq("period", r.period)
        .eq("artist_id", winnerId);
      await supabase
        .from("user_top_artists")
        .delete()
        .eq("user_id", r.user_id)
        .eq("period", r.period)
        .eq("artist_id", loserId);
    } else {
      await supabase
        .from("user_top_artists")
        .update({ artist_id: winnerId })
        .eq("user_id", r.user_id)
        .eq("period", r.period)
        .eq("artist_id", loserId);
    }
  }
}

/**
 * Reassigns all rows pointing at `loserId` to `winnerId`, then deletes the loser track.
 * Used when Last.fm–origin and Spotify–origin UUIDs should become one canonical row.
 */
export async function mergeCanonicalTracks(
  supabase: SupabaseClient,
  winnerId: string,
  loserId: string,
): Promise<void> {
  if (winnerId === loserId) return;

  const { data: loserMaps, error: mapErr } = await supabase
    .from("track_external_ids")
    .select("id")
    .eq("track_id", loserId);
  if (mapErr) {
    console.warn("[mergeCanonicalTracks] list external ids failed", mapErr);
    return;
  }

  for (const row of loserMaps ?? []) {
    const rid = (row as { id: string }).id;
    const { error: upErr } = await supabase
      .from("track_external_ids")
      .update({ track_id: winnerId })
      .eq("id", rid);
    if (upErr?.code === "23505") {
      await supabase.from("track_external_ids").delete().eq("id", rid);
    } else if (upErr) {
      console.warn("[mergeCanonicalTracks] move external id failed", upErr);
    }
  }

  await supabase.from("logs").update({ track_id: winnerId }).eq("track_id", loserId);

  const { data: srtWinnerRows } = await supabase
    .from("spotify_recent_tracks")
    .select("user_id, played_at")
    .eq("track_id", winnerId);
  const winnerKeys = new Set(
    (srtWinnerRows ?? []).map(
      (r) =>
        `${(r as { user_id: string }).user_id}|${(r as { played_at: string }).played_at}`,
    ),
  );
  const { data: srtLoserRows } = await supabase
    .from("spotify_recent_tracks")
    .select("id, user_id, played_at")
    .eq("track_id", loserId);
  for (const row of srtLoserRows ?? []) {
    const r = row as { id: string; user_id: string; played_at: string };
    if (winnerKeys.has(`${r.user_id}|${r.played_at}`)) {
      await supabase.from("spotify_recent_tracks").delete().eq("id", r.id);
    }
  }

  const { data: songReviewWinnerUsers } = await supabase
    .from("reviews")
    .select("user_id")
    .eq("entity_type", "song")
    .eq("entity_id", winnerId);
  const songReviewOverlap = [
    ...new Set(
      (songReviewWinnerUsers ?? []).map(
        (r) => (r as { user_id: string }).user_id,
      ),
    ),
  ];
  if (songReviewOverlap.length > 0) {
    await supabase
      .from("reviews")
      .delete()
      .eq("entity_type", "song")
      .eq("entity_id", loserId)
      .in("user_id", songReviewOverlap);
  }

  await supabase
    .from("reviews")
    .update({ entity_id: winnerId })
    .eq("entity_type", "song")
    .eq("entity_id", loserId);

  await supabase
    .from("list_items")
    .update({ entity_id: winnerId })
    .eq("entity_type", "song")
    .eq("entity_id", loserId);

  const { data: wStat } = await supabase
    .from("track_stats")
    .select("track_id, listen_count, review_count, avg_rating")
    .eq("track_id", winnerId)
    .maybeSingle();
  const { data: lStat } = await supabase
    .from("track_stats")
    .select("track_id, listen_count, review_count, avg_rating")
    .eq("track_id", loserId)
    .maybeSingle();

  if (lStat && !wStat) {
    await supabase.from("track_stats").update({ track_id: winnerId }).eq("track_id", loserId);
  } else if (lStat && wStat) {
    const w = wStat as {
      listen_count?: number | null;
      review_count?: number | null;
    };
    const l = lStat as {
      listen_count?: number | null;
      review_count?: number | null;
    };
    await supabase
      .from("track_stats")
      .update({
        listen_count: (w.listen_count ?? 0) + (l.listen_count ?? 0),
        review_count: (w.review_count ?? 0) + (l.review_count ?? 0),
        last_updated: new Date().toISOString(),
      })
      .eq("track_id", winnerId);
    await supabase.from("track_stats").delete().eq("track_id", loserId);
  }

  const { data: wEs } = await supabase
    .from("entity_stats")
    .select("play_count, review_count, avg_rating, favorite_count")
    .eq("entity_type", "song")
    .eq("entity_id", winnerId)
    .maybeSingle();
  const { data: lEs } = await supabase
    .from("entity_stats")
    .select("play_count, review_count, avg_rating, favorite_count")
    .eq("entity_type", "song")
    .eq("entity_id", loserId)
    .maybeSingle();

  if (lEs && !wEs) {
    await supabase
      .from("entity_stats")
      .update({ entity_id: winnerId })
      .eq("entity_type", "song")
      .eq("entity_id", loserId);
  } else if (lEs && wEs) {
    const w = wEs as {
      play_count?: number;
      review_count?: number;
      favorite_count?: number;
    };
    const l = lEs as {
      play_count?: number;
      review_count?: number;
      favorite_count?: number;
    };
    await supabase
      .from("entity_stats")
      .update({
        play_count: (w.play_count ?? 0) + (l.play_count ?? 0),
        review_count: (w.review_count ?? 0) + (l.review_count ?? 0),
        favorite_count: (w.favorite_count ?? 0) + (l.favorite_count ?? 0),
        updated_at: new Date().toISOString(),
      })
      .eq("entity_type", "song")
      .eq("entity_id", winnerId);
    await supabase
      .from("entity_stats")
      .delete()
      .eq("entity_type", "song")
      .eq("entity_id", loserId);
  }

  await supabase
    .from("user_listening_aggregates")
    .update({ entity_id: winnerId })
    .eq("entity_type", "track")
    .eq("entity_id", loserId);

  await supabase
    .from("notifications")
    .update({ entity_id: winnerId })
    .eq("entity_type", "song")
    .eq("entity_id", loserId);

  await supabase
    .from("spotify_recent_tracks")
    .update({ track_id: winnerId })
    .eq("track_id", loserId);

  await supabase
    .from("weekly_reports")
    .update({ top_track_id: winnerId })
    .eq("top_track_id", loserId);

  await repointCommunityFeedTrackMerge(supabase, loserId, winnerId);

  const { error: delErr } = await supabase.from("tracks").delete().eq("id", loserId);
  if (delErr) {
    console.warn("[mergeCanonicalTracks] delete loser track failed", delErr);
  }
}

/**
 * Merges a Last.fm-only artist row into the Spotify canonical artist.
 */
export async function mergeCanonicalArtists(
  supabase: SupabaseClient,
  winnerId: string,
  loserId: string,
): Promise<void> {
  if (winnerId === loserId) return;

  const { data: loserMaps } = await supabase
    .from("artist_external_ids")
    .select("id")
    .eq("artist_id", loserId);

  for (const row of loserMaps ?? []) {
    const rid = (row as { id: string }).id;
    const { error: upErr } = await supabase
      .from("artist_external_ids")
      .update({ artist_id: winnerId })
      .eq("id", rid);
    if (upErr?.code === "23505") {
      await supabase.from("artist_external_ids").delete().eq("id", rid);
    } else if (upErr) {
      console.warn("[mergeCanonicalArtists] move external id failed", upErr);
    }
  }

  await supabase.from("albums").update({ artist_id: winnerId }).eq("artist_id", loserId);
  await supabase.from("tracks").update({ artist_id: winnerId }).eq("artist_id", loserId);

  await supabase
    .from("logs")
    .update({ artist_id: winnerId })
    .eq("artist_id", loserId);

  const { data: artistReviewWinnerUsers } = await supabase
    .from("reviews")
    .select("user_id")
    .eq("entity_type", "artist")
    .eq("entity_id", winnerId);
  const artistReviewOverlap = [
    ...new Set(
      (artistReviewWinnerUsers ?? []).map(
        (r) => (r as { user_id: string }).user_id,
      ),
    ),
  ];
  if (artistReviewOverlap.length > 0) {
    await supabase
      .from("reviews")
      .delete()
      .eq("entity_type", "artist")
      .eq("entity_id", loserId)
      .in("user_id", artistReviewOverlap);
  }

  await supabase
    .from("reviews")
    .update({ entity_id: winnerId })
    .eq("entity_type", "artist")
    .eq("entity_id", loserId);

  const { data: favWinnerUsers } = await supabase
    .from("user_favorite_artists")
    .select("user_id")
    .eq("artist_id", winnerId);
  const overlapUserIds = (favWinnerUsers ?? []).map(
    (r) => (r as { user_id: string }).user_id,
  );
  if (overlapUserIds.length > 0) {
    await supabase
      .from("user_favorite_artists")
      .delete()
      .eq("artist_id", loserId)
      .in("user_id", overlapUserIds);
  }

  await supabase
    .from("user_favorite_artists")
    .update({ artist_id: winnerId })
    .eq("artist_id", loserId);

  const { data: loserGenreRows } = await supabase
    .from("user_listening_genre_contributors")
    .select("id, user_id, genre, week_start, month, year, play_count")
    .eq("artist_id", loserId);

  for (const row of loserGenreRows ?? []) {
    const r = row as {
      id: string;
      user_id: string;
      genre: string;
      week_start: string | null;
      month: string | null;
      year: number | null;
      play_count: number | null;
    };
    let winQ = supabase
      .from("user_listening_genre_contributors")
      .select("id, play_count")
      .eq("artist_id", winnerId)
      .eq("user_id", r.user_id)
      .eq("genre", r.genre);
    winQ =
      r.week_start === null
        ? winQ.is("week_start", null)
        : winQ.eq("week_start", r.week_start);
    winQ =
      r.month === null ? winQ.is("month", null) : winQ.eq("month", r.month);
    winQ =
      r.year === null ? winQ.is("year", null) : winQ.eq("year", r.year);
    const { data: winG } = await winQ.maybeSingle();
    if (winG) {
      const w = winG as { id: string; play_count: number | null };
      await supabase
        .from("user_listening_genre_contributors")
        .update({
          play_count: (w.play_count ?? 0) + (r.play_count ?? 0),
          updated_at: new Date().toISOString(),
        })
        .eq("id", w.id);
      await supabase
        .from("user_listening_genre_contributors")
        .delete()
        .eq("id", r.id);
    } else {
      await supabase
        .from("user_listening_genre_contributors")
        .update({ artist_id: winnerId })
        .eq("id", r.id);
    }
  }

  const { data: wEs } = await supabase
    .from("entity_stats")
    .select("play_count, review_count, avg_rating, favorite_count")
    .eq("entity_type", "artist")
    .eq("entity_id", winnerId)
    .maybeSingle();
  const { data: lEs } = await supabase
    .from("entity_stats")
    .select("play_count, review_count, avg_rating, favorite_count")
    .eq("entity_type", "artist")
    .eq("entity_id", loserId)
    .maybeSingle();

  if (lEs && !wEs) {
    await supabase
      .from("entity_stats")
      .update({ entity_id: winnerId })
      .eq("entity_type", "artist")
      .eq("entity_id", loserId);
  } else if (lEs && wEs) {
    const w = wEs as {
      play_count?: number;
      review_count?: number;
      favorite_count?: number;
    };
    const l = lEs as {
      play_count?: number;
      review_count?: number;
      favorite_count?: number;
    };
    await supabase
      .from("entity_stats")
      .update({
        play_count: (w.play_count ?? 0) + (l.play_count ?? 0),
        review_count: (w.review_count ?? 0) + (l.review_count ?? 0),
        favorite_count: (w.favorite_count ?? 0) + (l.favorite_count ?? 0),
        updated_at: new Date().toISOString(),
      })
      .eq("entity_type", "artist")
      .eq("entity_id", winnerId);
    await supabase
      .from("entity_stats")
      .delete()
      .eq("entity_type", "artist")
      .eq("entity_id", loserId);
  }

  await supabase
    .from("user_listening_aggregates")
    .update({ entity_id: winnerId })
    .eq("entity_type", "artist")
    .eq("entity_id", loserId);

  await supabase
    .from("notifications")
    .update({ entity_id: winnerId })
    .eq("entity_type", "artist")
    .eq("entity_id", loserId);

  await supabase
    .from("weekly_reports")
    .update({ top_artist_id: winnerId })
    .eq("top_artist_id", loserId);

  await repointUserTopArtistsForMerge(supabase, winnerId, loserId);
  await repointCommunityFeedArtistMerge(supabase, loserId, winnerId);

  const { error: delErr } = await supabase.from("artists").delete().eq("id", loserId);
  if (delErr) {
    console.warn("[mergeCanonicalArtists] delete loser artist failed", delErr);
  }
}
