import { ScrollToTop } from "./scroll-to-top";
import { PageLoadingSpinner } from "@/components/ui/loading-states";

export default function AlbumIdLoading() {
  return (
    <>
      <ScrollToTop />
      <PageLoadingSpinner title="Loading album…" />
    </>
  );
}
