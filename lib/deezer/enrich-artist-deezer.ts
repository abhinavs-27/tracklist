import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { searchDeezerArtists } from "./client";

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

// Deezer placeholder images have an empty hash segment: "/images/artist//1000x..."
function isPlaceholderImage(url: string | undefined): boolean {
  return !url || url.includes("/artist//");
}

export async function enrichArtistImageFromDeezer(
  supabase: SupabaseClient,
  artistId: string,
  artistName: string,
): Promise<{ enriched: boolean }> {
  try {
    const results = await searchDeezerArtists(artistName);
    if (!results.length) return { enriched: false };

    // Prefer exact normalized name match; fall back to first result.
    const match =
      results.find((r) => normalize(r.name) === normalize(artistName)) ??
      results[0];

    if (isPlaceholderImage(match.picture_xl)) {
      return { enriched: false };
    }

    const { error } = await supabase
      .from("artists")
      .update({ image_url: match.picture_xl })
      .eq("id", artistId)
      .is("image_url", null);

    return { enriched: !error };
  } catch {
    return { enriched: false };
  }
}
