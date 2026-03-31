"use client";

import { useEffect, useRef, useState } from "react";
import type {
  TopWeekAlbum,
  TopWeekArtist,
  TopWeekTrack,
} from "@/lib/profile/top-this-week";
import {
  strip,
  TopWeekArtistCard,
  TopWeekTrackCard,
} from "@/components/profile/top-this-week-cards";

type Payload = {
  tracks: TopWeekTrack[];
  artists: TopWeekArtist[];
  albums: TopWeekAlbum[];
};

type CatalogPatchJson = {
  artists?: { id: string; name: string | null; imageUrl: string | null }[];
  tracks?: {
    id: string;
    name: string | null;
    artistName: string | null;
    albumId: string | null;
    albumImageUrl: string | null;
  }[];
  albums?: {
    id: string;
    name: string | null;
    artistName: string | null;
    imageUrl: string | null;
  }[];
};

const catalogInflight = new Map<string, Promise<CatalogPatchJson>>();

function catalogRequestKey(
  artistIds: string[],
  trackIds: string[],
  albumIds: string[],
): string {
  return JSON.stringify({
    a: [...artistIds].sort(),
    t: [...trackIds].sort(),
    l: [...albumIds].sort(),
  });
}

function fetchTopWeekCatalogDeduped(
  artistIds: string[],
  trackIds: string[],
  albumIds: string[],
): Promise<CatalogPatchJson> {
  const key = catalogRequestKey(artistIds, trackIds, albumIds);
  let p = catalogInflight.get(key);
  if (!p) {
    p = (async () => {
      try {
        const res = await fetch("/api/profile/top-week-catalog", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ artistIds, trackIds, albumIds }),
        });
        if (!res.ok) return {};
        return (await res.json()) as CatalogPatchJson;
      } catch {
        return {};
      }
    })().finally(() => {
      catalogInflight.delete(key);
    });
    catalogInflight.set(key, p);
  }
  return p;
}

export function TopThisWeekInteractive({ payload }: { payload: Payload }) {
  const initialRef = useRef(payload);
  const [tracks, setTracks] = useState(payload.tracks);
  const [artists, setArtists] = useState(payload.artists);
  const [albums, setAlbums] = useState(payload.albums);

  useEffect(() => {
    const p = initialRef.current;
    const artistIds = p.artists
      .filter((a) => !a.imageUrl?.trim())
      .map((a) => a.artistId);
    const trackIds = p.tracks
      .filter((t) => !t.albumImageUrl?.trim())
      .map((t) => t.trackId);
    const albumIds = p.albums
      .filter((a) => !a.imageUrl?.trim())
      .map((a) => a.albumId);

    if (
      artistIds.length === 0 &&
      trackIds.length === 0 &&
      albumIds.length === 0
    ) {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const json = await fetchTopWeekCatalogDeduped(
          artistIds,
          trackIds,
          albumIds,
        );
        if (cancelled) return;

        const aMap = new Map((json.artists ?? []).map((x) => [x.id, x]));
        const tMap = new Map((json.tracks ?? []).map((x) => [x.id, x]));
        const alMap = new Map((json.albums ?? []).map((x) => [x.id, x]));

        if (cancelled) return;
        setArtists((prev) =>
          prev.map((a) => {
            const patch = aMap.get(a.artistId);
            if (!patch) return a;
            return {
              ...a,
              name: patch.name?.trim() || a.name,
              imageUrl: patch.imageUrl?.trim() || a.imageUrl,
            };
          }),
        );
        setTracks((prev) =>
          prev.map((t) => {
            const patch = tMap.get(t.trackId);
            if (!patch) return t;
            return {
              ...t,
              name: patch.name?.trim() || t.name,
              artistName: patch.artistName?.trim() || t.artistName,
              albumId: patch.albumId?.trim() || t.albumId,
              albumImageUrl: patch.albumImageUrl?.trim() || t.albumImageUrl,
            };
          }),
        );
        setAlbums((prev) =>
          prev.map((a) => {
            const patch = alMap.get(a.albumId);
            if (!patch) return a;
            return {
              ...a,
              name: patch.name?.trim() || a.name,
              artistName: patch.artistName?.trim() || a.artistName,
              imageUrl: patch.imageUrl?.trim() || a.imageUrl,
            };
          }),
        );
      } catch {
        /* keep placeholders */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-8">
      {tracks.length > 0 ? (
        <div>
          <h3 className="mb-3 text-sm font-semibold tracking-tight text-zinc-200">
            Top tracks
          </h3>
          <div className={strip}>
            {tracks.map((t) => (
              <TopWeekTrackCard
                key={t.trackId}
                name={t.name}
                artistName={t.artistName}
                imageUrl={t.albumImageUrl}
                playCount={t.playCount}
                href={`/album/${t.albumId}`}
              />
            ))}
          </div>
        </div>
      ) : null}

      {artists.length > 0 ? (
        <div>
          <h3 className="mb-3 text-sm font-semibold tracking-tight text-zinc-200">
            Top artists
          </h3>
          <div className={strip}>
            {artists.map((a) => (
              <TopWeekArtistCard
                key={a.artistId}
                name={a.name}
                imageUrl={a.imageUrl}
                playCount={a.playCount}
                href={`/artist/${a.artistId}`}
              />
            ))}
          </div>
        </div>
      ) : null}

      {albums.length > 0 ? (
        <div>
          <h3 className="mb-3 text-sm font-semibold tracking-tight text-zinc-200">
            Top albums
          </h3>
          <div className={strip}>
            {albums.map((a) => (
              <TopWeekTrackCard
                key={a.albumId}
                name={a.name}
                artistName={a.artistName}
                imageUrl={a.imageUrl}
                playCount={a.playCount}
                href={`/album/${a.albumId}`}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
