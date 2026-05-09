import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSession } from "@/lib/auth";
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
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/communities");
  }

  const userId = session.user.id;

  return (
    <div className={`${contentMax2xl} py-6 sm:py-8 ${sectionGap}`}>
      <div className="space-y-4">
        <PageHeading
          className="mb-0"
          title="Communities"
          description="Small-group listening challenges — leaderboards reset weekly."
        />
        <Link
          href="/communities/new"
          className="flex w-full items-center justify-center rounded-full bg-green-400 py-4 text-base font-bold text-green-950 transition hover:bg-green-300"
        >
          Create community
        </Link>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-zinc-500">
          Pending Invites
        </h2>
        <Suspense fallback={<PendingInvitesSkeleton />}>
          <PendingInvitesSection userId={userId} />
        </Suspense>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-zinc-500">
          Your Communities
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
