"use client";

import { CommunityHero } from "@/components/community/community-hero";
import { CommunitySettings } from "@/components/community/CommunitySettings";
import { CommunityActions } from "@/components/community/community-actions";
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
};

type Props = {
  communityId: string;
  community: CommunityRow;
  memberCount: number;
  canEdit: boolean;
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
  heroProps,
}: Props) {
  const communityActions = (
    <CommunityActions
      variant="hero"
      communityId={communityId}
      communityName={community.name}
      isPrivate={community.is_private}
      isMember
      pendingInviteId={null}
    />
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
