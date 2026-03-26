import { CommunityInvitesClient } from "@/app/communities/invites/invites-client";
import { listPendingInvitesForUser } from "@/lib/community/invites";
import { SkeletonBlock } from "@/components/ui/skeleton";

export function PendingInvitesSkeleton() {
  return (
    <div className="space-y-2" aria-hidden>
      <SkeletonBlock className="h-14 w-full rounded-lg" />
      <SkeletonBlock className="h-14 w-full rounded-lg" />
    </div>
  );
}

export async function PendingInvitesSection({ userId }: { userId: string }) {
  const invites = await listPendingInvitesForUser(userId);
  return <CommunityInvitesClient initialInvites={invites} />;
}
