import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface CreditArtist {
  id: string | null; // MBID when known; null for Genius-sourced artists
  name: string;
}

export interface CreditArtistFlags {
  isProducer?: boolean;
  isSongwriter?: boolean;
}

export async function upsertCreditArtist(
  supabase: SupabaseClient,
  artist: CreditArtist,
  flags: CreditArtistFlags = {},
): Promise<string> {
  // Look up by MBID first — only when MBID is available
  if (artist.id) {
    const { data: byMbid } = await supabase
      .from("artists")
      .select("id, is_producer, is_songwriter")
      .eq("mbid", artist.id)
      .maybeSingle();

    if (byMbid) {
      const updates: Record<string, boolean> = {};
      if (flags.isProducer && !byMbid.is_producer) updates.is_producer = true;
      if (flags.isSongwriter && !byMbid.is_songwriter) updates.is_songwriter = true;
      if (Object.keys(updates).length) {
        const { error: updateErr } = await supabase.from("artists").update(updates).eq("id", byMbid.id);
        if (updateErr) console.warn("[upsert-credit-artist] byMbid update failed", byMbid.id, updateErr.message);
      }
      return byMbid.id as string;
    }
  }

  // Check by name (case-insensitive) — may already exist as a performer
  const { data: byName } = await supabase
    .from("artists")
    .select("id")
    .ilike("name", artist.name)
    .maybeSingle();

  if (byName) {
    const updates: Record<string, unknown> = {};
    if (artist.id) updates.mbid = artist.id;
    if (flags.isProducer) updates.is_producer = true;
    if (flags.isSongwriter) updates.is_songwriter = true;
    if (Object.keys(updates).length) {
      const { error: updateErr } = await supabase.from("artists").update(updates).eq("id", byName.id);
      if (updateErr) console.warn("[upsert-credit-artist] byName update failed", byName.id, updateErr.message);
    }
    return byName.id as string;
  }

  // Insert new artist record
  const insertData: Record<string, unknown> = {
    name: artist.name,
    data_source: artist.id ? "musicbrainz" : "genius",
    is_producer: flags.isProducer ?? false,
    is_songwriter: flags.isSongwriter ?? false,
  };
  if (artist.id) insertData.mbid = artist.id;

  const { data, error } = await supabase
    .from("artists")
    .insert(insertData)
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      // Race: another concurrent enrichment inserted this artist first
      if (artist.id) {
        const { data: existing } = await supabase.from("artists").select("id").eq("mbid", artist.id).maybeSingle();
        if (existing) return existing.id as string;
      }
      const { data: existingByName } = await supabase
        .from("artists")
        .select("id")
        .ilike("name", artist.name)
        .maybeSingle();
      if (existingByName) return existingByName.id as string;
    }
    throw new Error(`upsertCreditArtist failed: ${error.message}`);
  }
  return data.id as string;
}
