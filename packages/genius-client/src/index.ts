import Bottleneck from "bottleneck";

const GENIUS_BASE = "https://api.genius.com";
const limiter = new Bottleneck({ minTime: 200, maxConcurrent: 1 });

export interface GeniusArtist {
  id: number;
  name: string;
}

export interface GeniusSong {
  id: number;
  title: string;
  primary_artist: GeniusArtist;
  producer_artists: GeniusArtist[];
  writer_artists: GeniusArtist[];
  featured_artists: GeniusArtist[];
}

export interface GeniusSearchHit {
  type: string;
  result: {
    id: number;
    title: string;
    primary_artist: GeniusArtist;
  };
}

async function geniusFetchOnce<T>(path: string): Promise<T | null> {
  const token = process.env.GENIUS_ACCESS_TOKEN;
  if (!token) return null;
  const url = `${GENIUS_BASE}${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Genius ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

const geniusFetchLimited = limiter.wrap(geniusFetchOnce) as <T>(path: string) => Promise<T | null>;

export async function searchGenius(q: string): Promise<GeniusSearchHit[]> {
  if (!process.env.GENIUS_ACCESS_TOKEN) return [];
  try {
    const data = await geniusFetchLimited<{ response: { hits: GeniusSearchHit[] } }>(
      `/search?q=${encodeURIComponent(q)}`,
    );
    return data?.response?.hits ?? [];
  } catch (err) {
    console.warn("[genius-client] searchGenius error:", (err as Error).message);
    return [];
  }
}

export async function fetchGeniusSong(id: number): Promise<GeniusSong | null> {
  if (!process.env.GENIUS_ACCESS_TOKEN) return null;
  try {
    const data = await geniusFetchLimited<{ response: { song: GeniusSong } }>(`/songs/${id}`);
    return data?.response?.song ?? null;
  } catch (err) {
    console.warn("[genius-client] fetchGeniusSong error:", (err as Error).message);
    return null;
  }
}
