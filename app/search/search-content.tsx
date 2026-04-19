import { SearchBar } from "@/components/search-bar";
import { ArtistCard } from "@/components/artist-card";
import { AlbumCard } from "@/components/album-card";
import { TrackCard } from "@/components/track-card";
import { searchSpotify } from "@/lib/spotify";
import type { SpotifySearchResponse } from "@/lib/spotify";

async function search(q: string): Promise<SpotifySearchResponse | null> {
  const query = q.trim();
  if (!query) return null;

  try {
    // Uses client-credentials flow under the hood with SPOTIFY_CLIENT_ID/SECRET
    // and caches the token in memory.
    return await searchSpotify(query, ["artist", "album", "track"], 10);
  } catch (err) {
    console.error("Spotify search error:", err);
    return null;
  }
}

export async function SearchPageContent({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const q = (searchParams.q ?? "").trim();
  const query = q;

  if (!query) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8">
        <SearchBar placeholder="Search artists, albums, tracks..." />
        <p className="mt-4 text-zinc-500">Enter a search term to find music.</p>
      </div>
    );
  }

  /** Links use Spotify ids; catalog rows are ensured on the destination entity page (not here — avoids N Spotify calls per search). */
  const result = await search(query);
  if (!result) {
    return (
      <div>
        <SearchBar defaultValue={query} placeholder="Search..." />
        <p className="mt-4 text-red-400">
          Search failed. Check Spotify credentials.
        </p>
      </div>
    );
  }

  const artists = result.artists?.items ?? [];
  const albums = result.albums?.items ?? [];
  const tracks = result.tracks?.items ?? [];

  return (
    <div className="space-y-8">
      <SearchBar defaultValue={query} placeholder="Search..." />

      {artists.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">Artists</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {artists.map((a: SpotifyApi.ArtistObjectFull) => (
              <ArtistCard key={a.id} artist={a} />
            ))}
          </div>
        </section>
      )}

      {albums.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">Albums</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {albums.map((a: SpotifyApi.AlbumObjectSimplified) => (
              <AlbumCard key={a.id} album={a} />
            ))}
          </div>
        </section>
      )}

      {tracks.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">Tracks</h2>
          <div className="space-y-2">
            {tracks.map((t: SpotifyApi.TrackObjectFull) => (
              <TrackCard key={t.id} track={t} showAlbum={true} />
            ))}
          </div>
        </section>
      )}

      {artists.length === 0 &&
        albums.length === 0 &&
        tracks.length === 0 && (
          <p className="text-zinc-500">No results for “{query}”.</p>
        )}
    </div>
  );
}
