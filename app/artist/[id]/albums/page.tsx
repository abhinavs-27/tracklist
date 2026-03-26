import { Suspense } from "react";
import { ArtistAlbumsPageContent } from "./artist-albums-page-content";
import Loading from "./loading";

type PageParams = Promise<{ id: string }>;

export default function ArtistAlbumsPage({
  params,
}: {
  params: PageParams;
}) {
  return (
    <Suspense fallback={<Loading />}>
      <ArtistAlbumsPageContent params={params} />
    </Suspense>
  );
}
