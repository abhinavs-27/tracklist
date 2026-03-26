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
  YourCommunitiesSection,
  YourCommunitiesSkeleton,
} from "@/app/communities/your-communities-section";

export default async function CommunitiesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/communities");
  }

  const userId = session.user.id;

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Communities</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Small-group listening challenges — leaderboards reset weekly.
          </p>
        </div>
        <Link
          href="/communities/new"
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          Create community
        </Link>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Pending invites
        </h2>
        <Suspense fallback={<PendingInvitesSkeleton />}>
          <PendingInvitesSection userId={userId} />
        </Suspense>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Your communities
        </h2>
        <Suspense fallback={<YourCommunitiesSkeleton />}>
          <YourCommunitiesSection userId={userId} />
        </Suspense>
      </section>
    </div>
  );
}
