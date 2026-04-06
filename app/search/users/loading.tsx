import { contentMax2xl } from "@/lib/ui/layout";
import { SkeletonBlock } from "@/components/ui/skeleton";
import { UserSearchListSkeleton } from "@/components/skeletons/user-row-skeleton";

export default function FindUsersLoading() {
  return (
    <div className={`${contentMax2xl} animate-fade-in-up`}>
      <SkeletonBlock className="mb-3 h-10 w-64 max-w-full rounded-lg" />
      <SkeletonBlock className="mb-10 h-5 w-full max-w-md rounded-md" />
      <UserSearchListSkeleton count={6} />
    </div>
  );
}
