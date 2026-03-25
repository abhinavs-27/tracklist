import { SkeletonBlock } from "@/components/ui/skeleton";

export default function NewCommunityLoading() {
  return (
    <div className="mx-auto max-w-md space-y-6 px-4 py-8">
      <SkeletonBlock className="h-4 w-28" />
      <SkeletonBlock className="h-9 w-56" />
      <div className="space-y-4">
        <div>
          <SkeletonBlock className="mb-2 h-4 w-16" />
          <SkeletonBlock className="h-11 w-full rounded-lg" />
        </div>
        <div>
          <SkeletonBlock className="mb-2 h-4 w-36" />
          <SkeletonBlock className="h-24 w-full rounded-lg" />
        </div>
        <SkeletonBlock className="h-6 w-48" />
        <SkeletonBlock className="h-11 w-full rounded-lg" />
      </div>
    </div>
  );
}
