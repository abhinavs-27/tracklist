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

  const admin = createSupabaseAdminClient();
  const { data: onboardingRow, error: onboardingErr } = await admin
    .from("users")
    .select("onboarding_completed")
    .eq("id", session.user.id)
    .maybeSingle();
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
        <BillboardDropSection userId={session.user.id} />
      </Suspense>
      <Suspense fallback={<HomeFeedSkeleton />}>
        <HomeFeedSection userId={session.user.id} />
      </Suspense>
    </div>
  );
}
