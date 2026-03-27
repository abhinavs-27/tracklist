import "server-only";

import { fetchLastfmApi } from "@/lib/lastfm/lastfm-api-fetch";

const LASTFM_API = "https://ws.audioscrobbler.com/2.0/";

const MIN_GAP_MS = 320;
let lastRequestAt = 0;

export type LastfmArtistInfo = {
  /** Normalized tag names (lowercase, trimmed, deduped, max 10). */
  tags: string[];
  listeners: number | null;
  playcount: number | null;
};

function parseCount(v: unknown): number | null {
  if (v == null) return null;
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string"
        ? Number.parseInt(v.replace(/,/g, ""), 10)
        : NaN;
  return Number.isFinite(n) ? n : null;
}

function normalizeTags(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    const s = t.trim().toLowerCase();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= 10) break;
  }
  return out;
}

function extractTagNames(tagBlock: unknown): string[] {
  if (tagBlock == null) return [];
  const tag = (tagBlock as { tag?: unknown }).tag;
  if (tag == null) return [];
  if (Array.isArray(tag)) {
    return tag
      .map((x) =>
        x && typeof x === "object" && "name" in x
          ? String((x as { name: string }).name)
          : "",
      )
      .filter(Boolean);
  }
  if (typeof tag === "object" && tag !== null && "name" in tag) {
    return [String((tag as { name: string }).name)];
  }
  return [];
}

async function throttleLastfm(): Promise<void> {
  const now = Date.now();
  const wait = lastRequestAt + MIN_GAP_MS - now;
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  lastRequestAt = Date.now();
}

/**
 * Fetches Last.fm artist tags (used as genres) via artist.getInfo.
 * Returns empty tags on missing API key, errors, or unknown artist.
 */
export async function getLastfmArtistGenres(
  artistName: string,
): Promise<LastfmArtistInfo> {
  const apiKey = process.env.LASTFM_API_KEY?.trim();
  if (!apiKey) {
    return { tags: [], listeners: null, playcount: null };
  }

  const name = artistName.trim();
  if (!name) {
    return { tags: [], listeners: null, playcount: null };
  }

  await throttleLastfm();

  const url = new URL(LASTFM_API);
  url.searchParams.set("method", "artist.getInfo");
  url.searchParams.set("artist", name);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("autocorrect", "1");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12_000);
  let res: Response;
  try {
    res = await fetchLastfmApi(url.toString(), {
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[lastfm] getLastfmArtistGenres fetch failed", name, e);
    }
    return { tags: [], listeners: null, playcount: null };
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[lastfm] getLastfmArtistGenres HTTP", res.status, name);
    }
    return { tags: [], listeners: null, playcount: null };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { tags: [], listeners: null, playcount: null };
  }

  const err = json as { error?: number; message?: string };
  if (typeof err.error === "number" && err.error !== 0) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[lastfm] artist.getInfo error",
        err.error,
        err.message,
        name,
      );
    }
    return { tags: [], listeners: null, playcount: null };
  }

  const artist = (json as { artist?: unknown }).artist;
  if (!artist || typeof artist !== "object") {
    return { tags: [], listeners: null, playcount: null };
  }

  const a = artist as {
    tags?: { tag?: unknown };
    stats?: { listeners?: unknown; playcount?: unknown };
  };

  const rawTags = extractTagNames(a.tags);
  const tags = normalizeTags(rawTags);

  const listeners = parseCount(a.stats?.listeners);
  const playcount = parseCount(a.stats?.playcount);

  return { tags, listeners, playcount };
}
