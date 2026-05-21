import type { TasteIdentity } from "@/lib/taste/types";
import { getTasteIdentity } from "@/lib/taste/taste-identity";
import type { TopThisWeekResult } from "@/lib/profile/top-this-week";
import { TasteIdentityDisplay } from "./taste-identity-display";

export async function TasteIdentitySection({
  userId,
  hubMode = false,
  isOwnProfile = false,
  initialData,
  weeklyListening = null,
  weeklyListeningHideInIdentity = false,
}: {
  userId: string;
  hubMode?: boolean;
  isOwnProfile?: boolean;
  initialData?: TasteIdentity;
  weeklyListening?: TopThisWeekResult | null;
  weeklyListeningHideInIdentity?: boolean;
}) {
  const data = initialData ?? (await getTasteIdentity(userId));
  return (
    <TasteIdentityDisplay
      data={data}
      hubMode={hubMode}
      isOwnProfile={isOwnProfile}
      weeklyListening={weeklyListening}
      weeklyListeningHideInIdentity={weeklyListeningHideInIdentity}
    />
  );
}
