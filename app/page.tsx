import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { BillboardDropSection } from "@/components/billboard-drop/billboard-drop-section";
import { HomeWelcomeOverlay } from "@/components/home-welcome-overlay";
import { VisitorFeed } from "@/components/home/visitor-feed";
import { VisitorSignupTriggers } from "@/components/home/visitor-signup-triggers";
import { HomeTabsContainer } from "@/components/home/home-tabs-container";
import { ChartsClient } from "@/app/charts/charts-client";
import { TasteTimeline } from "@/components/profile/taste-timeline";
import { ProfileWeeklyTopAlbumsSection } from "@/components/profile/profile-weekly-top-albums";
import { ProfilePulseSection } from "@/components/profile/profile-pulse-section";
import { ProfileRecentActivity } from "@/components/profile/profile-recent-activity";
import { ProfileInsightCards } from "@/components/profile/profile-insight-cards";
import { TasteBlindSpots } from "@/components/profile/taste-blind-spots";
import { ProfileListeningReportPreview } from "@/components/profile/profile-listening-report-preview";
import { SectionBlock } from "@/components/layout/section-block";
import { cardElevated, sectionGap } from "@/lib/ui/surface";
import {
  getCachedTasteIdentity,
  getCachedTopThisWeek,
  getCachedProfilePulseInsights,
  getCachedListeningReportPreview,
} from "@/lib/profile/cached-profile-data";
import { getBlindSpots } from "@/lib/profile/taste-blind-spots";
import { getTasteTimeline } from "@/lib/profile/taste-timeline";
import { getTasteInsights } from "@/lib/profile/taste-insights";
import { buildWeeklyNarrative } from "@/lib/profile/weekly-narrative";
import type { TasteIdentity } from "@/lib/taste/types";

const EMPTY_TASTE: TasteIdentity = {
  topArtists: [],
  topAlbums: [],
  topGenres: [],
  obscurityScore: null,
  diversityScore: 0,
  listeningStyle: "plotting-the-plot",
  avgTracksPerSession: 0,
  totalLogs: 0,
  summary: "",
};

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<{ welcome?: string; type?: string; weekStart?: string }>;
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
    (onboardingRow as { onboarding_completed: boolean }).onboarding_completed !== true
  ) {
    redirect("/onboarding");
  }

  const userId = session.user.id;
  const username = session.user.username ?? session.user.name ?? "you";

  const settled = await Promise.allSettled([
    getCachedTasteIdentity(userId),         // 0
    getCachedTopThisWeek(userId),            // 1
    getCachedProfilePulseInsights(userId),   // 2
    getBlindSpots(userId),                   // 3
    getTasteTimeline(userId),                // 4
    getCachedListeningReportPreview(userId), // 5
    getTasteInsights(userId),                // 6
  ]);

  const tasteIdentity: TasteIdentity =
    settled[0].status === "fulfilled" ? settled[0].value : EMPTY_TASTE;
  if (settled[0].status === "rejected")
    console.error("[home] getCachedTasteIdentity failed:", settled[0].reason);

  const weeklyTop =
    settled[1].status === "fulfilled" ? settled[1].value : null;
  if (settled[1].status === "rejected")
    console.error("[home] getCachedTopThisWeek failed:", settled[1].reason);

  const profilePulse =
    settled[2].status === "fulfilled" ? settled[2].value : null;
  if (settled[2].status === "rejected")
    console.error("[home] getCachedProfilePulseInsights failed:", settled[2].reason);

  const blindSpots =
    settled[3].status === "fulfilled" ? settled[3].value : null;
  if (settled[3].status === "rejected")
    console.error("[home] getBlindSpots failed:", settled[3].reason);

  const tasteTimeline =
    settled[4].status === "fulfilled"
      ? settled[4].value
      : { months: [], shifts: [], hasData: false };
  if (settled[4].status === "rejected")
    console.error("[home] getTasteTimeline failed:", settled[4].reason);

  const listeningReportPreview =
    settled[5].status === "fulfilled" ? settled[5].value : null;
  if (settled[5].status === "rejected")
    console.error("[home] getCachedListeningReportPreview failed:", settled[5].reason);

  const tasteInsights =
    settled[6].status === "fulfilled"
      ? settled[6].value
      : {
          arc: { kind: "insufficient" as const, narrative: "", risingArtists: [], stableArtists: [] },
          discovery: { kind: "insufficient" as const, narrative: "", newArtistsCount: 0, revisitRate: 0, recentFinds: [] },
        };
  if (settled[6].status === "rejected")
    console.error("[home] getTasteInsights failed:", settled[6].reason);

  const weeklyNarrative = buildWeeklyNarrative({
    username,
    isOwnProfile: true,
    taste: tasteIdentity,
    pulse: profilePulse,
    weeklyTop,
  });

  // ── Billboard tab — the real weekly ranked chart ─────────────────────────────
  const billboardTab = (
    <ChartsClient initialType="tracks" initialWeekStart={sp.weekStart?.trim() || null} />
  );

  // ── Pulse tab — rolling 7-day top + pulse stats + narrative ──────────────────
  const pulseTab = (
    <div className={sectionGap}>
      {weeklyNarrative ? (
        <div className={`${cardElevated} px-4 py-4 text-sm leading-relaxed italic text-zinc-300 sm:px-5 sm:py-5`}>
          {weeklyNarrative}
        </div>
      ) : null}
      <ProfileWeeklyTopAlbumsSection
        weeklyTop={
          weeklyTop
            ? { ...weeklyTop, artists: weeklyTop.artists.slice(0, 5), albums: weeklyTop.albums.slice(0, 5) }
            : null
        }
        isOwnProfile
      />
      <ProfilePulseSection insights={profilePulse} />
    </div>
  );

  // ── History tab ───────────────────────────────────────────────────────────────
  const historyTab = (
    <div className={sectionGap}>
      {tasteTimeline.hasData && (
        <SectionBlock title="Taste over time">
          <TasteTimeline data={tasteTimeline} />
        </SectionBlock>
      )}
      {blindSpots?.hasData && (
        <SectionBlock title="Blind spots">
          <TasteBlindSpots data={blindSpots} />
        </SectionBlock>
      )}
      <SectionBlock
        title="Listening report"
        action={{ label: "Full report →", href: "/reports/listening" }}
      >
        <ProfileListeningReportPreview data={listeningReportPreview} />
      </SectionBlock>
      <SectionBlock title="Listening insights">
        <ProfileInsightCards
          arc={tasteInsights.arc}
          discovery={tasteInsights.discovery}
          taste={tasteIdentity}
        />
      </SectionBlock>
    </div>
  );

  // ── Activity tab ──────────────────────────────────────────────────────────────
  const activityTab = (
    <div className={sectionGap}>
      <SectionBlock
        title="Recent activity"
        action={{ label: "View all", href: "/recently-played" }}
      >
        <ProfileRecentActivity
          key={userId}
          userId={userId}
          isOwnProfile
          showSpotifyControls={false}
          spotifyConnected={false}
          logsPrivateHidden={false}
        />
      </SectionBlock>
    </div>
  );

  return (
    <div className={sectionGap}>
      <Suspense fallback={null}>
        <HomeWelcomeOverlay initialActive={welcomeOnboarding} />
      </Suspense>
      <Suspense fallback={null}>
        <BillboardDropSection userId={userId} />
      </Suspense>
      <HomeTabsContainer
        billboardContent={billboardTab}
        pulseContent={pulseTab}
        historyContent={historyTab}
        activityContent={activityTab}
      />
    </div>
  );
}
