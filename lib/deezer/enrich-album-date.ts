import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { linkAlbumExternalId } from "@/lib/catalog/entity-resolution";
import { matchAlbumOnDeezer } from "./match";

export type EnrichAlbumDateResult =
  | "written"
  | "skipped-has-date"
  | "no-match"
  | "error";

/**
 * Fill release_date + total_tracks on an existing album row from Deezer.
 * Null-only (never overwrites a date), never touches name/artist/image,
 * links a `deezer` external_id on success. Safe to call repeatedly.
 */
export async function enrichAlbumDateFromDeezer(
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

    const match = await matchAlbumOnDeezer(artistName, albumName);
    if (!match) return "no-match";

    const updatePayload: { release_date: string; total_tracks?: number } = {
      release_date: match.releaseDate,
    };
    if (match.totalTracks != null) updatePayload.total_tracks = match.totalTracks;

    const { error } = await supabase
      .from("albums")
      .update(updatePayload)
      .eq("id", albumUuid);
    if (error) return "error";

    await linkAlbumExternalId(supabase, albumUuid, "deezer", String(match.deezerAlbumId));
    return "written";
  } catch {
    return "error";
  }
}
