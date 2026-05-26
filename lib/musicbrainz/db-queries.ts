import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface CreditPerson {
  id: string;
  name: string;
  mbid: string | null;
  image_url?: string | null;
}

export interface LabelEntry {
  id: string;
  name: string;
  mbid: string | null;
}

export interface LabelHistoryEntry extends LabelEntry {
  start_year: number | null;
  end_year: number | null;
  is_current: boolean;
}

export interface MemberEntry {
  id: string;
  name: string;
  role: string | null;
  is_active: boolean;
}

export interface SongRef {
  id: string;
  name: string;
  artist_name: string;
  artist_id: string;
  album_image_url: string | null;
  release_year: number | null;
}

// ── Artist ─────────────────────────────────────────────────────────────────────

export async function getArtistInfoTabData(supabase: SupabaseClient, artistId: string) {
  const [membersResult, labelsResult] = await Promise.all([
    supabase
      .from("artist_members")
      .select("member_artist_id, role, is_active, artists!artist_members_member_artist_id_fkey(id, name)")
      .eq("artist_id", artistId),
    supabase
      .from("artist_labels")
      .select("start_year, end_year, is_current, labels(id, name, mbid)")
      .eq("artist_id", artistId)
      .order("start_year", { ascending: false, nullsFirst: true }),
  ]);

  const members: MemberEntry[] = (membersResult.data ?? []).map((r: any) => ({
    id: r.artists.id,
    name: r.artists.name,
    role: r.role,
    is_active: r.is_active,
  }));

  const labelHistory: LabelHistoryEntry[] = (labelsResult.data ?? []).map((r: any) => ({
    id: r.labels.id,
    name: r.labels.name,
    mbid: r.labels.mbid,
    start_year: r.start_year,
    end_year: r.end_year,
    is_current: r.is_current,
  }));

  return { members, labelHistory };
}

// ── Album ──────────────────────────────────────────────────────────────────────

export async function getAlbumInfoTabData(supabase: SupabaseClient, albumId: string) {
  const [producersResult, songwritersResult, labelsResult] = await Promise.all([
    supabase
      .from("album_producers")
      .select("artists(id, name, mbid, image_url)")
      .eq("album_id", albumId),
    supabase
      .from("album_songwriters")
      .select("artists(id, name, mbid, image_url)")
      .eq("album_id", albumId),
    supabase
      .from("album_labels")
      .select("labels(id, name, mbid)")
      .eq("album_id", albumId),
  ]);

  const producers: CreditPerson[] = (producersResult.data ?? []).map((r: any) => r.artists);
  const songwriters: CreditPerson[] = (songwritersResult.data ?? []).map((r: any) => r.artists);
  const labels: LabelEntry[] = (labelsResult.data ?? []).map((r: any) => r.labels);

  return { producers, songwriters, labels };
}

// ── Song ───────────────────────────────────────────────────────────────────────

export async function getSongInfoTabData(supabase: SupabaseClient, songId: string) {
  const [producersResult, songwritersResult, samplesResult, sampledByResult, coversResult, featResult] = await Promise.all([
    supabase.from("song_producers").select("artists(id, name, mbid, image_url)").eq("song_id", songId),
    supabase.from("song_songwriters").select("artists(id, name, mbid, image_url)").eq("song_id", songId),
    supabase.from("song_samples").select(`
      tracks!song_samples_sampled_song_id_fkey(id, name,
        artists(id, name),
        albums(release_date, image_url)
      )
    `).eq("song_id", songId).limit(10),
    supabase.from("song_samples").select(`
      tracks!song_samples_song_id_fkey(id, name,
        artists(id, name),
        albums(release_date, image_url)
      )
    `).eq("sampled_song_id", songId).limit(10),
    supabase.from("song_covers").select(`
      tracks!song_covers_original_song_id_fkey(id, name,
        artists(id, name),
        albums(release_date, image_url)
      )
    `).eq("song_id", songId).limit(10),
    supabase.from("track_featuring_artists").select("artists(id, name, mbid, image_url)").eq("track_id", songId),
  ]);

  function toSongRef(r: any, trackKey: string): SongRef | null {
    const t = r[trackKey];
    if (!t) return null;
    const releaseDate: string | null = t.albums?.release_date ?? null;
    return {
      id: t.id,
      name: t.name,
      artist_name: t.artists?.name ?? "",
      artist_id: t.artists?.id ?? "",
      album_image_url: t.albums?.image_url ?? null,
      release_year: releaseDate ? parseInt(releaseDate.slice(0, 4), 10) : null,
    };
  }

  return {
    producers: (producersResult.data ?? []).map((r: any) => r.artists) as CreditPerson[],
    songwriters: (songwritersResult.data ?? []).map((r: any) => r.artists) as CreditPerson[],
    featuring: (featResult.data ?? []).map((r: any) => r.artists) as CreditPerson[],
    samples: (samplesResult.data ?? []).map((r) => toSongRef(r, "tracks")).filter((x): x is SongRef => x !== null),
    sampledBy: (sampledByResult.data ?? []).map((r) => toSongRef(r, "tracks")).filter((x): x is SongRef => x !== null),
    covers: (coversResult.data ?? []).map((r) => toSongRef(r, "tracks")).filter((x): x is SongRef => x !== null),
  };
}
