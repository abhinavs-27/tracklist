import { Suspense } from "react";
import ArtistLoading from "./loading";
import { ArtistPageContent } from "./artist-page-content";

type PageParams = Promise<{ id: string }>;

/**
 * Sync shell so App Router can finish the route segment immediately; heavy work runs inside
 * Suspense (see artist-page-content). Otherwise `loading.tsx` stays up until *all* server awaits
 * complete — that work does not show as separate XHRs in DevTools (it's RSC / DB / Spotify).
 */
export default function ArtistPage({ params }: { params: PageParams }) {
  return (
    <Suspense fallback={<ArtistLoading />}>
      <ArtistPageContent params={params} />
    </Suspense>
  );
}
