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
  const sessionPromise = getSession();
  const [session, unreadCount] = await Promise.all([
    sessionPromise,
    sessionPromise.then((s) =>
      s?.user?.id
        ? createSupabaseServerClient().then((supabase) =>
            countUnreadNotifications(s.user.id, supabase),
          )
        : Promise.resolve(0),
    ).catch(() => 0),
  ]);

  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/communities");
  }

  const userId = session.user.id;

  return (
    <>
      {/* Mobile fixed header — covers layout nav (z-[60] > z-50), matches mobile app style */}
      <div className="fixed left-0 right-0 top-0 z-[60] border-b border-white/[0.06] bg-zinc-950/95 px-4 pb-5 pt-6 backdrop-blur-xl sm:px-6 md:hidden">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-4xl font-extrabold tracking-tight text-white">Communities</h1>
          <div className="shrink-0 pt-1">
            <NotificationBellLink unreadCount={unreadCount} />
          </div>
        </div>
        <p className="mt-2 text-[15px] text-zinc-500">
          Small-group listening challenges — leaderboards reset weekly.
        </p>
        <Link
          href="/communities/new"
          className="mt-4 flex w-full items-center justify-center rounded-full bg-green-400 py-4 text-base font-bold text-green-950 transition hover:bg-green-300 active:bg-green-300"
        >
          Create community
        </Link>
      </div>

      {/* Spacer — accounts for fixed header minus the layout nav + main padding already in flow */}
      <div className="h-[8rem] md:hidden" />

      <div className={contentMax2xl}>
        {/* Desktop header — outside the content sections so it doesn't affect mobile spacing */}
        <div className="hidden md:mb-10 md:block">
          <h1 className="text-5xl font-extrabold tracking-tight text-white">Communities</h1>
          <p className="mt-3 text-lg text-zinc-500">
            Small-group listening challenges — leaderboards reset weekly.
          </p>
          <Link
            href="/communities/new"
            className="mt-5 inline-flex items-center justify-center rounded-full bg-green-400 px-8 py-3 text-base font-bold text-green-950 transition hover:bg-green-300"
          >
            Create community
          </Link>
        </div>

        <div className={sectionGap}>
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-zinc-500">Pending Invites</h2>
            <Suspense fallback={<PendingInvitesSkeleton />}>
              <PendingInvitesSection userId={userId} />
            </Suspense>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-medium text-zinc-500">Your Communities</h2>
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
      </div>
    </>
  );
}
