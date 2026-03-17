import type { HiddenGem } from "@/lib/queries";
import { getChartConfig } from "@/lib/discovery/chartConfigs";
import { MediaGrid, type MediaItem } from "@/components/media/MediaGrid";

type HiddenGemsSectionProps = {
  items: {
    gem: HiddenGem;
    album?: SpotifyApi.AlbumObjectSimplified | null;
    track?: SpotifyApi.TrackObjectSimplified | SpotifyApi.TrackObjectFull | null;
  }[];
};

export function HiddenGemsSection({ items }: HiddenGemsSectionProps) {
  const valid = items.filter((x) => x.album != null || x.track != null);
  const config = getChartConfig("hidden_gems");
  const title = config?.label ?? "Hidden gems";

  const mediaItems: MediaItem[] = valid.slice(0, 20).map(({ gem, album, track }) => {
    if (album) {
      const artworkUrl: string | null =
        Array.isArray(album.images) && album.images.length > 0
          ? album.images[0]!.url
          : null;
      return {
        id: album.id,
        type: "album" as const,
        title: album.name,
        artist: album.artists?.map((a) => a.name).join(", ") ?? "",
        artworkUrl,
        avgRating: gem.avg_rating,
        totalPlays: gem.listen_count,
      };
    }
    const t = track!;
    const artworkUrl: string | null =
      "album" in t &&
      t.album &&
      Array.isArray(t.album.images) &&
      t.album.images.length > 0
        ? t.album.images[0]!.url
        : null;
    return {
      id: t.id,
      type: "song" as const,
      title: t.name,
      artist: t.artists?.map((a) => a.name).join(", ") ?? "",
      artworkUrl,
      avgRating: gem.avg_rating,
      totalPlays: gem.listen_count,
    };
  });

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-white">{title}</h2>
      <p className="mb-3 text-sm text-zinc-500">
        Highly rated with fewer listens
      </p>
      {mediaItems.length === 0 ? (
        <p className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-6 text-center text-zinc-500">
          No hidden gems yet. Rate albums and songs to surface under-the-radar picks.
        </p>
      ) : (
        <MediaGrid items={mediaItems} />
      )}
    </section>
  );
}
