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

export interface CreditedWork {
  id: string;
  name: string;
  image_url: string | null;
  release_date: string | null;
  artist_name: string;
  roles: ("producer" | "songwriter")[];
  listen_count: number;
  average_rating: number | null;
}

export async function getArtistCreditedWorks(
  supabase: SupabaseClient,
  artistId: string,
  limit = 20,
): Promise<CreditedWork[]> {
  // Gather credits from all 4 tables: album-level and song-level (rolled up to albums)
  const [albumProducerRes, albumSongwriterRes, songProducerRes, songSongwriterRes] = await Promise.all([
    supabase.from("album_producers").select("album_id").eq("artist_id", artistId).limit(limit),
    supabase.from("album_songwriters").select("album_id").eq("artist_id", artistId).limit(limit),
    supabase.from("song_producers")
      .select("tracks!song_producers_song_id_fkey(album_id)")
      .eq("artist_id", artistId)
      .limit(limit * 5),
    supabase.from("song_songwriters")
      .select("tracks!song_songwriters_song_id_fkey(album_id)")
      .eq("artist_id", artistId)
      .limit(limit * 5),
  ]);

  const producerIds = new Set<string>();
  const songwriterIds = new Set<string>();

  for (const r of albumProducerRes.data ?? []) producerIds.add((r as any).album_id);
  for (const r of albumSongwriterRes.data ?? []) songwriterIds.add((r as any).album_id);
  for (const r of songProducerRes.data ?? []) {
    const id = (r as any).tracks?.album_id;
    if (id) producerIds.add(id);
  }
  for (const r of songSongwriterRes.data ?? []) {
    const id = (r as any).tracks?.album_id;
    if (id) songwriterIds.add(id);
  }

  const allIds = [...new Set([...producerIds, ...songwriterIds])];
  if (allIds.length === 0) return [];

  // Fetch album details and stats in parallel
  const [albumsRes, statsRes] = await Promise.all([
    supabase
      .from("albums")
      .select("id, name, image_url, release_date, artists!albums_artist_id_fkey1(name)")
      .in("id", allIds),
    supabase
      .from("album_stats")
      .select("album_id, listen_count, avg_rating")
      .in("album_id", allIds),
  ]);

  const statsMap = new Map<string, { listen_count: number; avg_rating: number | null }>();
  for (const s of statsRes.data ?? []) {
    statsMap.set((s as any).album_id, {
      listen_count: (s as any).listen_count ?? 0,
      avg_rating: (s as any).avg_rating ?? null,
    });
  }

  return (albumsRes.data ?? [])
    .map((a: any) => {
      const stats = statsMap.get(a.id) ?? { listen_count: 0, avg_rating: null };
      return {
        id: a.id,
        name: a.name,
        image_url: a.image_url ?? null,
        release_date: a.release_date ?? null,
        artist_name: a.artists?.name ?? "",
        listen_count: stats.listen_count,
        average_rating: stats.avg_rating,
        roles: [
          ...(producerIds.has(a.id) ? ["producer" as const] : []),
          ...(songwriterIds.has(a.id) ? ["songwriter" as const] : []),
        ] as ("producer" | "songwriter")[],
      };
    })
    .sort((a, b) => b.listen_count - a.listen_count || (b.release_date ?? "").localeCompare(a.release_date ?? ""))
    .slice(0, limit);
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

  const producers: CreditPerson[] = (producersResult.data ?? []).map((r: any) => r.artists).filter(Boolean);
  const songwriters: CreditPerson[] = (songwritersResult.data ?? []).map((r: any) => r.artists).filter(Boolean);
  const labels: LabelEntry[] = (labelsResult.data ?? []).map((r: any) => r.labels).filter(Boolean);

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
    producers: (producersResult.data ?? []).map((r: any) => r.artists).filter(Boolean) as CreditPerson[],
    songwriters: (songwritersResult.data ?? []).map((r: any) => r.artists).filter(Boolean) as CreditPerson[],
    featuring: (featResult.data ?? []).map((r: any) => r.artists).filter(Boolean) as CreditPerson[],
    samples: (samplesResult.data ?? []).map((r) => toSongRef(r, "tracks")).filter((x): x is SongRef => x !== null),
    sampledBy: (sampledByResult.data ?? []).map((r) => toSongRef(r, "tracks")).filter((x): x is SongRef => x !== null),
    covers: (coversResult.data ?? []).map((r) => toSongRef(r, "tracks")).filter((x): x is SongRef => x !== null),
  };
}
