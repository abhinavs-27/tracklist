import { ScrollToTop } from "./scroll-to-top";
import { AlbumPageSkeleton } from "../album-page-skeleton";

export default function AlbumIdLoading() {
  return (
    <>
      <ScrollToTop />
      <AlbumPageSkeleton />
    </>
  );
}
