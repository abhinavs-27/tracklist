import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { CommunityInvitesClient } from "@/app/communities/invites/invites-client";
import { listPendingInvitesForUser } from "@/lib/community/invites";
import { getUserCommunities } from "@/lib/community/queries";

export default async function CommunitiesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/communities");
  }

  const [communities, invites] = await Promise.all([
    getUserCommunities(session.user.id),
    listPendingInvitesForUser(session.user.id),
  ]);

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
        <CommunityInvitesClient initialInvites={invites} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Your communities
        </h2>
      {communities.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center">
          <p className="text-zinc-400">
            You&apos;re not in a community yet. Create one to compete with friends.
          </p>
          <Link
            href="/communities/new"
            className="mt-4 inline-block text-emerald-400 hover:underline"
          >
            Create a community →
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {communities.map((c) => (
            <li key={c.id}>
              <Link
                href={`/communities/${c.id}`}
                className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 transition hover:border-zinc-600 hover:bg-zinc-900/70"
              >
                <div className="min-w-0">
                  <p className="font-medium text-white">{c.name}</p>
                  {c.description ? (
                    <p className="truncate text-sm text-zinc-500">{c.description}</p>
                  ) : null}
                </div>
                <div className="shrink-0 text-right text-xs text-zinc-500">
                  <span>{c.member_count} members</span>
                  {c.is_private ? (
                    <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5">Private</span>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      </section>
    </div>
  );
}
