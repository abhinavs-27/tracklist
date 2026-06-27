import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { trackTitleSimilarity } from "@/lib/lastfm/normalize-lastfm-search";
import { resolveAlbumTracklist, type AlbumForTrackOrder } from "./resolve";

export type TrackOrderResult =
  | "written"
  | "skipped-checked"
  | "no-source"
  | "no-match"
  | "error";

const MIN_TITLE_SCORE = 40; // trackTitleSimilarity tokens_high

async function stampChecked(supabase: SupabaseClient, albumUuid: string): Promise<void> {
  await supabase
    .from("albums")
    .update({ track_order_checked_at: new Date().toISOString() })
    .eq("id", albumUuid);
}

/**
 * Fill track_number + disc_number for an album's null-track-number tracks from a
 * resolved (Deezer/MusicBrainz) tracklist. Null-only (never overwrites an existing
 * track_number). One-to-one name matching. Stamps track_order_checked_at on any
 * clean outcome (so resumes skip); on a hard error the marker is NOT stamped.
 */
export async function enrichTrackOrderForAlbum(
  supabase: SupabaseClient,
  albumUuid: string,
  opts?: { force?: boolean; deezerOnly?: boolean },
): Promise<TrackOrderResult> {
  try {
    const { data: albumRow } = await supabase
      .from("albums")
      .select("name, artist_id, mbid, track_order_checked_at")
      .eq("id", albumUuid)
      .maybeSingle();
    const album = albumRow as
      | { name: string; artist_id: string | null; mbid: string | null; track_order_checked_at: string | null }
      | null;
    if (!album) return "error";
    if (album.track_order_checked_at && !opts?.force) return "skipped-checked";

    const { data: trackData } = await supabase
      .from("tracks")
      .select("id, name, track_number")
      .eq("album_id", albumUuid);
    const tracks = (trackData ?? []) as { id: string; name: string; track_number: number | null }[];
    const nullTracks = tracks.filter((t) => t.track_number === null);
    if (nullTracks.length === 0) {
      await stampChecked(supabase, albumUuid);
      return "skipped-checked";
    }

    let artistName = "";
    if (album.artist_id) {
      const { data: artistRow } = await supabase
        .from("artists")
        .select("name")
        .eq("id", album.artist_id)
        .maybeSingle();
      artistName = (artistRow as { name?: string } | null)?.name ?? "";
    }

    const forResolve: AlbumForTrackOrder = {
      id: albumUuid,
      name: album.name,
      artistName,
      mbid: album.mbid ?? null,
    };

    const resolved = await resolveAlbumTracklist(supabase, forResolve, { deezerOnly: opts?.deezerOnly });
    if (!resolved) {
      await stampChecked(supabase, albumUuid);
      return "no-source";
    }

    // One-to-one greedy matching: best (track, sourceEntry) pairs by similarity desc.
    const claimed = new Set<number>();
    type Pair = { trackId: string; entryIdx: number; score: number };
    const pairs: Pair[] = [];
    nullTracks.forEach((t) => {
      resolved.tracks.forEach((entry, idx) => {
        const sim = trackTitleSimilarity(t.name, entry.title).score;
        if (sim >= MIN_TITLE_SCORE) pairs.push({ trackId: t.id, entryIdx: idx, score: sim });
      });
    });
    pairs.sort((a, b) => b.score - a.score);

    const assignedTracks = new Set<string>();
    let written = 0;
    let anyUpdateError = false;
    for (const p of pairs) {
      if (assignedTracks.has(p.trackId) || claimed.has(p.entryIdx)) continue;
      const entry = resolved.tracks[p.entryIdx];
      const { error } = await supabase
        .from("tracks")
        .update({ track_number: entry.trackNumber, disc_number: entry.discNumber })
        .eq("id", p.trackId);
      if (error) {
        anyUpdateError = true;
        continue;
      }
      assignedTracks.add(p.trackId);
      claimed.add(p.entryIdx);
      written++;
    }

    if (anyUpdateError) return "error"; // not stamped -> retried next run
    await stampChecked(supabase, albumUuid);
    return written > 0 ? "written" : "no-match";
  } catch {
    return "error";
  }
}
