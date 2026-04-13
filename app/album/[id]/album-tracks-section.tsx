import { TrackCard } from "@/components/track-card";
import { AlbumLogButton } from "@/app/album/[id]/album-log-button";
import { getTrackStatsForTrackIds } from "@/lib/queries";
import { sectionTitle } from "@/lib/ui/surface";
import { useReviews } from "@/lib/hooks/use-reviews";

function formatDuration(ms: number | undefined) {
  if (!ms) return null;
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function TrackStatsLine({
  listen_count,
  review_count,
  average_rating,
}: {
  listen_count: number;
  review_count: number;
  average_rating: number | null;
}) {
  const hasAny = listen_count > 0 || review_count > 0;
  if (!hasAny) {
    return (
      <span className="text-xs text-zinc-600">No listens or reviews yet</span>
    );
  }
  const parts: string[] = [];
  if (listen_count > 0) parts.push(`${listen_count} listen${listen_count !== 1 ? "s" : ""}`);
  if (review_count > 0) parts.push(`${review_count} review${review_count !== 1 ? "s" : ""}`);
  if (average_rating != null) parts.push(`${average_rating.toFixed(1)}★`);
  return (
    <span className="text-xs text-zinc-500">
      {parts.join(" · ")}
    </span>
  );
}

/** Client component wrapper for song review reactivity. */
function TrackStatsWithReviews({
  trackId,
  serverStats,
}: {
  trackId: string;
  serverStats: { listen_count: number; review_count: number; average_rating: number | null };
}) {
  const { data } = useReviews("song", trackId);
  const review_count = data?.count ?? serverStats.review_count;
  const average_rating = data?.average_rating ?? serverStats.average_rating;
  return (
    <TrackStatsLine
      listen_count={serverStats.listen_count}
      review_count={review_count}
      average_rating={average_rating}
    />
  );
}

export async function AlbumTracksSection({
  tracks,
  session,
}: {
  tracks: SpotifyApi.PagingObject<SpotifyApi.TrackObjectSimplified>;
  session: boolean;
}) {
  const trackIds = tracks.items?.map((t) => t.id) ?? [];
  const trackStats = trackIds.length > 0 ? await getTrackStatsForTrackIds(trackIds) : {};

  return (
    <section>
      <h2 className={`mb-5 ${sectionTitle}`}>Tracks</h2>
      <div className="space-y-1">
        {tracks.items.map((t, i) => {
          const songStats = trackStats[t.id] ?? {
            listen_count: 0,
            review_count: 0,
            average_rating: null,
          };
          return (
            <div
              key={t.id}
              className="flex flex-col gap-1 rounded-lg py-1.5 transition-colors hover:bg-zinc-900/40 sm:py-2"
            >
              <div className="flex min-h-[48px] items-center gap-2 sm:gap-3">
                <span className="w-6 shrink-0 text-right text-xs text-zinc-600 tabular-nums">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <TrackCard track={t} showAlbum={false} songPageLink showThumbnail={false} />
                </div>
                <span className="shrink-0 text-xs tabular-nums text-zinc-600">
                  {formatDuration(t.duration_ms) ?? "—"}
                </span>
                {session && (
                  <AlbumLogButton
                    spotifyId={t.id}
                    type="song"
                    spotifyName={t.name}
                    className="shrink-0"
                  />
                )}
              </div>
              <div className="flex min-h-[1.25rem] items-center gap-3 pl-8 sm:pl-9">
                <TrackStatsWithReviews
                  trackId={t.id}
                  serverStats={songStats}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
