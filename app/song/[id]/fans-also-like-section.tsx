import { getOrFetchTracksBatch } from "@/lib/spotify-cache";
import { MediaGrid } from "@/components/media/MediaGrid";
import { getRelatedMedia } from "@/lib/discovery/getRelatedMedia";

export async function FansAlsoLikeSection({
  songId,
  songName,
}: {
  songId: string;
  songName: string;
}) {
  const relatedSongsRaw = await getRelatedMedia("song", songId, 12);
  const relatedTrackIds = relatedSongsRaw.map((r) => r.contentId);

  if (relatedTrackIds.length === 0) return null;

  const relatedTracks = (await getOrFetchTracksBatch(relatedTrackIds)).filter(
    (t): t is SpotifyApi.TrackObjectFull => t != null,
  );

  if (relatedTracks.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-base font-semibold text-white sm:text-lg">
        Fans also like
      </h2>
      <p className="mb-3 text-sm text-zinc-400">
        Other songs listeners of this track also played
      </p>
      <MediaGrid
        items={relatedTracks.map((t) => ({
          id: t.id,
          type: "song",
          title: t.name,
          artist: t.artists?.map((a) => a.name).join(", ") ?? "",
          artworkUrl: t.album?.images?.[0]?.url ?? null,
        }))}
      />
    </section>
  );
}
