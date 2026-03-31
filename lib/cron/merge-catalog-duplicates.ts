import type { SupabaseClient } from "@supabase/supabase-js";

export type MergeCatalogDuplicatePairError = {
  kind: "track" | "album" | "artist";
  winnerId: string;
  loserId: string;
  message: string;
};

export type MergeCatalogDuplicateRound = {
  round: number;
  tracksOk: number;
  albumsOk: number;
  artistsOk: number;
  errors: MergeCatalogDuplicatePairError[];
};

export type MergeCatalogDuplicatesResult = {
  dryRun: boolean;
  maxRounds: number;
  rounds: MergeCatalogDuplicateRound[];
  listRpcErrors: string[];
  refreshEntityStatsOk: boolean | null;
  refreshEntityStatsError: string | null;
};

type Pair = { winner_id: string; loser_id: string };

const LIST_TRACK = "merge_catalog_list_track_duplicate_pairs" as const;
const LIST_ALBUM = "merge_catalog_list_album_duplicate_pairs" as const;
const LIST_ARTIST = "merge_catalog_list_artist_duplicate_pairs" as const;

async function fetchPairs(
  supabase: SupabaseClient,
  name: typeof LIST_TRACK | typeof LIST_ALBUM | typeof LIST_ARTIST,
): Promise<{ pairs: Pair[]; error: string | null }> {
  const { data, error } = await supabase.rpc(name);
  if (error) {
    return { pairs: [], error: `${name}: ${error.message}` };
  }
  const rows = (data ?? []) as Pair[];
  const pairs = rows.filter(
    (r) =>
      typeof r.winner_id === "string" &&
      typeof r.loser_id === "string" &&
      r.winner_id !== r.loser_id,
  );
  return { pairs, error: null };
}

/**
 * Merge duplicate catalog rows one RPC at a time (tracks → albums → artists per round).
 * Requires migrations 104+ (merge_catalog_*_pair) and 110 (merge_catalog_list_*_pairs).
 */
export async function runMergeCatalogDuplicates(
  supabase: SupabaseClient,
  options: { maxRounds?: number; dryRun?: boolean } = {},
): Promise<MergeCatalogDuplicatesResult> {
  const maxRounds = Math.min(
    200,
    Math.max(1, options.maxRounds ?? 5),
  );
  const dryRun = options.dryRun ?? false;

  const rounds: MergeCatalogDuplicateRound[] = [];
  const listRpcErrors: string[] = [];

  for (let round = 1; round <= maxRounds; round++) {
    const errors: MergeCatalogDuplicatePairError[] = [];
    let tracksOk = 0;
    let albumsOk = 0;
    let artistsOk = 0;

    const trackList = await fetchPairs(supabase, LIST_TRACK);
    if (trackList.error) listRpcErrors.push(trackList.error);
    for (const { winner_id, loser_id } of trackList.pairs) {
      if (dryRun) {
        tracksOk++;
        continue;
      }
      const { error } = await supabase.rpc("merge_catalog_track_pair", {
        p_winner: winner_id,
        p_loser: loser_id,
      });
      if (error) {
        errors.push({
          kind: "track",
          winnerId: winner_id,
          loserId: loser_id,
          message: error.message,
        });
      } else {
        tracksOk++;
      }
    }

    const albumList = await fetchPairs(supabase, LIST_ALBUM);
    if (albumList.error) listRpcErrors.push(albumList.error);
    for (const { winner_id, loser_id } of albumList.pairs) {
      if (dryRun) {
        albumsOk++;
        continue;
      }
      const { error } = await supabase.rpc("merge_catalog_album_pair", {
        p_winner: winner_id,
        p_loser: loser_id,
      });
      if (error) {
        errors.push({
          kind: "album",
          winnerId: winner_id,
          loserId: loser_id,
          message: error.message,
        });
      } else {
        albumsOk++;
      }
    }

    const artistList = await fetchPairs(supabase, LIST_ARTIST);
    if (artistList.error) listRpcErrors.push(artistList.error);
    for (const { winner_id, loser_id } of artistList.pairs) {
      if (dryRun) {
        artistsOk++;
        continue;
      }
      const { error } = await supabase.rpc("merge_catalog_artist_pair", {
        p_winner: winner_id,
        p_loser: loser_id,
      });
      if (error) {
        errors.push({
          kind: "artist",
          winnerId: winner_id,
          loserId: loser_id,
          message: error.message,
        });
      } else {
        artistsOk++;
      }
    }

    const pairsThisRound =
      trackList.pairs.length + albumList.pairs.length + artistList.pairs.length;

    rounds.push({
      round,
      tracksOk,
      albumsOk,
      artistsOk,
      errors,
    });

    if (dryRun) {
      break;
    }

    if (pairsThisRound === 0) {
      break;
    }

    const anySuccess = tracksOk + albumsOk + artistsOk > 0;
    if (!anySuccess) {
      listRpcErrors.push(
        "merge_catalog: this round had duplicate pairs but every merge failed; stopping to avoid retrying the same failures forever",
      );
      break;
    }
  }

  let refreshEntityStatsOk: boolean | null = null;
  let refreshEntityStatsError: string | null = null;

  if (!dryRun) {
    const { error: refErr } = await supabase.rpc("refresh_entity_stats");
    if (refErr) {
      refreshEntityStatsOk = false;
      refreshEntityStatsError = refErr.message;
    } else {
      refreshEntityStatsOk = true;
    }
  }

  return {
    dryRun,
    maxRounds,
    rounds,
    listRpcErrors,
    refreshEntityStatsOk,
    refreshEntityStatsError,
  };
}
