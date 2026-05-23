// lib/musicbrainz/upsert-credit-artist.ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MbArtist } from "@tracklist/musicbrainz-client";

export interface CreditArtistFlags {
  isProducer?: boolean;
  isSongwriter?: boolean;
}

export async function upsertCreditArtist(
  supabase: SupabaseClient,
  mb: MbArtist,
  flags: CreditArtistFlags = {},
): Promise<string> {
  // Look up by MBID first (most reliable), then by name
  const { data: byMbid } = await supabase
    .from("artists")
    .select("id, is_producer, is_songwriter")
    .eq("mbid", mb.id)
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

  // Check by name (case-insensitive) — may already exist as a performer
  const { data: byName } = await supabase
    .from("artists")
    .select("id")
    .ilike("name", mb.name)
    .maybeSingle();

  if (byName) {
    const { error: updateErr } = await supabase
      .from("artists")
      .update({
        mbid: mb.id,
        ...(flags.isProducer ? { is_producer: true } : {}),
        ...(flags.isSongwriter ? { is_songwriter: true } : {}),
      })
      .eq("id", byName.id);
    if (updateErr) console.warn("[upsert-credit-artist] byName update failed", byName.id, updateErr.message);
    return byName.id as string;
  }

  // Create minimal artist record — use upsert to handle concurrent enrichment of the same producer
  const { data, error } = await supabase
    .from("artists")
    .upsert(
      {
        name: mb.name,
        mbid: mb.id,
        data_source: "musicbrainz",
        is_producer: flags.isProducer ?? false,
        is_songwriter: flags.isSongwriter ?? false,
      },
      { onConflict: "mbid", ignoreDuplicates: false },
    )
    .select("id")
    .single();

  if (error) throw new Error(`upsertCreditArtist failed: ${error.message}`);
  return data.id as string;
}
