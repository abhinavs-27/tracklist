import "server-only";
import { resolveAlbumMbid, fetchMbRelease } from "@tracklist/musicbrainz-client";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { upsertLabel } from "./upsert-label";
import { upsertCreditArtist } from "./upsert-credit-artist";
import { fetchAlbumBioLastfm } from "./fetch-bio";

const BIO_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const CREDIT_TTL_MS = 365 * 24 * 60 * 60 * 1000;

function isStale(ts: string | null, ttlMs: number): boolean {
  if (!ts) return true;
  return Date.now() - new Date(ts).getTime() > ttlMs;
}

const RELEASE_TYPE_MAP: Record<string, string> = {
  Album: "album",
  EP: "ep",
  Single: "single",
  "Live performance": "live",
  Compilation: "compilation",
};

export async function enrichAlbum(albumUuid: string): Promise<void> {
  const supabase = createSupabaseAdminClient();

  const { data: album } = await supabase
    .from("albums")
    .select("id, name, artist_id, mbid, credits_enriched_at, bio_enriched_at, bio")
    .eq("id", albumUuid)
    .single();

  if (!album) return;

  const needsCredits = isStale(album.credits_enriched_at as string | null, CREDIT_TTL_MS);
  const needsBio = isStale(album.bio_enriched_at as string | null, BIO_TTL_MS);

  if (!needsCredits && !needsBio) return;

  // Resolve MBID from Spotify external ID
  let mbid = album.mbid as string | null;
  if (!mbid && needsCredits) {
    const { data: extId } = await supabase
      .from("album_external_ids")
      .select("external_id")
      .eq("album_id", albumUuid)
      .eq("source", "spotify")
      .maybeSingle();

    if (extId?.external_id) {
      mbid = await resolveAlbumMbid(extId.external_id as string);
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
  if (!needsCredits || !mbid) {
    await supabase.from("albums").update({ credits_enriched_at: new Date().toISOString() }).eq("id", albumUuid);
    return;
  }

  const mbRelease = await fetchMbRelease(mbid);
  if (!mbRelease) {
    await supabase.from("albums").update({ credits_enriched_at: new Date().toISOString() }).eq("id", albumUuid);
    return;
  }

  // Release type
  const primaryType = mbRelease["release-group"]?.["primary-type"];
  const releaseType = primaryType ? (RELEASE_TYPE_MAP[primaryType] ?? "album") : null;

  // Label
  const labelInfo = mbRelease["label-info"]?.[0]?.label;
  if (labelInfo) {
    const labelId = await upsertLabel(supabase, labelInfo);
    // Insert and ignore duplicate constraint errors
    const { error: labelErr } = await supabase
      .from("album_labels")
      .insert({ album_id: albumUuid, label_id: labelId });
    if (labelErr && labelErr.code !== "23505") {
      console.warn("[enrich-album] album_labels insert error", albumUuid, labelErr.message);
    }
  }

  // Producer / songwriter relationships directly on the release
  const relations = mbRelease.relations ?? [];
  for (const rel of relations) {
    if (!rel.artist) continue;
    if (rel.type === "producer") {
      const artistId = await upsertCreditArtist(supabase, rel.artist, { isProducer: true });
      const { error } = await supabase.from("album_producers").insert({ album_id: albumUuid, artist_id: artistId });
      if (error && error.code !== "23505") {
        console.warn("[enrich-album] album_producers insert error", error.message);
      }
    }
    if (rel.type === "lyricist" || rel.type === "composer" || rel.type === "writer") {
      const artistId = await upsertCreditArtist(supabase, rel.artist, { isSongwriter: true });
      const { error } = await supabase.from("album_songwriters").insert({ album_id: albumUuid, artist_id: artistId });
      if (error && error.code !== "23505") {
        console.warn("[enrich-album] album_songwriters insert error", error.message);
      }
    }
  }

  await supabase.from("albums").update({
    release_type: releaseType,
    credits_enriched_at: new Date().toISOString(),
  }).eq("id", albumUuid);
}
