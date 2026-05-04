import { ProfileHeaderSkeleton } from "@/components/skeletons/profile-header-skeleton";
import { ProfileBelowFoldSkeleton } from "@/app/profile/[id]/profile-below-fold-skeleton";
import { sectionGap } from "@/lib/ui/surface";

export default function ProfileLoading() {
  return (
    <div className={sectionGap}>
      <ProfileHeaderSkeleton />
      <ProfileBelowFoldSkeleton />
    </div>
  );
}
