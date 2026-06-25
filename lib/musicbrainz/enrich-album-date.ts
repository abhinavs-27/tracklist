import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { matchAlbumDateOnMusicBrainz } from "./match-album-date";

export type EnrichAlbumDateResult =
  | "written"
  | "skipped-has-date"
  | "no-match"
  | "error";

/**
 * Fill release_date on an existing album row from MusicBrainz (fallback source).
 * Null-only (never overwrites a date), never touches name/artist/image, stores
 * provenance in the existing `albums.mbid` column. Safe to call repeatedly.
 */
export async function enrichAlbumDateFromMusicBrainz(
  supabase: SupabaseClient,
  albumUuid: string,
  artistName: string,
  albumName: string,
): Promise<EnrichAlbumDateResult> {
  try {
    if (!albumUuid || !artistName?.trim() || !albumName?.trim()) return "no-match";

    const { data: row } = await supabase
      .from("albums")
      .select("release_date")
      .eq("id", albumUuid)
      .maybeSingle();
    const existing = (row as { release_date?: string | null } | null)?.release_date;
    if (existing) return "skipped-has-date";

    const match = await matchAlbumDateOnMusicBrainz(artistName, albumName);
    if (!match) {
      // Best-effort marker so future MusicBrainz scans skip this no-match album.
      try {
        await supabase
          .from("albums")
          .update({ mb_date_checked_at: new Date().toISOString() })
          .eq("id", albumUuid);
      } catch {
        // ignore — marker is an optimization, not required for correctness
      }
      return "no-match";
    }

    const { error } = await supabase
      .from("albums")
      .update({
        release_date: match.releaseDate,
        mbid: match.mbid,
        mb_date_checked_at: new Date().toISOString(),
      })
      .eq("id", albumUuid);
    if (error) return "error";

    return "written";
  } catch {
    return "error";
  }
}
