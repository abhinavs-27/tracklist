import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import {
  PendingInvitesSection,
  PendingInvitesSkeleton,
} from "@/app/communities/pending-invites-section";
import {
  PopularPublicCommunitiesSection,
  PopularPublicCommunitiesSkeleton,
} from "@/app/communities/popular-public-communities-section";
import {
  YourCommunitiesSection,
  YourCommunitiesSkeleton,
} from "@/app/communities/your-communities-section";
import { PageHeading } from "@/components/ui/page-heading";
import { contentMax2xl } from "@/lib/ui/layout";
import { sectionGap } from "@/lib/ui/surface";

export default async function CommunitiesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/communities");
  }

  const userId = session.user.id;

  return (
    <div className={`${contentMax2xl} py-6 sm:py-8 ${sectionGap}`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeading
          className="mb-0 flex-1 min-w-0 sm:mb-0"
          title="Communities"
          description="Small-group listening challenges — leaderboards reset weekly."
        />
        <Link
          href="/communities/new"
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-950/30 transition hover:bg-emerald-500"
        >
          Create community
        </Link>
      </div>

      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Pending invites
        </h2>
        <Suspense fallback={<PendingInvitesSkeleton />}>
          <PendingInvitesSection userId={userId} />
        </Suspense>
      </section>

      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Your communities
        </h2>
        <Suspense fallback={<YourCommunitiesSkeleton />}>
          <YourCommunitiesSection userId={userId} />
        </Suspense>
      </section>

      <Suspense
        fallback={
          <section className="space-y-4">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Popular public communities
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Most members among public groups — join to show up on the leaderboard and feed.
              </p>
            </div>
            <PopularPublicCommunitiesSkeleton />
          </section>
        }
      >
        <PopularPublicCommunitiesSection userId={userId} />
      </Suspense>
    </div>
  );
}
