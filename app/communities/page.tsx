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
import { contentMax2xl } from "@/lib/ui/layout";
import { sectionGap } from "@/lib/ui/surface";
import { NotificationBellLink } from "@/components/notifications/notification-bell-link";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { countUnreadNotifications } from "@/lib/queries";

export default async function CommunitiesPage() {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/communities");
  }

  const userId = session.user.id;
  const supabase = await createSupabaseServerClient();
  const unreadCount = await countUnreadNotifications(userId, supabase).catch(() => 0);

  return (
    <div className={`${contentMax2xl} ${sectionGap}`}>
      {/* Mobile sticky page header — replaces the global top nav on this page */}
      <div className="sticky top-0 z-40 -mx-4 bg-zinc-950/95 px-4 pb-5 pt-6 backdrop-blur-xl sm:-mx-6 sm:px-6 md:static md:mx-0 md:bg-transparent md:px-0 md:pt-8 md:backdrop-blur-none">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-white md:text-5xl">Communities</h1>
            <p className="mt-2 text-[15px] text-zinc-500 md:mt-3 md:text-lg">
              Small-group listening challenges — leaderboards reset weekly.
            </p>
          </div>
          <div className="shrink-0 md:hidden">
            <NotificationBellLink unreadCount={unreadCount} />
          </div>
        </div>
        <Link
          href="/communities/new"
          className="mt-4 flex w-full items-center justify-center rounded-full bg-green-400 py-4 text-base font-bold text-green-950 transition hover:bg-green-300"
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
