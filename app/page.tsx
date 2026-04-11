import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { BillboardDropSection } from "@/components/billboard-drop/billboard-drop-section";
import { HomeWelcomeOverlay } from "@/components/home-welcome-overlay";
import { HomeFeedSection } from "@/components/home/home-feed-section";
import { VisitorFeed } from "@/components/home/visitor-feed";
import { VisitorSignupTriggers } from "@/components/home/visitor-signup-triggers";
import { HomeFeedSkeleton } from "@/components/skeletons/home-feed-skeleton";
import { sectionGap } from "@/lib/ui/surface";
import { getHomeFeedInitialForUser } from "@/lib/feed";

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

  const userId = session.user.id;
  const admin = createSupabaseAdminClient();

  // Parallelize onboarding check and initial feed fetching
  const [onboardingRes, initialFeed] = await Promise.all([
    admin
      .from("users")
      .select("onboarding_completed")
      .eq("id", userId)
      .maybeSingle(),
    getHomeFeedInitialForUser(userId, 50),
  ]);

  const { data: onboardingRow, error: onboardingErr } = onboardingRes;

  if (onboardingErr) {
    console.error("[home] onboarding_completed lookup failed", onboardingErr);
  } else if (
    onboardingRow &&
    (onboardingRow as { onboarding_completed: boolean }).onboarding_completed !==
      true
  ) {
    redirect("/onboarding");
  }

  return (
    <div className={sectionGap}>
      <Suspense fallback={null}>
        <HomeWelcomeOverlay initialActive={welcomeOnboarding} />
      </Suspense>
      <Suspense fallback={null}>
        <BillboardDropSection userId={userId} />
      </Suspense>
      <Suspense fallback={<HomeFeedSkeleton />}>
        <HomeFeedSection userId={userId} initialFeed={initialFeed} />
      </Suspense>
    </div>
  );
}
