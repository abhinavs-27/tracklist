import type { TrendingEntity } from "@/types";
import { getChartConfig } from "@/lib/discovery/chartConfigs";
import { MediaGrid, type MediaItem } from "@/components/media/MediaGrid";

type TrendingSectionProps = {
  items: { entity: TrendingEntity; track: SpotifyApi.TrackObjectFull | null }[];
};

export function TrendingSection({ items }: TrendingSectionProps) {
  const valid = items.filter((x) => x.track != null) as {
    entity: TrendingEntity;
    track: SpotifyApi.TrackObjectFull;
  }[];
  const config = getChartConfig("trending");
  const title = config?.label ?? "Trending";

  const mediaItems: MediaItem[] = valid.slice(0, 20).map(({ entity, track }) => ({
    id: track.id,
    type: "song",
    title: track.name,
    artist: track.artists?.map((a) => a.name).join(", ") ?? "",
    artworkUrl: track.album?.images?.[0]?.url ?? null,
    totalPlays: entity.listen_count,
  }));

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-white">{title} (last 24h)</h2>
      {mediaItems.length === 0 ? (
        <p className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-6 text-center text-zinc-500">
          No trending tracks in the last 24 hours. Start logging listens to see what&apos;s hot.
        </p>
      ) : (
        <MediaGrid items={mediaItems} />
      )}
    </section>
  );
}
