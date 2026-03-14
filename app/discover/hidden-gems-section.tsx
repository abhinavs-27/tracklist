import { AlbumCard } from "@/components/album-card";
import { TrackCard } from "@/components/track-card";
import type { HiddenGem } from "@/lib/queries";

type HiddenGemsSectionProps = {
  items: {
    gem: HiddenGem;
    album?: SpotifyApi.AlbumObjectSimplified | null;
    track?: SpotifyApi.TrackObjectSimplified | SpotifyApi.TrackObjectFull | null;
  }[];
};

export function HiddenGemsSection({ items }: HiddenGemsSectionProps) {
  const valid = items.filter((x) => x.album != null || x.track != null);

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-white">Hidden gems</h2>
      <p className="mb-3 text-sm text-zinc-500">
        Highly rated with fewer listens
      </p>
      {valid.length === 0 ? (
        <p className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-6 text-center text-zinc-500">
          No hidden gems yet. Rate albums and songs to surface under-the-radar picks.
        </p>
      ) : (
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {valid.slice(0, 20).map(({ gem, album, track }) => (
          <li key={`${gem.entity_type}-${gem.entity_id}`}>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
              {album ? (
                <AlbumCard album={album} />
              ) : track ? (
                <TrackCard
                  track={track}
                  showAlbum={true}
                  songPageLink
                  showThumbnail={true}
                />
              ) : null}
              <p className="mt-2 text-xs text-zinc-500">
                ★ {gem.avg_rating.toFixed(1)} · {gem.listen_count} listen
                {gem.listen_count !== 1 ? "s" : ""}
              </p>
            </div>
          </li>
        ))}
      </ul>
      )}
    </section>
  );
}
