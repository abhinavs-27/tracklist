"use client";

import { CommunityHero, type CommunityHeroViewerStats } from "@/components/community/community-hero";
import { CommunitySettings } from "@/components/community/CommunitySettings";
import { CommunityActions } from "@/components/community/community-actions";
import { CommunityInviteButton } from "@/components/community/community-invite-button";
import type { CommunityHeroTopArtist } from "@/lib/community/get-community-hero-data";
import type { CommunityRow } from "@/types";

export type CommunityHeroStaticProps = {
  name: string;
  description: string | null;
  isPrivate: boolean;
  memberCount: number;
  membersJoinedThisWeek: number;
  topThisWeek: CommunityHeroTopArtist[];
  backgroundImageUrls: string[];
  avatarUrl?: string | null;
  communityId?: string;
  viewerStats?: CommunityHeroViewerStats | null;
};

type Props = {
  communityId: string;
  community: CommunityRow;
  memberCount: number;
  canEdit: boolean;
  canInvite: boolean;
  heroProps: CommunityHeroStaticProps;
};

/**
 * Must be a client component: `CommunitySettings` uses a render-prop child, and
 * function props cannot be passed from a Server Component parent — they would be
 * dropped and Edit would fall back to the legacy block below the hero.
 */
export function CommunityMemberHeroShell({
  communityId,
  community,
  memberCount,
  canEdit,
  canInvite,
  heroProps,
}: Props) {
  const communityActions = (
    <div className="flex flex-wrap items-center gap-2">
      <CommunityActions
        variant="hero"
        communityId={communityId}
        communityName={community.name}
        isPrivate={community.is_private}
        isMember
        pendingInviteId={null}
      />
      {canInvite ? (
        <CommunityInviteButton
          communityId={communityId}
          communityName={community.name}
        />
      ) : null}
    </div>
  );

  return (
    <CommunitySettings
      communityId={communityId}
      community={community}
      memberCount={memberCount}
      canEdit={canEdit}
      headerActions={communityActions}
    >
      {({ heroActions, settingsBody }) => (
        <>
          <CommunityHero {...heroProps} actions={heroActions} />
          {settingsBody}
        </>
      )}
    </CommunitySettings>
  );
}
