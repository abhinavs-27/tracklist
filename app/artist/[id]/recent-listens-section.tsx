import { withArtistPagePhaseLog } from "@/lib/artist-page-load-log";
import { getListenLogsForArtist } from "@/lib/queries";
import { getOrFetchTracksBatch } from "@/lib/spotify-cache";
import { ListenCard } from "@/components/listen-card";

type RecentListensSectionProps = {
  artistId: string;
};

export async function RecentListensSection({ artistId }: RecentListensSectionProps) {
  const recentListensRaw = await withArtistPagePhaseLog(
    "recentListens.getListenLogsForArtist",
    artistId,
    getListenLogsForArtist(artistId, 10),
    (rows) => ({ logCount: rows.length }),
  );

  if (recentListensRaw.length === 0) return null;

  const recentTrackIds = recentListensRaw.map((log) => log.track_id);
  const recentTracks = await withArtistPagePhaseLog(
    "recentListens.getOrFetchTracksBatch",
    artistId,
    getOrFetchTracksBatch(recentTrackIds, { allowNetwork: false }),
    (tracks) => ({
      requested: recentTrackIds.length,
      resolvedNames: tracks.filter((t) => t?.name && t.name !== "Track").length,
    }),
  );

  const recentListens = recentListensRaw.map((log, i) => ({
    log,
    trackName: recentTracks[i]?.name ?? undefined,
  }));

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-white">
        Recent listens
      </h2>
      <ul className="space-y-2">
        {recentListens.map(({ log, trackName }) => (
          <li key={log.id}>
            <ListenCard log={log} trackName={trackName} />
          </li>
        ))}
      </ul>
    </section>
  );
}
