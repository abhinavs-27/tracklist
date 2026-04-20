import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { getOrFetchTrack } from "@/lib/spotify-cache";
import {
  GetOrCreateEntityError,
  getOrCreateEntity,
} from "@/lib/catalog/getOrCreateEntity";
import { redirectToCanonicalEntityIfNeeded } from "@/lib/catalog/redirect-to-canonical-entity-route";
import {
  isUUID,
  isValidSpotifyId,
  normalizeReviewEntityId,
} from "@/lib/validation";
import { SongPageContent } from "./song-page-content";
import SongIdLoading from "./loading";

type PageParams = Promise<{ id: string }>;

export default async function SongPage({ params }: { params: PageParams }) {
  const { id: rawId } = await params;
  /** Route params may arrive as `lfm%3A...`; DB + Spotify paths need `lfm:...`. */
  const id = normalizeReviewEntityId(rawId);

  console.log("[Song Resolve] incoming:", id);

  if (!isUUID(id) && isValidSpotifyId(id)) {
    let resolvedId: string;
    try {
      resolvedId = (
        await getOrCreateEntity({
          type: "track",
          spotifyId: id,
          allowNetwork: true,
        })
      ).id;
    } catch (e) {
      if (e instanceof GetOrCreateEntityError) notFound();
      throw e;
    }
    console.log("[Song Resolve] created/resolved:", resolvedId);
    redirect(`/song/${resolvedId}`);
  }

  /**
   * Session + track fetch before reviews/stats/related so `resolveCanonicalTrackUuidFromEntityId`
   * succeeds after catalog upsert (same race as album pages when parallel with getOrFetchTrack).
   * `allowNetwork: true` allows first-visit Spotify track URLs to hydrate the DB once.
   */
  let fetched: Awaited<ReturnType<typeof getOrFetchTrack>>;
  try {
    fetched = await getOrFetchTrack(id, { allowNetwork: true });
  } catch {
    notFound();
  }
  redirectToCanonicalEntityIfNeeded("song", id, fetched.canonicalTrackId);
  const entityId = fetched.canonicalTrackId ?? id;
  const track = fetched.track;

  return (
    <Suspense fallback={<SongIdLoading />}>
      <SongPageContent id={id} entityId={entityId} track={track} />
    </Suspense>
  );
}
