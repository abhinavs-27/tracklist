import Link from "next/link";
import type { CommunityHeroTopArtist } from "@/lib/community/get-community-hero-data";
import { resolveCommunityAvatarUrl } from "@/lib/profile-pictures/resolve-avatar-display";
import {
  communityBody,
  communityMeta,
} from "@/lib/ui/surface";

export type CommunityHeroViewerStats = {
  totalPlays: number;
  topArtistName: string | null;
  viewerPlays: number;
  viewerRank: number | null;
};

type Props = {
  name: string;
  description: string | null;
  isPrivate: boolean;
  memberCount: number;
  membersJoinedThisWeek: number;
  topThisWeek: CommunityHeroTopArtist[];
  backgroundImageUrls: string[];
  /** Optional JPEG from `communities.avatar_url` (S3 or app proxy URL). */
  avatarUrl?: string | null;
  /** Required to resolve legacy S3 URLs to `/api/profile-pictures/community/:id`. */
  communityId?: string;
  /** Toolbar actions — render bottom row (Edit, Join, Joined, Leave, Sign in). */
  actions: React.ReactNode;
  /** Unused — kept for API compatibility. */
  viewerStats?: CommunityHeroViewerStats | null;
};

function HeroBackground({ src }: { src: string | null }) {
  if (!src) {
    return (
      <div
        className="absolute inset-0 bg-gradient-to-br from-gold-950/50 via-zinc-900/90 to-zinc-950"
        aria-hidden
      />
    );
  }
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="absolute inset-0 h-full w-full scale-150 object-cover opacity-[0.38] blur-3xl"
      />
      <div className="absolute inset-0 bg-zinc-950/72" />
    </div>
  );
}

export function CommunityHero({
  name,
  description,
  isPrivate,
  memberCount,
  membersJoinedThisWeek,
  avatarUrl = null,
  communityId,
  actions,
}: Props) {
  const descriptionText = description?.trim() ?? "";
  const communityAvatarSrc =
    communityId && avatarUrl
      ? resolveCommunityAvatarUrl(communityId, avatarUrl)
      : avatarUrl;

  return (
    <div className="relative mb-6 w-full min-w-0">
      <div className="relative overflow-hidden rounded-2xl ring-1 ring-white/[0.08]">
        <HeroBackground src={communityAvatarSrc ?? null} />

        <div className="relative z-10 px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
          {/* Back link */}
          <Link
            href="/communities"
            className="inline-flex min-w-0 items-center gap-1.5 text-sm font-semibold text-gold-400/95 transition hover:text-gold-300"
          >
            <span aria-hidden className="text-base leading-none">←</span>
            Communities
          </Link>

          {/* Identity row */}
          <div className="mt-3.5 flex items-start gap-4">
            {communityAvatarSrc ? (
              <div className="h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-[1.125rem] ring-1 ring-white/[0.12]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={communityAvatarSrc} alt="" className="h-full w-full object-cover" />
              </div>
            ) : null}
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-2 gap-y-1.5">
                <h1 className="text-balance text-[1.625rem] font-bold tracking-tight text-white leading-tight">
                  {name}
                </h1>
                {isPrivate ? (
                  <span className={`shrink-0 rounded-full bg-white/[0.06] px-2.5 py-0.5 ring-1 ring-white/10 ${communityMeta} font-semibold uppercase tracking-wide text-zinc-300`}>
                    Private
                  </span>
                ) : null}
              </div>
              <p className={`mt-1.5 ${communityMeta} text-zinc-400`}>
                <span className="font-semibold tabular-nums text-zinc-100">
                  {memberCount.toLocaleString()}
                </span>{" "}
                member{memberCount !== 1 ? "s" : ""}
                {membersJoinedThisWeek > 0 ? (
                  <span className="ml-2 font-medium text-gold-400/90">
                    +{membersJoinedThisWeek} new this week
                  </span>
                ) : null}
              </p>
              {descriptionText ? (
                <p className={`mt-2 max-w-2xl text-pretty ${communityBody}`}>
                  {descriptionText}
                </p>
              ) : null}
            </div>
          </div>

          {/* Actions row */}
          <div className="mt-3.5 border-t border-white/[0.08] pt-3.5 flex flex-wrap items-center gap-2">
            {actions}
          </div>
        </div>
      </div>
    </div>
  );
}
