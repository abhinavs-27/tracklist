import { getRelatedMedia } from "@/lib/discovery/getRelatedMedia";
import { getOrFetchTracksBatch } from "@/lib/spotify-cache";
import { MediaGrid } from "@/components/media/MediaGrid";

export async function FansAlsoLikeSection({ songId }: { songId: string }) {
  const relatedSongsRaw = await getRelatedMedia("song", songId, 12).catch(
    (e) => {
      console.error("[song] getRelatedMedia failed:", e);
      return [];
    },
  );

  const relatedTrackIds = relatedSongsRaw.map((r) => r.contentId);
  const relatedTracks =
    relatedTrackIds.length > 0
      ? (await getOrFetchTracksBatch(relatedTrackIds)).filter(
          (t): t is SpotifyApi.TrackObjectFull => t != null,
        )
      : [];

  if (relatedTracks.length === 0) {
    return null;
  }

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
