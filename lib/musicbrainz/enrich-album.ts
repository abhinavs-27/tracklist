import "server-only";
import { resolveAlbumMbid, fetchMbRelease } from "@tracklist/musicbrainz-client";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { upsertLabel } from "./upsert-label";
import { upsertCreditArtist } from "./upsert-credit-artist";
import { fetchAlbumBioLastfm } from "./fetch-bio";

const BIO_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const CREDIT_TTL_MS = 365 * 24 * 60 * 60 * 1000;
// When MBID can't be resolved, retry after 7 days instead of blocking for a year
const MBID_RETRY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function isStale(ts: string | null, ttlMs: number): boolean {
  if (!ts) return true;
  return Date.now() - new Date(ts).getTime() > ttlMs;
}

// Returns a timestamp that will appear stale after `retryInMs` milliseconds.
// isStale checks: Date.now() - ts > CREDIT_TTL_MS
// So we set ts = now - (CREDIT_TTL_MS - retryInMs)
function staleSoonTimestamp(retryInMs: number): string {
  return new Date(Date.now() - CREDIT_TTL_MS + retryInMs).toISOString();
}

const RELEASE_TYPE_MAP: Record<string, string> = {
  Album: "album",
  EP: "ep",
  Single: "single",
  "Live performance": "live",
  Compilation: "compilation",
};

const PRODUCER_TYPES = new Set(["producer", "executive producer"]);
const SONGWRITER_TYPES = new Set(["lyricist", "composer", "writer"]);

export async function enrichAlbum(albumUuid: string): Promise<void> {
  const supabase = createSupabaseAdminClient();

  const { data: album } = await supabase
    .from("albums")
    .select("id, name, artist_id, mbid, credits_enriched_at, bio_enriched_at, bio")
    .eq("id", albumUuid)
    .single();

  if (!album) return;

  let needsCredits = isStale(album.credits_enriched_at as string | null, CREDIT_TTL_MS);
  const needsBio = isStale(album.bio_enriched_at as string | null, BIO_TTL_MS);

  // If previously stamped but no MBID was ever found, force a retry now —
  // we can now resolve Spotify IDs via search (Last.fm imports that weren't matched)
  if (!needsCredits && !album.mbid && album.credits_enriched_at) needsCredits = true;

  if (!needsCredits && !needsBio) return;

  // ── MBID resolution ───────────────────────────────────────────────────────
  let mbid = album.mbid as string | null;
  if (!mbid && needsCredits) {
    // resolveCanonicalAlbumSpotifyInWorker checks album_external_ids first,
    // then falls back to Spotify search + links the result — handles Last.fm imports
    const { resolveCanonicalAlbumSpotifyInWorker } = await import("@/lib/jobs/resolve-canonical-spotify");
    const spotifyId = await resolveCanonicalAlbumSpotifyInWorker(albumUuid);
    if (spotifyId) {
      mbid = await resolveAlbumMbid(spotifyId);
      if (mbid) await supabase.from("albums").update({ mbid }).eq("id", albumUuid);
    }
  }

  // ── Bio ────────────────────────────────────────────────────────────────────
  if (needsBio) {
    const { data: artistRow } = await supabase
      .from("artists")
      .select("name")
      .eq("id", album.artist_id)
      .single();

    const result = artistRow
      ? await fetchAlbumBioLastfm(artistRow.name as string, album.name as string)
      : null;

    await supabase.from("albums").update({
      bio: result?.bio ?? album.bio ?? null,
      bio_source: result?.source ?? null,
      bio_enriched_at: new Date().toISOString(),
    }).eq("id", albumUuid);
  }

  // ── Credits ────────────────────────────────────────────────────────────────
  if (!needsCredits) return;

  if (!mbid) {
    // No MBID found — retry in 7 days rather than blocking for a full year
    await supabase.from("albums")
      .update({ credits_enriched_at: staleSoonTimestamp(MBID_RETRY_TTL_MS) })
      .eq("id", albumUuid);
    return;
  }

  const mbRelease = await fetchMbRelease(mbid);
  if (!mbRelease) {
    await supabase.from("albums")
      .update({ credits_enriched_at: staleSoonTimestamp(MBID_RETRY_TTL_MS) })
      .eq("id", albumUuid);
    return;
  }

  // Release type
  const primaryType = mbRelease["release-group"]?.["primary-type"];
  const releaseType = primaryType ? (RELEASE_TYPE_MAP[primaryType] ?? "album") : null;

  // Label
  const labelInfo = mbRelease["label-info"]?.[0]?.label;
  if (labelInfo) {
    const labelId = await upsertLabel(supabase, labelInfo);
    const { error: labelErr } = await supabase
      .from("album_labels")
      .insert({ album_id: albumUuid, label_id: labelId });
    if (labelErr && labelErr.code !== "23505") {
      console.warn("[enrich-album] album_labels insert error", albumUuid, labelErr.message);
    }
  }

  // ── Credits: release-level relations ──────────────────────────────────────
  const seenProducers = new Set<string>();
  const seenSongwriters = new Set<string>();

  async function insertProducer(mbArtist: { id: string; name: string }) {
    if (seenProducers.has(mbArtist.id)) return;
    seenProducers.add(mbArtist.id);
    const artistId = await upsertCreditArtist(supabase, mbArtist, { isProducer: true });
    const { error } = await supabase.from("album_producers").insert({ album_id: albumUuid, artist_id: artistId });
    if (error && error.code !== "23505") console.warn("[enrich-album] album_producers insert error", error.message);
  }

  async function insertSongwriter(mbArtist: { id: string; name: string }) {
    if (seenSongwriters.has(mbArtist.id)) return;
    seenSongwriters.add(mbArtist.id);
    const artistId = await upsertCreditArtist(supabase, mbArtist, { isSongwriter: true });
    const { error } = await supabase.from("album_songwriters").insert({ album_id: albumUuid, artist_id: artistId });
    if (error && error.code !== "23505") console.warn("[enrich-album] album_songwriters insert error", error.message);
  }

  for (const rel of mbRelease.relations ?? []) {
    if (!rel.artist) continue;
    if (PRODUCER_TYPES.has(rel.type)) await insertProducer(rel.artist);
    else if (SONGWRITER_TYPES.has(rel.type)) await insertSongwriter(rel.artist);
  }

  // ── Credits: recording-level relations (per-track) ────────────────────────
  // recording-level-rels populates relations on each track's recording,
  // giving us producer/songwriter credits that are attached to individual songs.
  for (const medium of mbRelease.media ?? []) {
    for (const track of medium.tracks ?? []) {
      for (const rel of track.recording?.relations ?? []) {
        if (!rel.artist) continue;
        if (PRODUCER_TYPES.has(rel.type)) await insertProducer(rel.artist);
        else if (SONGWRITER_TYPES.has(rel.type)) await insertSongwriter(rel.artist);
      }
    }
  }

  await supabase.from("albums").update({
    release_type: releaseType,
    credits_enriched_at: new Date().toISOString(),
  }).eq("id", albumUuid);
}
