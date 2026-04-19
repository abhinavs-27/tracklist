import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import ArtistLoading from "./loading";
import { ArtistPageContent } from "./artist-page-content";
import {
  GetOrCreateEntityError,
  getOrCreateEntity,
} from "@/lib/catalog/getOrCreateEntity";
import {
  isUUID,
  isValidSpotifyId,
  normalizeReviewEntityId,
} from "@/lib/validation";

type PageParams = Promise<{ id: string }>;

/**
 * Sync shell so App Router can finish the route segment immediately; heavy work runs inside
 * Suspense (see artist-page-content). Spotify (non-UUID) ids are resolved here so we never
 * render the tree with a bare Spotify id in the URL segment.
 */
export default async function ArtistPage({ params }: { params: PageParams }) {
  const { id: rawId } = await params;
  const id = normalizeReviewEntityId(rawId);

  console.log("[Artist Resolve] incoming:", id);

  if (!isUUID(id) && isValidSpotifyId(id)) {
    let resolvedId: string;
    try {
      resolvedId = (
        await getOrCreateEntity({
          type: "artist",
          spotifyId: id,
          allowNetwork: true,
        })
      ).id;
    } catch (e) {
      if (e instanceof GetOrCreateEntityError) notFound();
      throw e;
    }
    console.log("[Artist Resolve] created/resolved:", resolvedId);
    redirect(`/artist/${resolvedId}`);
  }

  return (
    <Suspense fallback={<ArtistLoading />}>
      <ArtistPageContent params={params} />
    </Suspense>
  );
}
