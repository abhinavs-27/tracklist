import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { searchGenius, fetchGeniusSong } from "@tracklist/genius-client";
import { upsertCreditArtist } from "@/lib/musicbrainz/upsert-credit-artist";

export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s*\(feat\..*?\)/gi, "")
    .replace(/\s*\[feat\..*?\]/gi, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isTitleMatch(trackTitle: string, geniusTitle: string): boolean {
  const a = normalizeTitle(trackTitle);
  const b = normalizeTitle(geniusTitle);
  if (a === b) return true;
  // Only use substring matching when the shorter string is long enough to be
  // a reliable signal — prevents "god" from matching "gods plan"
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return shorter.length >= 6 && longer.includes(shorter);
}

export function isArtistMatch(trackArtist: string, geniusArtist: string): boolean {
  const a = trackArtist.toLowerCase().trim();
  const b = geniusArtist.toLowerCase().trim();
  return a.includes(b) || b.includes(a);
}

export async function enrichSongGenius(
  supabase: SupabaseClient,
  songUuid: string,
): Promise<boolean> {
  // Fetch track name and artist_id
  const { data: track } = await supabase
    .from("tracks")
    .select("name, artist_id, lastfm_artist_name")
    .eq("id", songUuid)
    .maybeSingle();

  if (!track) return false;

  const trackName = track.name as string;

  // Resolve artist name: try artists table first, fall back to lastfm_artist_name
  let artistName: string | null = null;
  if (track.artist_id) {
    const { data: artist } = await supabase
      .from("artists")
      .select("name")
      .eq("id", track.artist_id)
      .maybeSingle();
    if (artist) artistName = artist.name as string;
  }
  if (!artistName) artistName = (track.lastfm_artist_name as string | null) ?? null;

  const query = artistName ? `${trackName} ${artistName}` : trackName;

  // Search Genius
  const hits = await searchGenius(query);
  const songHits = hits.filter((h) => h.type === "song");

  // Find first hit that passes match verification
  const match = songHits.find((h) => {
    const titleOk = isTitleMatch(trackName, h.result.title);
    const artistOk = artistName ? isArtistMatch(artistName, h.result.primary_artist.name) : true;
    return titleOk && artistOk;
  });

  if (!match) return false;

  const song = await fetchGeniusSong(match.result.id);
  if (!song) return false;

  let foundCredits = false;

  for (const a of song.producer_artists ?? []) {
    const artistId = await upsertCreditArtist(supabase, { id: null, name: a.name }, { isProducer: true });
    const { error } = await supabase.from("song_producers").insert({ song_id: songUuid, artist_id: artistId });
    if (!error) foundCredits = true;
    else if (error.code !== "23505") console.warn("[enrich-song-genius] song_producers insert error", error.message);
  }

  for (const a of song.writer_artists ?? []) {
    const artistId = await upsertCreditArtist(supabase, { id: null, name: a.name }, { isSongwriter: true });
    const { error } = await supabase.from("song_songwriters").insert({ song_id: songUuid, artist_id: artistId });
    if (!error) foundCredits = true;
    else if (error.code !== "23505") console.warn("[enrich-song-genius] song_songwriters insert error", error.message);
  }

  for (const a of song.featured_artists ?? []) {
    const artistId = await upsertCreditArtist(supabase, { id: null, name: a.name }, {});
    const { error } = await supabase.from("track_featuring_artists").insert({ track_id: songUuid, artist_id: artistId });
    if (!error) foundCredits = true;
    else if (error.code !== "23505") console.warn("[enrich-song-genius] track_featuring_artists insert error", error.message);
  }

  return foundCredits;
}
