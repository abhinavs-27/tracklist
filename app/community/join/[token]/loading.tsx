import { PageLoadingSpinner } from "@/components/ui/loading-states";

/** Invite join is a single form — spinner avoids layout-mismatch skeleton flash. */
export default function CommunityJoinLoading() {
  return <PageLoadingSpinner title="Loading invite…" />;
}
