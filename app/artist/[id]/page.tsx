import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import {
  upsertArtistFromSpotify,
  upsertAlbumFromSpotify,
  getOrFetchArtistTopTracks,
} from "@/lib/spotify-cache";
import { getValidSpotifyAccessToken, getUserArtist, getUserArtistAlbums } from "@/lib/spotify-user";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { ArtistCard } from "@/components/artist-card";
import { AlbumCard } from "@/components/album-card";
import { TrackCard } from "@/components/track-card";
import { LogCard } from "@/components/log-card";
import type { LogWithUser } from "@/types";

async function getLogsForSpotify(spotifyId: string): Promise<LogWithUser[]> {
  const base = process.env.NEXTAUTH_URL || "http://127.0.0.1:3000";
  const res = await fetch(
    `${base}/api/logs?spotify_id=${encodeURIComponent(spotifyId)}&limit=20`,
    {
      cache: "no-store",
    },
  );
  if (!res.ok) return [];
  return res.json();
}

type PageParams = Promise<{ id: string }>;

export default async function ArtistPage({ params }: { params: PageParams }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? null;

  let artist: SpotifyApi.ArtistObjectFull | null = null;
  let albums: SpotifyApi.PagingObject<SpotifyApi.AlbumObjectSimplified> = {
    items: [],
    total: 0,
    limit: 12,
    offset: 0,
    next: null,
    previous: null,
  };
  let topTracks: { tracks: SpotifyApi.TrackObjectFull[] } = { tracks: [] };

  const supabase = createSupabaseServerClient();

  // --- 1) Try cached artist from DB
  try {
    const { data: artistRow } = await supabase
      .from("artists")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (artistRow) {
      const a = artistRow as {
        id: string;
        name: string;
        image_url: string | null;
        genres: string[] | null;
      };
      artist = {
        id: a.id,
        name: a.name,
        images: a.image_url ? [{ url: a.image_url }] : undefined,
        genres: a.genres ?? undefined,
        followers: { total: 0 },
      };
    }
  } catch (e) {
    console.error("[artist-page] failed to load cached artist", e);
  }

  // --- 2) If user has Spotify connected, try fresh data via user token
  let accessToken: string | null = null;
  if (userId) {
    try {
      accessToken = await getValidSpotifyAccessToken(userId);
    } catch (e) {
      console.warn(
        "[artist-page] user has no valid Spotify token, falling back to cache",
        e,
      );
    }
  }

  if (accessToken) {
    // Artist metadata
    try {
      const freshArtist = await getUserArtist(accessToken, id);
      artist = freshArtist;
      await upsertArtistFromSpotify(supabase, freshArtist);
    } catch (e) {
      console.error("[artist-page] getUserArtist failed", e);
    }

    // Albums
    try {
      const freshAlbums = await getUserArtistAlbums(accessToken, id, 10);
      albums = freshAlbums;
      for (const a of freshAlbums.items ?? []) {
        try {
          await upsertAlbumFromSpotify(supabase, a);
        } catch (e) {
          console.error(
            "[artist-page] upsertAlbumFromSpotify failed for album",
            a.id,
            e,
          );
        }
      }
    } catch {
      console.warn("[artist-page] getUserArtistAlbums failed; using cached albums if available");
    }

  }

  // --- 3) Top tracks from logs (no Spotify dependency)
  try {
    topTracks = await getOrFetchArtistTopTracks(id, 10);
  } catch (e) {
    console.error("[artist-page] getOrFetchArtistTopTracks failed", e);
    topTracks = { tracks: [] };
  }

  // --- 4) If we still have gaps (no user or Spotify failed), fill from cache
  if (!artist) {
    try {
      const { data: artistRow } = await supabase
        .from("artists")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (artistRow) {
        const a = artistRow as {
          id: string;
          name: string;
          image_url: string | null;
          genres: string[] | null;
        };
        artist = {
          id: a.id,
          name: a.name,
          images: a.image_url ? [{ url: a.image_url }] : undefined,
          genres: a.genres ?? undefined,
          followers: { total: 0 },
        };
      }
    } catch (e) {
      console.error("[artist-page] second attempt cached artist failed", e);
    }
  }

  if (albums.items.length === 0) {
    try {
      const { data: albumRows } = await supabase
        .from("albums")
        .select("*")
        .eq("artist_id", id)
        .order("release_date", { ascending: false });
      const rows =
        (albumRows as
          | {
              id: string;
              name: string;
              artist_id: string;
              image_url: string | null;
              release_date: string | null;
            }[]
          | null)
        ?? [];
      albums = {
        items: rows.map((a) => ({
          id: a.id,
          name: a.name,
          artists: artist
            ? [{ id: artist.id, name: artist.name }]
            : [{ id: a.artist_id, name: "" }],
          images: a.image_url ? [{ url: a.image_url }] : undefined,
          release_date: a.release_date ?? undefined,
        })),
        total: rows.length,
        limit: 12,
        offset: 0,
        next: null,
        previous: null,
      };
    } catch (e) {
      console.error("[artist-page] cached albums fetch failed", e);
    }
  }

  if (!artist) {
    notFound();
  }

  const logs = await getLogsForSpotify(id);
  const image = artist.images?.[0]?.url;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
        <div className="h-48 w-48 shrink-0 overflow-hidden rounded-xl bg-zinc-800 sm:h-56 sm:w-56">
          {image ? (
            <img src={image} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-6xl text-zinc-600">
              ♪
            </div>
          )}
        </div>
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-white">{artist.name}</h1>
          {artist.genres?.length ? (
            <p className="mt-1 text-zinc-400">
              {artist.genres.slice(0, 5).join(" · ")}
            </p>
          ) : null}
          {artist.followers != null && (
            <p className="mt-1 text-sm text-zinc-500">
              {artist.followers.total.toLocaleString()} followers on Spotify
            </p>
          )}
        </div>
      </div>

      {topTracks.tracks?.length ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">
            Popular tracks
          </h2>
          <div className="space-y-2">
            {topTracks.tracks.slice(0, 10).map((t) => (
              <TrackCard key={t.id} track={t} showAlbum={true} />
            ))}
          </div>
        </section>
      ) : null}

      {albums.items?.length ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">Albums</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {albums.items.map((a) => (
              <AlbumCard key={a.id} album={a} />
            ))}
          </div>
        </section>
      ) : null}

      {logs.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">
            Community logs
          </h2>
          <p className="mb-2 text-sm text-zinc-500">
            Logs for this artist (albums/tracks).
          </p>
          <ul className="space-y-4">
            {logs.map((log) => (
              <li key={log.id}>
                <LogCard
                  log={log}
                  spotifyName={log.title ?? undefined}
                  showComments={true}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
