import "server-only";
import {
  resolveTrackMbid,
  fetchMbRecording,
} from "@tracklist/musicbrainz-client";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { upsertCreditArtist } from "./upsert-credit-artist";

const CREDIT_TTL_MS = 365 * 24 * 60 * 60 * 1000;

function isStale(ts: string | null, ttlMs: number): boolean {
  if (!ts) return true;
  return Date.now() - new Date(ts).getTime() > ttlMs;
}

async function findTrackByMbid(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  mbid: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("tracks")
    .select("id")
    .eq("mbid", mbid)
    .maybeSingle();
  return (data?.id as string | null) ?? null;
}

export async function enrichSong(songUuid: string): Promise<void> {
  const supabase = createSupabaseAdminClient();

  const { data: track } = await supabase
    .from("tracks")
    .select("id, name, mbid, credits_enriched_at")
    .eq("id", songUuid)
    .single();

  if (!track || !isStale(track.credits_enriched_at as string | null, CREDIT_TTL_MS)) return;

  // Resolve MBID
  let mbid = track.mbid as string | null;
  if (!mbid) {
    const { data: extId } = await supabase
      .from("external_ids")
      .select("external_id")
      .eq("entity_id", songUuid)
      .eq("source", "spotify")
      .maybeSingle();

    if (extId?.external_id) {
      mbid = await resolveTrackMbid(extId.external_id as string);
      if (mbid) await supabase.from("tracks").update({ mbid }).eq("id", songUuid);
    }
  }

  if (!mbid) {
    await supabase.from("tracks").update({ credits_enriched_at: new Date().toISOString() }).eq("id", songUuid);
    return;
  }

  const recording = await fetchMbRecording(mbid);
  if (!recording) {
    await supabase.from("tracks").update({ credits_enriched_at: new Date().toISOString() }).eq("id", songUuid);
    return;
  }

  const relations = recording.relations ?? [];

  for (const rel of relations) {
    if (rel.artist) {
      if (rel.type === "producer") {
        const artistId = await upsertCreditArtist(supabase, rel.artist, { isProducer: true });
        const { error } = await supabase.from("song_producers").insert({ song_id: songUuid, artist_id: artistId });
        if (error && !error.message.includes("duplicate")) {
          console.warn("[enrich-song] song_producers insert error", error.message);
        }
      }
      if (rel.type === "lyricist" || rel.type === "composer" || rel.type === "writer") {
        const artistId = await upsertCreditArtist(supabase, rel.artist, { isSongwriter: true });
        const { error } = await supabase.from("song_songwriters").insert({ song_id: songUuid, artist_id: artistId });
        if (error && !error.message.includes("duplicate")) {
          console.warn("[enrich-song] song_songwriters insert error", error.message);
        }
      }
    }

    // Samples and covers: only link if the referenced track already exists in our DB
    if (rel.type === "samples material from" && rel.recording) {
      const sampledId = await findTrackByMbid(supabase, rel.recording.id);
      if (sampledId) {
        const { error } = await supabase.from("song_samples").insert({ song_id: songUuid, sampled_song_id: sampledId });
        if (error && !error.message.includes("duplicate")) {
          console.warn("[enrich-song] song_samples insert error", error.message);
        }
      }
    }
    if ((rel.type === "cover of" || rel.type === "based on") && rel.recording) {
      const originalId = await findTrackByMbid(supabase, rel.recording.id);
      if (originalId) {
        const { error } = await supabase.from("song_covers").insert({ song_id: songUuid, original_song_id: originalId });
        if (error && !error.message.includes("duplicate")) {
          console.warn("[enrich-song] song_covers insert error", error.message);
        }
      }
    }
  }

  await supabase.from("tracks").update({ credits_enriched_at: new Date().toISOString() }).eq("id", songUuid);
}
