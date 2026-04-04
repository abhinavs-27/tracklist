import { getListenLogsForArtist } from "@/lib/queries";
import { getOrFetchTracksBatch } from "@/lib/spotify-cache";
import { ListenCard } from "@/components/listen-card";

type RecentListensSectionProps = {
  artistId: string;
};

export async function RecentListensSection({ artistId }: RecentListensSectionProps) {
  const recentListensRaw = await getListenLogsForArtist(artistId, 10);

  if (recentListensRaw.length === 0) return null;

  const recentTrackIds = recentListensRaw.map((log) => log.track_id);
  const recentTracks = await getOrFetchTracksBatch(recentTrackIds);

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
