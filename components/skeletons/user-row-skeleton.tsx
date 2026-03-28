import { SkeletonAvatar, SkeletonBlock } from "@/components/ui/skeleton";
import { cardElevated } from "@/lib/ui/surface";

export function UserRowSkeleton() {
  return (
    <div className={`flex items-center gap-3 p-4 ${cardElevated}`}>
      <SkeletonAvatar size={40} />
      <div className="min-w-0 flex-1 space-y-2">
        <SkeletonBlock className="h-4 w-32 rounded-md" />
        <SkeletonBlock className="h-3 w-20 rounded-md" />
      </div>
    </div>
  );
}

export function UserSearchListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <ul className="m-0 list-none space-y-3 p-0" role="list">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i}>
          <UserRowSkeleton />
        </li>
      ))}
    </ul>
  );
}
