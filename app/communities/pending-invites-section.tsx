import { CommunityInvitesClient } from "@/app/communities/invites/invites-client";
import { listPendingInvitesForUser } from "@/lib/community/invites";
import { SkeletonBlock } from "@/components/ui/skeleton";

export function PendingInvitesSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <SkeletonBlock className="h-16 w-full rounded-2xl" />
      <SkeletonBlock className="h-16 w-full rounded-2xl" />
    </div>
  );
}

export async function PendingInvitesSection({ userId }: { userId: string }) {
  const invites = await listPendingInvitesForUser(userId);
  return <CommunityInvitesClient initialInvites={invites} />;
}
