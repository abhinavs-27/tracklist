import { PageLoadingSpinner } from "@/components/ui/loading-states";

/** Route-level fallback for `/album` segment — spinner matches `[id]` loading. */
export default function AlbumLoading() {
  return <PageLoadingSpinner title="Loading…" />;
}
