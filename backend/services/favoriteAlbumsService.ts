import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "../lib/supabase";
import { getAlbums } from "../lib/spotify";

export type FavoriteAlbumRow = {
  album_id: string;
  position: number;
  name: string;
  image_url: string | null;
  artist_name: string;
};

async function upsertArtistAndAlbum(
  supabase: SupabaseClient,
  album: SpotifyApi.AlbumObjectFull,
) {
  const first = album.artists?.[0];
  if (!first) return;
  const now = new Date().toISOString();
  await supabase.from("artists").upsert(
    {
      id: first.id,
      name: first.name,
      updated_at: now,
    },
    { onConflict: "id" },
  );
  await supabase.from("albums").upsert(
    {
      id: album.id,
      name: album.name,
      artist_id: first.id,
      image_url: album.images?.[0]?.url ?? null,
      release_date: album.release_date ?? null,
      total_tracks: album.total_tracks ?? null,
      updated_at: now,
      cached_at: now,
    },
    { onConflict: "id" },
  );
}

/**
 * Favorite albums for profile (same data as web `getUserFavoriteAlbums`).
 */
export async function getFavoriteAlbumsForUser(
  userId: string,
): Promise<FavoriteAlbumRow[]> {
  const supabase = getSupabase();

  const { data: rows, error } = await supabase
    .from("user_favorite_albums")
    .select("album_id, position")
    .eq("user_id", userId)
    .order("position", { ascending: true });

  if (error || !rows?.length) return [];

  const albumIds = rows.map((r) => r.album_id as string);

  const { data: albums, error: albumsError } = await supabase
    .from("albums")
    .select("id, name, image_url, artist_id")
    .in("id", albumIds);

  if (albumsError) {
    console.error("[favoriteAlbums] albumsError", albumsError);
    return [];
  }

  const cached = new Map(
    (albums ?? []).map((a) => [
      a.id as string,
      {
        id: a.id as string,
        name: a.name as string,
        image_url: (a.image_url as string | null) ?? null,
        artist_id: a.artist_id as string,
      },
    ]),
  );

  const missingIds = albumIds.filter((id) => !cached.has(id));
  if (missingIds.length > 0) {
    try {
      const spotifyAlbums = await getAlbums(missingIds);
      for (const a of spotifyAlbums) {
        try {
          await upsertArtistAndAlbum(supabase, a);
          const first = a.artists?.[0];
          cached.set(a.id, {
            id: a.id,
            name: a.name,
            image_url: a.images?.[0]?.url ?? null,
            artist_id: first?.id ?? "",
          });
        } catch (e) {
          console.error("[favoriteAlbums] upsert album", a.id, e);
        }
      }
    } catch (e) {
      console.error("[favoriteAlbums] getAlbums", e);
    }
  }

  const artistIds = [
    ...new Set(
      [...cached.values()]
        .map((a) => a.artist_id)
        .filter(Boolean),
    ),
  ];
  const { data: artists } = await supabase
    .from("artists")
    .select("id, name")
    .in("id", artistIds);
  const artistName = new Map(
    (artists ?? []).map((x) => [x.id as string, x.name as string]),
  );

  return rows
    .map((r) => {
      const aid = r.album_id as string;
      const album = cached.get(aid);
      if (!album) return null;
      const an = artistName.get(album.artist_id) ?? "";
      return {
        album_id: aid,
        position: Number(r.position) || 0,
        name: album.name,
        image_url: album.image_url,
        artist_name: an,
      };
    })
    .filter((x): x is FavoriteAlbumRow => x != null);
}
