import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { CommunityJoinClient } from "@/components/community/community-join-client";
import { getCommunityInvitePreview } from "@/lib/community/invite-link-preview";
import {
  getInviteLinkByToken,
  isInviteLinkExpired,
  joinCommunityViaInviteLink,
} from "@/lib/community/invite-links";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export default async function CommunityJoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: raw } = await params;
  const token = raw?.trim() ?? "";
  if (!token) notFound();

  const link = await getInviteLinkByToken(token);
  if (!link || isInviteLinkExpired(link)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950">
        <div className="max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 text-center">
          <h1 className="text-xl font-semibold text-white">Invite unavailable</h1>
          <p className="mt-3 text-sm text-zinc-400">
            This invite link is invalid or has expired. Ask a community admin for a
            new link.
          </p>
        </div>
      </div>
    );
  }

  const [preview, session] = await Promise.all([
    getCommunityInvitePreview(link.community_id),
    getSession(),
  ]);
  if (!preview) notFound();

  const userId = session?.user?.id ?? null;

  let lastfmUsername: string | null = null;
  let onboardingCompleted = false;
  let joinOk = false;
  let joinError: string | null = null;

  if (userId) {
    const admin = createSupabaseAdminClient();
    const { data: uRes, error: uErr } = await admin
      .from("users")
      .select("lastfm_username, onboarding_completed")
      .eq("id", userId)
      .maybeSingle();
    if (uErr) {
      console.error("[community/join] user lookup failed", uErr);
    }
    const uRow = uRes as {
      lastfm_username: string | null;
      onboarding_completed: boolean;
    } | null;
    lastfmUsername = uRow?.lastfm_username ?? null;
    onboardingCompleted = uRow?.onboarding_completed === true;

    if (!onboardingCompleted) {
      const dest = new URL("/onboarding", "http://local");
      dest.searchParams.set(
        "next",
        `/communities/${preview.community.id}`,
      );
      dest.searchParams.set("from", "invite");
      dest.searchParams.set("inviteToken", token);
      redirect(`${dest.pathname}${dest.search}`);
    }

    const jr = await joinCommunityViaInviteLink(token, userId, { link });

    if (jr.ok) {
      joinOk = true;
      redirect(`/communities/${jr.communityId}`);
    } else {
      joinError =
        jr.reason === "invalid_or_expired"
          ? "This invite link is invalid or has expired."
          : "Could not join this community.";
    }
  }

  const initialPreview = {
    community: {
      id: preview.community.id,
      name: preview.community.name,
      description: preview.community.description,
      is_private: preview.community.is_private,
      member_count: preview.member_count,
    },
    top_tracks: preview.top_tracks,
    recent_activity: preview.recent_activity.map((a) => ({
      id: a.id,
      type: a.type,
      created_at: a.created_at,
      username: a.username,
    })),
  };

  return (
    <div className="min-h-screen bg-zinc-950 py-12">
      <CommunityJoinClient
        token={token}
        initialPreview={initialPreview}
        viewer={{
          isLoggedIn: !!userId,
          hasLastfm: !!lastfmUsername?.trim(),
          onboardingComplete: onboardingCompleted,
          joinOk,
          joinError,
        }}
      />
    </div>
  );
}
