import { PageLoadingSpinner } from "@/components/ui/loading-states";

/** Route-level fallback: spinner avoids heavy feed skeleton on fast navigations. */
export default function GlobalLoading() {
  return <PageLoadingSpinner title="Loading…" />;
}
