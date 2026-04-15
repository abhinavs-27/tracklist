import { Suspense } from "react";
import { getSession } from "@/lib/auth";
import { BillboardDropSection } from "@/components/billboard-drop/billboard-drop-section";
import { HomeWelcomeOverlay } from "@/components/home-welcome-overlay";
import { OnboardingRedirect } from "@/components/home/onboarding-redirect";
import { HomeFeedSection } from "@/components/home/home-feed-section";
import { VisitorFeed } from "@/components/home/visitor-feed";
import { VisitorSignupTriggers } from "@/components/home/visitor-signup-triggers";
import { HomeFeedSkeleton } from "@/components/skeletons/home-feed-skeleton";
import { sectionGap } from "@/lib/ui/surface";

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<{ welcome?: string }>;
}) {
  const sp = searchParams != null ? await searchParams : {};
  const welcomeOnboarding = sp.welcome === "1";

  const session = await getSession();

  if (!session?.user?.id) {
    return (
      <div className={sectionGap}>
        <VisitorFeed />
        <VisitorSignupTriggers />
      </div>
    );
  }

  return (
    <div className={sectionGap}>
      <Suspense fallback={null}>
        <OnboardingRedirect userId={session.user.id} />
      </Suspense>
      <Suspense fallback={null}>
        <HomeWelcomeOverlay initialActive={welcomeOnboarding} />
      </Suspense>
      <Suspense fallback={null}>
        <BillboardDropSection userId={session.user.id} />
      </Suspense>
      <Suspense fallback={<HomeFeedSkeleton />}>
        <HomeFeedSection userId={session.user.id} />
      </Suspense>
    </div>
  );
}
