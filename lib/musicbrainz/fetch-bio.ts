import "server-only";
import { fetchLastfmApi } from "@/lib/lastfm/lastfm-api-fetch";
import { throttleLastfm } from "@/lib/lastfm/throttle";

const LASTFM_KEY = process.env.LASTFM_API_KEY ?? "";

function hasLastfmKey(): boolean {
  return !!process.env.LASTFM_API_KEY;
}

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

export async function fetchArtistBioLastfm(
  artistName: string,
): Promise<{ bio: string; source: "lastfm" } | null> {
  if (!hasLastfmKey()) return null;
  try {
    const url = `https://ws.audioscrobbler.com/2.0/?method=artist.getInfo&artist=${encodeURIComponent(artistName)}&api_key=${LASTFM_KEY}&format=json&autocorrect=1`;
    await throttleLastfm();
    const res = await fetchLastfmApi(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    const summary: string | undefined = data?.artist?.bio?.summary;
    if (!summary || summary.includes("This artist does not have")) return null;
    // Last.fm appends " <a href=...>Read more on Last.fm</a>" — strip it
    const clean = stripHtmlTags(summary)
      .replace(/Read more on Last\.fm\.?$/, "")
      .trim();
    if (clean.length < 20) return null;
    return { bio: clean, source: "lastfm" };
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[fetch-bio] fetchArtistBioLastfm failed", artistName, e);
    }
    return null;
  }
}

export async function fetchAlbumBioLastfm(
  artistName: string,
  albumName: string,
): Promise<{ bio: string; source: "lastfm" } | null> {
  if (!hasLastfmKey()) return null;
  try {
    const url = `https://ws.audioscrobbler.com/2.0/?method=album.getInfo&artist=${encodeURIComponent(artistName)}&album=${encodeURIComponent(albumName)}&api_key=${LASTFM_KEY}&format=json&autocorrect=1`;
    await throttleLastfm();
    const res = await fetchLastfmApi(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    const summary: string | undefined = data?.album?.wiki?.summary;
    if (!summary || summary.includes("does not have a wiki")) return null;
    const clean = stripHtmlTags(summary)
      .replace(/Read more on Last\.fm\.?$/, "")
      .trim();
    if (clean.length < 20) return null;
    return { bio: clean, source: "lastfm" };
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[fetch-bio] fetchAlbumBioLastfm failed", artistName, albumName, e);
    }
    return null;
  }
}

export async function fetchBioWikipedia(
  title: string,
): Promise<{ bio: string; source: "wikipedia" } | null> {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Tracklist/1.0 (singh.avi99@gmail.com)" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const extract: string | undefined = data?.extract;
    if (!extract || extract.length < 20) return null;
    return { bio: extract, source: "wikipedia" };
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[fetch-bio] fetchBioWikipedia failed", title, e);
    }
    return null;
  }
}
