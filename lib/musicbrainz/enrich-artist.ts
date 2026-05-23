// lib/musicbrainz/enrich-artist.ts
import "server-only";
import {
  resolveArtistMbid,
  fetchMbArtist,
} from "@tracklist/musicbrainz-client";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { upsertLabel } from "./upsert-label";
import { upsertCreditArtist } from "./upsert-credit-artist";
import { fetchArtistBioLastfm, fetchBioWikipedia } from "./fetch-bio";

const BIO_TTL_MS = 90 * 24 * 60 * 60 * 1000;    // 90 days
const CREDIT_TTL_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

function isStale(ts: string | null, ttlMs: number): boolean {
  if (!ts) return true;
  return Date.now() - new Date(ts).getTime() > ttlMs;
}

// External link URL patterns → canonical key
const EXT_LINK_PATTERNS: Array<[RegExp, string]> = [
  [/wikipedia\.org\/wiki\/(.+)/, "wikipedia"],
  [/discogs\.com\/artist\//, "discogs"],
  [/allmusic\.com\/artist\//, "allmusic"],
  [/soundcloud\.com\//, "soundcloud"],
  [/facebook\.com\//, "facebook"],
  [/instagram\.com\//, "instagram"],
  [/twitter\.com\/|x\.com\//, "twitter"],
];

function parseExternalLinks(
  relations: Array<{ type: string; url?: { resource: string } }>,
): Record<string, string> {
  const links: Record<string, string> = {};
  for (const rel of relations) {
    if (!rel.url?.resource) continue;
    for (const [pattern, key] of EXT_LINK_PATTERNS) {
      if (pattern.test(rel.url.resource)) {
        links[key] = rel.url.resource;
        break;
      }
    }
  }
  return links;
}

export async function enrichArtist(artistUuid: string): Promise<void> {
  const supabase = createSupabaseAdminClient();

  // Fetch current artist to check TTLs and get name
  const { data: artist } = await supabase
    .from("artists")
    .select("id, name, mbid, credits_enriched_at, bio_enriched_at, bio")
    .eq("id", artistUuid)
    .single();

  if (!artist) return;

  const needsCredits = isStale(artist.credits_enriched_at as string | null, CREDIT_TTL_MS);
  const needsBio = isStale(artist.bio_enriched_at as string | null, BIO_TTL_MS);

  if (!needsCredits && !needsBio) return;

  // Resolve MBID if we don't have it
  let mbid = artist.mbid as string | null;
  if (!mbid && needsCredits) {
    // Get Spotify ID from artist_external_ids table
    const { data: extId } = await supabase
      .from("artist_external_ids")
      .select("external_id")
      .eq("artist_id", artistUuid)
      .eq("source", "spotify")
      .maybeSingle();

    if (extId?.external_id) {
      mbid = await resolveArtistMbid(extId.external_id as string);
      if (mbid) {
        await supabase.from("artists").update({ mbid }).eq("id", artistUuid);
      }
    }
  }

  // ── Bio ────────────────────────────────────────────────────────────────────
  if (needsBio) {
    const result =
      (await fetchArtistBioLastfm(artist.name as string)) ??
      (await fetchBioWikipedia(artist.name as string));

    await supabase
      .from("artists")
      .update({
        bio: result?.bio ?? artist.bio ?? null,
        bio_source: result?.source ?? null,
        bio_enriched_at: new Date().toISOString(),
      })
      .eq("id", artistUuid);
  }

  // ── Credits ────────────────────────────────────────────────────────────────
  if (!needsCredits) return;
  if (!mbid) {
    await supabase
      .from("artists")
      .update({ credits_enriched_at: new Date().toISOString() })
      .eq("id", artistUuid);
    return;
  }

  const mbArtist = await fetchMbArtist(mbid);
  if (!mbArtist) {
    await supabase
      .from("artists")
      .update({ credits_enriched_at: new Date().toISOString() })
      .eq("id", artistUuid);
    return;
  }

  const relations = mbArtist.relations ?? [];

  // Members: "member of band" where direction = "backward" means this person IS a member
  const memberRels = relations.filter(
    (r) => r.type === "member of band" && r.direction === "backward" && r.artist,
  );
  for (const rel of memberRels) {
    const memberUuid = await upsertCreditArtist(supabase, rel.artist!);
    await supabase.from("artist_members").upsert(
      {
        artist_id: artistUuid,
        member_artist_id: memberUuid,
        role: rel.attributes?.join(", ") ?? null,
        is_active: !rel.ended,
      },
      { onConflict: "artist_id,member_artist_id" },
    );
  }

  // Label relationships
  // artist_labels has partial unique indexes, not a single unique constraint,
  // so we insert and ignore duplicate key violations (code "23505").
  const labelRels = relations.filter((r) => r.type === "label" && r.label);
  for (const rel of labelRels) {
    const labelId = await upsertLabel(supabase, rel.label!);
    const startYear = rel.begin ? parseInt(rel.begin.slice(0, 4), 10) || null : null;
    const endYear = rel.end ? parseInt(rel.end.slice(0, 4), 10) || null : null;
    const { error } = await supabase.from("artist_labels").insert({
      artist_id: artistUuid,
      label_id: labelId,
      start_year: startYear,
      end_year: endYear,
      is_current: !rel.ended,
    });
    if (error && error.code !== "23505") {
      console.warn("[enrich-artist] artist_labels insert failed", artistUuid, labelId, error.message);
    }
  }

  // External links
  const urlRels = relations.filter((r) => r.url);
  const externalLinks = parseExternalLinks(urlRels as Array<{ type: string; url?: { resource: string } }>);

  await supabase
    .from("artists")
    .update({
      external_links: Object.keys(externalLinks).length ? externalLinks : null,
      credits_enriched_at: new Date().toISOString(),
    })
    .eq("id", artistUuid);
}
