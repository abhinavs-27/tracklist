import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { listPendingInvitesForUser } from "@/lib/community/invites";
import { CommunityInvitesClient } from "./invites-client";

export default async function CommunityInvitesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/communities/invites");
  }

  const invites = await listPendingInvitesForUser(session.user.id);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <Link href="/communities" className="text-sm text-emerald-400 hover:underline">
        ← Communities
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-white">Community invites</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Accept to join private groups, or decline to dismiss.
        </p>
      </div>
      <CommunityInvitesClient initialInvites={invites} />
    </div>
  );
}
