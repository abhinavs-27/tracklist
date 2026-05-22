import { Suspense, use } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { countUnreadNotifications } from "@/lib/queries";
import { BillboardDropSection } from "@/components/billboard-drop/billboard-drop-section";
import { HomeWelcomeOverlay } from "@/components/home-welcome-overlay";
import { VisitorFeed } from "@/components/home/visitor-feed";
import { VisitorSignupTriggers } from "@/components/home/visitor-signup-triggers";
import { HomeTabsContainer } from "@/components/home/home-tabs-container";
import { RecentlyPlayedFeed } from "@/components/home/recently-played-feed";
import { ChartsClient } from "@/app/charts/charts-client";
import { TasteTimeline } from "@/components/profile/taste-timeline";
import { ProfileWeeklyTopAlbumsSection } from "@/components/profile/profile-weekly-top-albums";
import { ProfilePulseSection } from "@/components/profile/profile-pulse-section";
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
  listeningStyle: "still-forming",
  avgTracksPerSession: 0,
  totalLogs: 0,
  summary: "",
};

// ── Sub-components for streaming ──────────────────────────────────────────

function PulseTabContent({
  username,
  tastePromise,
  weeklyTopPromise,
  pulsePromise,
}: {
  username: string;
  tastePromise: Promise<TasteIdentity>;
  weeklyTopPromise: Promise<any>;
  pulsePromise: Promise<any>;
}) {
  const taste = use(tastePromise);
  const weeklyTop = use(weeklyTopPromise);
  const pulse = use(pulsePromise);

  const weeklyNarrative = buildWeeklyNarrative({
    username,
    isOwnProfile: true,
    taste,
    pulse,
    weeklyTop,
  });

  return (
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
      <ProfilePulseSection insights={pulse} />
    </div>
  );
}

function HistoryTabContent({
  tastePromise,
  timelinePromise,
  blindSpotsPromise,
  reportPreviewPromise,
  insightsPromise,
}: {
  tastePromise: Promise<TasteIdentity>;
  timelinePromise: Promise<any>;
  blindSpotsPromise: Promise<any>;
  reportPreviewPromise: Promise<any>;
  insightsPromise: Promise<any>;
}) {
  const taste = use(tastePromise);
  const timeline = use(timelinePromise);
  const blindSpots = use(blindSpotsPromise);
  const reportPreview = use(reportPreviewPromise);
  const insights = use(insightsPromise);

  const tasteTimeline = timeline || { months: [], shifts: [], hasData: false };
  const tasteInsights = insights || {
    arc: { kind: "insufficient" as const, narrative: "", risingArtists: [], stableArtists: [] },
    discovery: { kind: "insufficient" as const, narrative: "", newArtistsCount: 0, revisitRate: 0, recentFinds: [] },
  };

  return (
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
        <ProfileListeningReportPreview data={reportPreview} />
      </SectionBlock>
      <SectionBlock title="Listening insights">
        <ProfileInsightCards
          arc={tasteInsights.arc}
          discovery={tasteInsights.discovery}
          taste={taste}
        />
      </SectionBlock>
    </div>
  );
}

async function HomeData({
  userId,
  username,
  weekStart,
}: {
  userId: string;
  username: string;
  weekStart: string | null;
}) {
  // Start all promises immediately.
  const tastePromise = getCachedTasteIdentity(userId).catch(() => EMPTY_TASTE);
  const weeklyTopPromise = getCachedTopThisWeek(userId).catch(() => null);
  const pulsePromise = getCachedProfilePulseInsights(userId).catch(() => null);
  const blindSpotsPromise = getBlindSpots(userId).catch(() => null);
  const timelinePromise = getTasteTimeline(userId).catch(() => null);
  const reportPreviewPromise = getCachedListeningReportPreview(userId).catch(() => null);
  const insightsPromise = getTasteInsights(userId).catch(() => null);
  const unreadCountPromise = createSupabaseServerClient().then((s) => countUnreadNotifications(userId, s)).catch(() => 0);

  // Billboard tab is static or depends only on weekStart.
  const billboardTab = (
    <ChartsClient initialType="tracks" initialWeekStart={weekStart} hideBackLink />
  );

  // Activity tab is its own loader.
  const activityTab = <RecentlyPlayedFeed />;

  // unreadCount is needed for the tab header shell. We await it but it's usually fast.
  const unreadCount = await unreadCountPromise;

  return (
    <HomeTabsContainer
      billboardContent={billboardTab}
      pulseContent={
        <Suspense fallback={<div className="h-96 w-full animate-pulse rounded-2xl bg-zinc-900/50" />}>
          <PulseTabContent
            username={username}
            tastePromise={tastePromise}
            weeklyTopPromise={weeklyTopPromise}
            pulsePromise={pulsePromise}
          />
        </Suspense>
      }
      historyContent={
        <Suspense fallback={<div className="h-96 w-full animate-pulse rounded-2xl bg-zinc-900/50" />}>
          <HistoryTabContent
            tastePromise={tastePromise}
            timelinePromise={timelinePromise}
            blindSpotsPromise={blindSpotsPromise}
            reportPreviewPromise={reportPreviewPromise}
            insightsPromise={insightsPromise}
          />
        </Suspense>
      }
      activityContent={activityTab}
      unreadCount={unreadCount}
    />
  );
}

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

  const userId = session.user.id;
  const username = session.user.username ?? session.user.name ?? "you";

  // Phase 1: Onboarding check.
  // Use the value from the session/JWT to avoid a database lookup.
  // NextAuth 'jwt' callback in route.ts ensures this is synced from the DB.
  if ((session.user as any).onboarding_completed === false) {
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
      <Suspense fallback={<div className="h-96 w-full animate-pulse rounded-2xl bg-zinc-900/50" />}>
        <HomeData
          userId={userId}
          username={username}
          weekStart={sp.weekStart?.trim() || null}
        />
      </Suspense>
    </div>
  );
}
