import Link from "next/link";
import { withArtistPagePhaseLog } from "@/lib/artist-page-load-log";
import { getListenLogsForArtist } from "@/lib/queries";
import { getOrFetchTracksBatch } from "@/lib/spotify-cache";
import { formatRelativeTime } from "@/lib/time";
import { firstSpotifyImageUrl } from "@/lib/spotify/best-image-url";

type RecentListensSectionProps = {
  artistId: string;
  viewerId?: string | null;
};

export async function RecentListensSection({ artistId, viewerId }: RecentListensSectionProps) {
  const recentListensRaw = await withArtistPagePhaseLog(
    "recentListens.getListenLogsForArtist",
    artistId,
    getListenLogsForArtist(artistId, 8, 0, viewerId),
    (rows) => ({ logCount: rows.length }),
  );

  if (recentListensRaw.length === 0) return null;

  const recentTrackIds = recentListensRaw.map((log) => log.track_id);
  const recentTracks = await withArtistPagePhaseLog(
    "recentListens.getOrFetchTracksBatch",
    artistId,
    getOrFetchTracksBatch(recentTrackIds, { allowNetwork: false }),
  );

  const trackMap = new Map(recentTracks.map((t, i) => [recentTrackIds[i], t]));
  const heading = viewerId ? "Friends listening" : "Recently played";

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-white">{heading}</h2>
      <ul className="space-y-2">
        {recentListensRaw.map((log) => {
          const track = trackMap.get(log.track_id);
          const albumArt = track ? firstSpotifyImageUrl(track.album?.images) : null;
          const trackName = track?.name ?? "Unknown track";
          const albumName = track?.album?.name ?? null;
          const albumId = track?.album?.id;
          const user = log.user;
          const username = user?.username ?? "Someone";

          return (
            <li key={log.id} className="flex items-center gap-3 rounded-2xl border border-zinc-800/60 bg-zinc-900/40 px-3 py-2.5 transition hover:bg-zinc-900/60">
              {/* Album art — left, prominent */}
              {albumArt && albumId ? (
                <Link href={`/album/${albumId}`} className="group shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={albumArt}
                    alt=""
                    className="h-11 w-11 rounded-lg object-cover ring-1 ring-white/[0.07] transition group-hover:ring-white/20"
                    loading="lazy"
                  />
                </Link>
              ) : (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-600 ring-1 ring-white/[0.06]">
                  ♪
                </div>
              )}

              {/* Track + user info */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">
                  <Link
                    href={albumId ? `/album/${albumId}` : `/song/${log.track_id}`}
                    className="hover:text-gold-400 hover:underline"
                  >
                    {trackName}
                  </Link>
                </p>
                {albumName && (
                  <p className="truncate text-xs text-zinc-500">{albumName}</p>
                )}
                <p className="mt-0.5 text-xs text-zinc-600">
                  <Link
                    href={user?.id ? `/profile/${user.id}` : "#"}
                    className="text-zinc-400 hover:text-white hover:underline"
                  >
                    {username}
                  </Link>
                  {" · "}
                  {formatRelativeTime(log.listened_at)}
                </p>
              </div>

              {/* User avatar — right */}
              <Link href={user?.id ? `/profile/${user.id}` : "#"} className="shrink-0">
                {user?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.avatar_url}
                    alt=""
                    className="h-7 w-7 rounded-full object-cover ring-1 ring-white/10"
                  />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-semibold text-zinc-400 ring-1 ring-white/10">
                    {username[0]?.toUpperCase() ?? "?"}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
