"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SpotifyConnectionCard } from "@/components/spotify-connection-card";

const PREVIEW_CAP = 8;
const ALBUM_FETCH = 10;
const TRACK_FETCH = 6;

type RecentAlbumItem = {
  album_id: string;
  album_name: string | null;
  artist_name: string;
  album_image: string | null;
  last_played_at: string;
};

type RecentTrack = {
  track_id: string;
  track_name: string;
  artist_name: string;
  album_name: string | null;
  album_image: string | null;
  played_at: string;
};

type ActivityRow =
  | {
      kind: "album";
      key: string;
      at: number;
      title: string;
      subtitle: string;
      image: string | null;
      href: string;
    }
  | {
      kind: "track";
      key: string;
      at: number;
      title: string;
      subtitle: string;
      image: string | null;
      href: string;
    };

function mergeActivity(
  albums: RecentAlbumItem[],
  tracks: RecentTrack[],
  isOwnProfile: boolean,
): ActivityRow[] {
  const albumRows: ActivityRow[] = albums.map((a) => ({
    kind: "album" as const,
    key: `album-${a.album_id}`,
    at: new Date(a.last_played_at).getTime(),
    title: a.album_name ?? "Unknown album",
    subtitle: a.artist_name || "—",
    image: a.album_image,
    href: `/album/${a.album_id}`,
  }));

  const trackRows: ActivityRow[] = isOwnProfile
    ? tracks.map((t) => ({
        kind: "track" as const,
        key: `track-${t.track_id}-${t.played_at}`,
        at: new Date(t.played_at).getTime(),
        title: t.track_name,
        subtitle: [t.artist_name, t.album_name].filter(Boolean).join(" · "),
        image: t.album_image,
        href: "/recently-played",
      }))
    : [];

  return [...albumRows, ...trackRows]
    .sort((a, b) => b.at - a.at)
    .slice(0, PREVIEW_CAP);
}

export function ProfileRecentActivity({
  userId,
  isOwnProfile,
  showSpotifyControls,
  spotifyConnected,
}: {
  userId: string;
  isOwnProfile: boolean;
  showSpotifyControls: boolean;
  spotifyConnected: boolean;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [albums, setAlbums] = useState<RecentAlbumItem[] | null>(null);
  const [tracks, setTracks] = useState<RecentTrack[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(
      `/api/recent-albums?user_id=${encodeURIComponent(userId)}&limit=${ALBUM_FETCH}`,
      { cache: "no-store" },
    )
      .then((res) => {
        if (!res.ok) throw new Error(`Albums (${res.status})`);
        return res.json() as Promise<{ albums: RecentAlbumItem[] }>;
      })
      .then((data) => {
        if (!cancelled) setAlbums(data.albums ?? []);
      })
      .catch((e) => {
        if (!cancelled) {
          console.error("[recent-activity] albums:", e);
          setAlbums([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId, refreshKey]);

  useEffect(() => {
    if (!isOwnProfile) {
      setTracks([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/spotify/recently-played?limit=${TRACK_FETCH}&offset=0`, {
      cache: "no-store",
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Tracks (${res.status})`);
        return res.json() as Promise<{ items: RecentTrack[] }>;
      })
      .then((data) => {
        if (!cancelled) setTracks(data.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setTracks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOwnProfile, refreshKey]);

  const rows = useMemo(() => {
    if (albums === null || tracks === null) return null;
    return mergeActivity(albums, tracks, isOwnProfile);
  }, [albums, tracks, isOwnProfile]);

  const loading = albums === null || tracks === null;
  const hasAny = rows && rows.length > 0;

  return (
    <div className="space-y-5">
      {showSpotifyControls ? (
        <SpotifyConnectionCard
          userId={userId}
          spotifyConnected={spotifyConnected}
          onSynced={() => setRefreshKey((k) => k + 1)}
        />
      ) : null}

      {loading ? (
        <ul className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <li
              key={i}
              className="flex animate-pulse gap-3 rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3"
            >
              <div className="h-14 w-14 shrink-0 rounded-lg bg-zinc-800/80" />
              <div className="min-w-0 flex-1 space-y-2 pt-0.5">
                <div className="h-4 w-3/4 rounded bg-zinc-800/80" />
                <div className="h-3 w-1/2 rounded bg-zinc-800/70" />
              </div>
            </li>
          ))}
        </ul>
      ) : !hasAny ? (
        <p className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-3 text-sm text-zinc-500">
          No recent activity yet. Log listens, sync Last.fm, or connect Spotify to
          see albums and tracks here.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.key}>
              <Link
                href={row.href}
                className="flex min-h-[56px] gap-3 rounded-xl border border-zinc-800/85 bg-zinc-950/50 p-3 transition hover:border-zinc-600/90 hover:bg-zinc-900/55"
              >
                {row.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.image}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-lg object-cover"
                    width={56}
                    height={56}
                  />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-lg text-zinc-600">
                    ♪
                  </div>
                )}
                <div className="min-w-0 flex-1 py-0.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 text-sm font-medium leading-snug text-white">
                      {row.title}
                    </p>
                    <span className="shrink-0 rounded-md bg-zinc-800/80 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                      {row.kind === "album" ? "Album" : "Track"}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">
                    {row.subtitle}
                  </p>
                  <time
                    className="mt-1 block text-[11px] text-zinc-600"
                    dateTime={new Date(row.at).toISOString()}
                  >
                    {new Date(row.at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {isOwnProfile ? (
        <div className="flex flex-col gap-2 border-t border-zinc-800/80 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-zinc-500">
            Preview of recent albums (from logs) and Spotify plays when connected.
          </p>
          <Link
            href="/reports/listening"
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-emerald-500/35 bg-emerald-950/25 px-4 py-2.5 text-sm font-medium text-emerald-300 transition hover:bg-emerald-950/40"
          >
            View all activity
          </Link>
        </div>
      ) : null}
    </div>
  );
}
