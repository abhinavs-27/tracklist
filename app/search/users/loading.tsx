import { SkeletonBlock } from "@/components/ui/skeleton";
import { UserSearchListSkeleton } from "@/components/skeletons/user-row-skeleton";

export default function FindUsersLoading() {
  return (
    <div className="mx-auto max-w-2xl animate-fade-in-up px-2 sm:px-0">
      <SkeletonBlock className="mb-3 h-10 w-64 max-w-full rounded-lg" />
      <SkeletonBlock className="mb-10 h-5 w-full max-w-md rounded-md" />
      <UserSearchListSkeleton count={8} />
    </div>
  );
}
