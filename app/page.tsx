import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { HomeWelcomeOverlay } from "@/components/home-welcome-overlay";
import { HomeFeedSection } from "@/components/home/home-feed-section";
import { HomeFeedSkeleton } from "@/components/skeletons/home-feed-skeleton";
import { pageTitle, sectionGap } from "@/lib/ui/surface";

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<{ welcome?: string }>;
}) {
  const sp = searchParams != null ? await searchParams : {};
  const welcomeOnboarding = sp.welcome === "1";

  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return (
      <div className={`flex flex-col items-center justify-center py-24 text-center sm:py-28`}>
        <h1 className={`${pageTitle} max-w-2xl`}>
          Log your music. Share with friends.
        </h1>
        <p className="mt-6 max-w-md text-lg text-zinc-400 sm:text-xl">
          Tracklist is like Letterboxd for music. Search for albums and tracks,
          rate and review your listens, and follow friends to see their activity.
        </p>
        <Link
          href="/auth/signin"
          className="mt-10 inline-flex min-h-12 items-center justify-center rounded-2xl bg-emerald-600 px-10 py-3.5 text-base font-medium text-white shadow-lg shadow-emerald-950/35 transition hover:bg-emerald-500 hover:shadow-xl hover:shadow-emerald-950/40"
        >
          Sign in with Google
        </Link>
        <Link
          href="/explore"
          className="mt-6 text-base text-zinc-400 underline-offset-4 transition hover:text-white hover:underline"
        >
          Explore Tracklist
        </Link>
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
      <Suspense fallback={<HomeFeedSkeleton />}>
        <HomeFeedSection userId={session.user.id} />
      </Suspense>
    </div>
  );
}
