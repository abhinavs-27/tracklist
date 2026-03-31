"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SpotifyConnectionCard } from "@/components/spotify-connection-card";
import { cardElevatedInteractive } from "@/lib/ui/surface";

/** Preview length — keep the strip scannable (5–10). */
const PREVIEW_CAP = 8;
const ALBUM_FETCH = 12;
const TRACK_FETCH = 8;

const strip =
  "flex gap-3 overflow-x-auto pb-2 pl-0.5 pt-0.5 snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

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

type ProfileSummaryJson = {
  albums: RecentAlbumItem[];
  recent_tracks: RecentTrack[];
};

/** Dedupe concurrent profile-summary fetches (e.g. React Strict Mode double effect). */
const profileSummaryInflight = new Map<string, Promise<ProfileSummaryJson>>();

async function loadProfileSummary(
  userId: string,
  refresh: boolean,
): Promise<ProfileSummaryJson> {
  const key = `${userId}:${refresh ? "1" : "0"}`;
  let p = profileSummaryInflight.get(key);
  if (!p) {
    p = (async () => {
      const qs = new URLSearchParams({
        user_id: userId,
        albums_limit: String(ALBUM_FETCH),
        tracks_limit: String(TRACK_FETCH),
      });
      if (refresh) qs.set("refresh", "1");
      const res = await fetch(`/api/profile-summary?${qs.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Couldn’t load profile activity");
      return (await res.json()) as ProfileSummaryJson;
    })().finally(() => {
      profileSummaryInflight.delete(key);
    });
    profileSummaryInflight.set(key, p);
  }
  return p;
}

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

function ActivityCard({ row }: { row: ActivityRow }) {
  return (
    <Link
      href={row.href}
      className={`${cardElevatedInteractive} flex w-[min(68vw,200px)] shrink-0 snap-start flex-col overflow-hidden sm:w-[188px]`}
    >
      <div className="aspect-square w-full bg-zinc-800">
        {row.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.image}
            alt=""
            className="h-full w-full object-cover"
            width={200}
            height={200}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl text-zinc-600">
            ♪
          </div>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-3 pt-2.5">
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug text-white">
            {row.title}
          </p>
          <span className="shrink-0 rounded-md bg-zinc-800/90 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
            {row.kind === "album" ? "Album" : "Play"}
          </span>
        </div>
        <p className="line-clamp-2 text-xs text-zinc-500">{row.subtitle}</p>
        <time
          className="mt-auto text-[11px] text-zinc-600"
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
  );
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
    const bust = refreshKey > 0;
    void loadProfileSummary(userId, bust)
      .then((data) => {
        if (cancelled) return;
        setAlbums(data.albums ?? []);
        setTracks(isOwnProfile ? (data.recent_tracks ?? []) : []);
      })
      .catch((e) => {
        if (!cancelled) {
          console.error("[recent-activity] profile-summary:", e);
          setAlbums([]);
          setTracks(isOwnProfile ? [] : []);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId, refreshKey, isOwnProfile]);

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
        <div className={strip}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className={`${cardElevatedInteractive} flex w-[min(68vw,200px)] shrink-0 snap-start flex-col overflow-hidden animate-pulse sm:w-[188px]`}
            >
              <div className="aspect-square w-full bg-zinc-800/80" />
              <div className="space-y-2 p-3">
                <div className="h-4 w-[85%] rounded bg-zinc-800/80" />
                <div className="h-3 w-[60%] rounded bg-zinc-800/70" />
                <div className="h-3 w-[35%] rounded bg-zinc-800/60" />
              </div>
            </div>
          ))}
        </div>
      ) : !hasAny ? (
        <p className="rounded-2xl border border-zinc-800/90 bg-zinc-950/40 px-4 py-4 text-sm text-zinc-500 ring-1 ring-inset ring-white/[0.05]">
          No recent activity yet. Log listens, sync Last.fm, or connect Spotify to
          see albums and plays here.
        </p>
      ) : (
        <div className={strip}>
          {rows.map((row) => (
            <ActivityCard key={row.key} row={row} />
          ))}
        </div>
      )}

      {isOwnProfile && hasAny ? (
        <p className="text-xs text-zinc-600">
          Showing up to {PREVIEW_CAP} items, newest first. Albums come from your
          logs; plays from Spotify when connected.
        </p>
      ) : null}
    </div>
  );
}
