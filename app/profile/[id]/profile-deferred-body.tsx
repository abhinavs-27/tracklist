import { use } from "react";
import type { Session } from "next-auth";
import { SectionBlock } from "@/components/layout/section-block";
import { TasteMatchSection } from "@/components/taste-match";
import { LastfmSection } from "@/components/lastfm/lastfm-section";
import { TasteIdentitySection } from "@/components/profile/taste-identity-section";
import { ListCard } from "@/components/list-card";
import { ProfileListsSection } from "@/app/profile/[id]/profile-lists-section";
import { SimilarUsersSection } from "@/components/similar-users-section";
import { DeleteAccountSection } from "@/components/profile/delete-account-section";
import { PrivateLogsToggle } from "@/components/profile/private-logs-toggle";
import { SignOutSection } from "@/components/profile/sign-out-section";
import type { TasteIdentity } from "@/lib/taste/types";
import { cardElevated, sectionGap } from "@/lib/ui/surface";
import { ProfileTabsContainer } from "@/components/profile/profile-tabs";
import type { UserListWithPreview } from "@/lib/queries";
import {
  getCachedTasteIdentity,
  getCachedUserListsWithPreviews,
  getCachedUserMatches,
} from "@/lib/profile/cached-profile-data";
import { ProfileReviewsTab } from "@/components/profile/profile-reviews-tab";

const LISTS_PREVIEW_MAX = 6;

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

type ProfileDeferredBodyProps = {
  user: {
    id: string;
    username: string;
    avatar_url: string | null;
    bio: string | null;
    created_at: string;
    lastfm_username: string | null;
    lastfm_last_synced_at: string | null;
  };
  /** Profile subject — when true, other viewers don't see log-derived activity. */
  logsPrivate: boolean;
  profile: {
    id: string;
    username: string;
    avatar_url: string | null;
    bio: string | null;
    created_at: string;
    followers_count: number;
    following_count: number;
    is_following: boolean;
    is_own_profile: boolean;
  };
  session: Session | null;
  spotifyConnected: boolean;
  reviewCount: number;
  // Prefetched promises from parent
  userListsPromise: Promise<UserListWithPreview[]>;
  tasteIdentityPromise: Promise<TasteIdentity>;
  userMatchesPromise: Promise<any>;
};

export function ProfileDeferredBody({
  user,
  profile,
  session,
  logsPrivate,
  reviewCount,
  userListsPromise,
  tasteIdentityPromise,
  userMatchesPromise,
}: ProfileDeferredBodyProps) {
  const isOwnProfile = !!profile.is_own_profile;

  const userLists = use(userListsPromise) ?? [];
  const tasteIdentity = use(tasteIdentityPromise) ?? EMPTY_TASTE;
  const userMatchesPrefetched = use(userMatchesPromise);

  // ── Overview tab ──────────────────────────────────────────────────────────────
  const overviewTab = (
    <div className={sectionGap}>
      {/* TasteMatch — only shown when viewing someone else's profile */}
      {!isOwnProfile ? (
        <div id="taste-match" className="scroll-mt-24">
          <TasteMatchSection
            profileUserId={profile.id}
            viewerUserId={session?.user?.id ?? null}
          />
        </div>
      ) : null}

      {/* Similar users — both own profile and others */}
      <SimilarUsersSection
        userId={profile.id}
        variant="strip"
        prefetchedMatches={userMatchesPrefetched}
      />

      {/* Music Identity */}
      <div id="music-identity" className="scroll-mt-24">
        <SectionBlock
          title="Music identity"
          action={{ label: "Full report →", href: "/reports/listening" }}
        >
          <TasteIdentitySection
            userId={profile.id}
            hubMode
            initialData={tasteIdentity}
          />
        </SectionBlock>
      </div>

    </div>
  );

  // ── Lists tab ─────────────────────────────────────────────────────────────────
  const listsTab = (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">
          {isOwnProfile ? "Your lists" : "Lists"}
        </h2>
        <div className="flex items-center gap-2">
          {isOwnProfile ? <ProfileListsSection /> : null}
          {isOwnProfile && userLists.length > 0 ? (
            <a
              href="/lists"
              className="rounded-lg border border-zinc-700/80 bg-zinc-900/60 px-3 py-1.5 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800"
            >
              View all
            </a>
          ) : null}
        </div>
      </div>

      {/* Empty */}
      {userLists.length === 0 ? (
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-950/40 px-4 py-8 text-center">
          <p className="text-sm text-zinc-500">
            {isOwnProfile ? "No lists yet." : "No lists yet."}
          </p>
          {isOwnProfile && (
            <div className="mt-4 flex justify-center">
              <ProfileListsSection triggerLabel="Create your first list" />
            </div>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {(isOwnProfile ? userLists.slice(0, LISTS_PREVIEW_MAX) : userLists).map((list) => (
            <li key={list.id}>
              <ListCard
                id={list.id}
                title={list.title}
                description={list.description}
                created_at={list.created_at}
                item_count={list.item_count}
                visibility={list.visibility}
                emoji={list.emoji}
                image_url={list.image_url}
                preview_labels={list.preview_labels}
                profilePreview
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  // ── Reviews tab ───────────────────────────────────────────────────────────────
  const reviewsTab = (
    <ProfileReviewsTab
      username={profile.username}
      isOwnProfile={isOwnProfile}
      hasLastfm={!!user.lastfm_username}
      initialReviewCount={reviewCount ?? 0}
    />
  );

  // ── Settings tab (own profile only) ──────────────────────────────────────────
  const settingsTab = isOwnProfile ? (
    <div className={sectionGap}>
      <SectionBlock title="Privacy">
        <PrivateLogsToggle initialPrivate={logsPrivate} />
      </SectionBlock>

      <LastfmSection
        key={`lastfm-${profile.id}`}
        userId={profile.id}
        username={profile.username}
        initialUsername={user.lastfm_username ?? null}
        initialLastSyncedAt={user.lastfm_last_synced_at ?? null}
      />

      <SignOutSection />

      <DeleteAccountSection username={profile.username} />
    </div>
  ) : undefined;

  return (
    <ProfileTabsContainer
      overviewContent={overviewTab}
      listsContent={listsTab}
      reviewsContent={reviewsTab}
      settingsContent={settingsTab}
    />
  );
}
