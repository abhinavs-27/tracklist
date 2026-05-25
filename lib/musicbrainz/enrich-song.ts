import "server-only";
import {
  resolveTrackMbid,
  fetchMbRecording,
  fetchMbWork,
} from "@tracklist/musicbrainz-client";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { upsertCreditArtist } from "./upsert-credit-artist";

const CREDIT_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const MBID_RETRY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// When enrichment runs but finds no credits, retry after 30 days (not 1 year)
const NO_CREDITS_RETRY_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function isStale(ts: string | null, ttlMs: number): boolean {
  if (!ts) return true;
  return Date.now() - new Date(ts).getTime() > ttlMs;
}

function staleSoonTimestamp(retryInMs: number): string {
  return new Date(Date.now() - CREDIT_TTL_MS + retryInMs).toISOString();
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

  if (!track) return;
  const creditsStale = isStale(track.credits_enriched_at as string | null, CREDIT_TTL_MS);
  // Force retry if previously stamped but MBID was never resolved
  const needsRetry = !creditsStale && !track.mbid && track.credits_enriched_at;
  if (!creditsStale && !needsRetry) return;

  // Try Genius first — faster resolution, better coverage for recent releases
  if (process.env.GENIUS_ACCESS_TOKEN) {
    try {
      const { enrichSongGenius } = await import("@/lib/genius/enrich-song-genius");
      const foundViaGenius = await enrichSongGenius(supabase, songUuid);
      if (foundViaGenius) {
        await supabase.from("tracks").update({ credits_enriched_at: new Date().toISOString() }).eq("id", songUuid);
        return;
      }
    } catch (err) {
      console.warn("[enrich-song] Genius enrichment failed, falling through to MB", (err as Error).message);
    }
  }

  // Resolve MBID
  let mbid = track.mbid as string | null;
  if (!mbid) {
    // resolveCanonicalTrackSpotifyInWorker checks track_external_ids first,
    // then falls back to Last.fm mapping — handles Last.fm imports without Spotify IDs
    const { resolveCanonicalTrackSpotifyInWorker } = await import("@/lib/jobs/resolve-canonical-spotify");
    await resolveCanonicalTrackSpotifyInWorker(songUuid);

    // Re-check after potential link
    const { data: extId } = await supabase
      .from("track_external_ids")
      .select("external_id")
      .eq("track_id", songUuid)
      .eq("source", "spotify")
      .maybeSingle();

    if (extId?.external_id) {
      mbid = await resolveTrackMbid(extId.external_id as string);
      if (mbid) await supabase.from("tracks").update({ mbid }).eq("id", songUuid);
    }
  }

  if (!mbid) {
    await supabase.from("tracks").update({ credits_enriched_at: staleSoonTimestamp(MBID_RETRY_TTL_MS) }).eq("id", songUuid);
    return;
  }

  const recording = await fetchMbRecording(mbid);
  if (!recording) {
    await supabase.from("tracks").update({ credits_enriched_at: staleSoonTimestamp(MBID_RETRY_TTL_MS) }).eq("id", songUuid);
    return;
  }

  const relations = recording.relations ?? [];

  // Direct recording-artist rels: producers, samples, covers
  for (const rel of relations) {
    if (rel.artist) {
      if (rel.type === "producer") {
        const artistId = await upsertCreditArtist(supabase, rel.artist, { isProducer: true });
        const { error } = await supabase.from("song_producers").insert({ song_id: songUuid, artist_id: artistId });
        if (error && error.code !== "23505") {
          console.warn("[enrich-song] song_producers insert error", error.message);
        }
      }
    }

    // Samples and covers: only link if the referenced track already exists in our DB
    if (rel.type === "samples material from" && rel.recording) {
      const sampledId = await findTrackByMbid(supabase, rel.recording.id);
      if (sampledId) {
        const { error } = await supabase.from("song_samples").insert({ song_id: songUuid, sampled_song_id: sampledId });
        if (error && error.code !== "23505") {
          console.warn("[enrich-song] song_samples insert error", error.message);
        }
      }
    }
    if ((rel.type === "cover of" || rel.type === "based on") && rel.recording) {
      const originalId = await findTrackByMbid(supabase, rel.recording.id);
      if (originalId) {
        const { error } = await supabase.from("song_covers").insert({ song_id: songUuid, original_song_id: originalId });
        if (error && error.code !== "23505") {
          console.warn("[enrich-song] song_covers insert error", error.message);
        }
      }
    }
  }

  // Songwriter credits live on the Work, not the Recording — follow work-rels
  let foundCredits = false;
  const seenSongwriters = new Set<string>();
  const workRels = relations.filter((r) => r.type === "recording of" && r.work);
  for (const workRel of workRels) {
    const work = await fetchMbWork(workRel.work!.id);
    if (!work) continue;
    for (const rel of work.relations ?? []) {
      if (!rel.artist) continue;
      if (rel.type === "lyricist" || rel.type === "composer" || rel.type === "writer") {
        if (seenSongwriters.has(rel.artist.id)) continue;
        seenSongwriters.add(rel.artist.id);
        const artistId = await upsertCreditArtist(supabase, rel.artist, { isSongwriter: true });
        const { error } = await supabase.from("song_songwriters").insert({ song_id: songUuid, artist_id: artistId });
        if (error && error.code !== "23505") {
          console.warn("[enrich-song] song_songwriters insert error", error.message);
        } else if (!error) foundCredits = true;
      }
      // Producers credited at work level also count
      if (rel.type === "producer") {
        const artistId = await upsertCreditArtist(supabase, rel.artist, { isProducer: true });
        const { error } = await supabase.from("song_producers").insert({ song_id: songUuid, artist_id: artistId });
        if (error && error.code !== "23505") {
          console.warn("[enrich-song] song_producers insert error", error.message);
        } else if (!error) foundCredits = true;
      }
    }
  }

  // If no credits found, write a short-TTL timestamp so we retry in 30 days instead of 1 year
  await supabase.from("tracks").update({
    credits_enriched_at: foundCredits ? new Date().toISOString() : staleSoonTimestamp(NO_CREDITS_RETRY_TTL_MS),
  }).eq("id", songUuid);
}
