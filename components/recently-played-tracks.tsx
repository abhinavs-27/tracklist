"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

const PROFILE_LIMIT = 10;

type RecentTrack = {
  track_id: string;
  track_name: string;
  artist_name: string;
  album_name: string | null;
  album_image: string | null;
  played_at: string;
};

type ApiResponse = { items: RecentTrack[]; hasMore?: boolean };

type RecentlyPlayedTracksProps = {
  /** Parent provides section title */
  embedded?: boolean;
  /** Horizontal cards on profile hub */
  layout?: "list" | "strip";
};

export function RecentlyPlayedTracks({
  embedded = false,
  layout = "list",
}: RecentlyPlayedTracksProps) {
  const [items, setItems] = useState<RecentTrack[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/spotify/recently-played?limit=${PROFILE_LIMIT}&offset=0`, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error("Couldn’t load recent plays");
        return res.json() as Promise<ApiResponse>;
      })
      .then((data) => {
        if (!cancelled) {
          setItems(data.items ?? []);
          setHasMore(data.hasMore ?? false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Couldn’t load recent plays");
          setItems([]);
          setHasMore(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const shell = (body: ReactNode) => (
    <section
      className={
        embedded
          ? "pt-2"
          : "rounded-xl border border-zinc-800 bg-zinc-900/30 p-4"
      }
    >
      {body}
    </section>
  );

  if (error) {
    return shell(
      <>
        {embedded ? null : (
          <h2 className="text-lg font-semibold text-white">Recently played</h2>
        )}
        <p className={`text-sm text-zinc-500 ${embedded ? "" : "mt-2"}`}>{error}</p>
      </>,
    );
  }

  if (items === null) {
    return shell(
      <>
        {embedded ? (
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Tracks
          </p>
        ) : (
          <h2 className="text-lg font-semibold text-white">Recently played</h2>
        )}
        <div className="mt-3 h-32 animate-pulse rounded bg-zinc-800/50" />
      </>,
    );
  }

  if (items.length === 0) {
    return shell(
      <>
        {embedded ? null : (
          <h2 className="text-lg font-semibold text-white">Recently played</h2>
        )}
        <p className={`text-sm text-zinc-500 ${embedded ? "" : "mt-2"}`}>
          No recent listens yet. Log from search, Last.fm sync, or Spotify history when connected.
        </p>
      </>,
    );
  }

  const headerRow = (
    <div className="mb-3 flex items-center justify-between gap-3">
      {embedded ? (
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Tracks
        </p>
      ) : (
        <h2 className="text-lg font-semibold text-white">Recently played</h2>
      )}
      {(hasMore || items.length >= PROFILE_LIMIT) && (
        <Link
          href="/recently-played"
          className="text-xs font-medium text-emerald-400 hover:text-emerald-300 hover:underline"
        >
          View all
        </Link>
      )}
    </div>
  );

  if (layout === "strip") {
    return shell(
      <>
        {headerRow}
        <ul className="flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((t) => (
            <li
              key={`${t.track_id}-${t.played_at}`}
              className="w-[min(46vw,160px)] shrink-0 rounded-xl border border-zinc-800/50 bg-zinc-900/40 p-2"
            >
              <div className="flex flex-col gap-2">
                {t.album_image ? (
                  <img
                    src={t.album_image}
                    alt=""
                    className="aspect-square w-full rounded-lg object-cover"
                    width={160}
                    height={160}
                  />
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-zinc-800 text-2xl text-zinc-500">
                    ♪
                  </div>
                )}
                <div className="min-w-0 px-0.5">
                  <div className="line-clamp-2 text-xs font-medium leading-snug text-white">
                    {t.track_name}
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[11px] text-zinc-500">
                    {t.artist_name}
                  </div>
                  <time
                    className="mt-1 block text-[10px] text-zinc-600"
                    dateTime={t.played_at}
                  >
                    {new Date(t.played_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </time>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </>,
    );
  }

  return shell(
    <>
      {headerRow}
      <ul className="space-y-2">
        {items.map((t) => (
          <li
            key={`${t.track_id}-${t.played_at}`}
            className="flex items-center gap-3 rounded-lg border border-zinc-800/50 bg-zinc-900/30 p-2"
          >
            {t.album_image ? (
              <img
                src={t.album_image}
                alt=""
                className="h-10 w-10 shrink-0 rounded object-cover"
                width={40}
                height={40}
              />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-zinc-800 text-zinc-500">
                ♪
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-white">{t.track_name}</div>
              <div className="truncate text-xs text-zinc-500">
                {t.artist_name}
                {t.album_name ? ` · ${t.album_name}` : ""}
              </div>
            </div>
            <time className="shrink-0 text-xs text-zinc-500" dateTime={t.played_at}>
              {new Date(t.played_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </time>
          </li>
        ))}
      </ul>
    </>,
  );
}
