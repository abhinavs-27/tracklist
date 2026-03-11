import { SearchBar } from "@/components/search-bar";
import { ArtistCard } from "@/components/artist-card";
import { AlbumCard } from "@/components/album-card";
import { TrackCard } from "@/components/track-card";

async function search(q: string) {
  const res = await fetch(
    `/api/search?q=${encodeURIComponent(q)}&type=artist,album,track&limit=20`,
    { cache: "no-store" },
  );

  if (!res.ok) {
    // Best-effort surface of error without leaking internals.
    return null;
  }

  return res.json();
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
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {artists.map((a: SpotifyApi.ArtistObjectFull) => (
              <ArtistCard key={a.id} artist={a} />
            ))}
          </div>
        </section>
      )}

      {albums.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">Albums</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
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

      {artists.length === 0 && albums.length === 0 && tracks.length === 0 && (
        <p className="text-zinc-500">No results for “{query}”.</p>
      )}
    </div>
  );
}
