import {
  communityBody,
  communityCard,
  communityHeadline,
  communityMeta,
} from "@/lib/ui/surface";

type Props = {
  memberCount: number;
  membersJoinedThisWeek: number;
};

/** Compact community stats for desktop sidebar. */
export function CommunityStatsCard({
  memberCount,
  membersJoinedThisWeek,
}: Props) {
  return (
    <section className={communityCard}>
      <h3 className={communityHeadline}>Community</h3>
      <dl className="mt-4 space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <dt className={communityMeta}>Members</dt>
          <dd className={`tabular-nums text-lg font-semibold text-white ${communityBody}`}>
            {memberCount.toLocaleString()}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className={communityMeta}>Joined this week</dt>
          <dd className={`tabular-nums text-lg font-semibold text-emerald-400/95 ${communityBody}`}>
            +{membersJoinedThisWeek.toLocaleString()}
          </dd>
        </div>
      </dl>
    </section>
  );
}
