import { Skeleton } from "@/components/ui/skeleton";

/** Simple user row: avatar + name line. */
export function UserRowSkeleton() {
  return (
    <div className="flex items-center gap-3">
      <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
      <Skeleton className="h-4 w-32" />
    </div>
  );
}
