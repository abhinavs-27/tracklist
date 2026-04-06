import type { TrendingEntity } from "@/types";
import { MediaGrid, type MediaItem } from "@/components/media/MediaGrid";
import { getChartConfig } from "@/lib/discovery/chartConfigs";

const TRENDING_MIN_LISTENS =
  getChartConfig("trending")?.filters?.min_listens_7d ?? 2;

function trackAlbumArtworkUrl(
  track: SpotifyApi.TrackObjectFull,
): string | null {
  const imgs = track.album?.images;
  if (!imgs?.length) return null;
  return imgs.find((im) => im?.url?.trim())?.url?.trim() ?? null;
}

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
    artworkUrl: trackAlbumArtworkUrl(track),
    totalPlays: entity.listen_count,
  }));

  return (
    <section>
      <h2 className="mb-1 text-base font-semibold text-white sm:text-lg">
        {title} (last 7 days)
      </h2>
      <p className="mb-3 text-xs text-zinc-500">
        Ranked by total listens in the last 7 days. A track needs at least{" "}
        {TRENDING_MIN_LISTENS} listens in that period to show up here.
      </p>
      {mediaItems.length === 0 ? (
        <p className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-6 text-center text-zinc-500">
          No trending tracks in the last 7 days yet. Start logging listens to
          see what's hot.
        </p>
      ) : (
        <MediaGrid items={mediaItems} />
      )}
    </section>
  );
}
