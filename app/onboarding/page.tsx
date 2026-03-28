import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getUserFavoriteAlbums } from "@/lib/queries";
import { safeOnboardingNextPath } from "@/lib/onboarding/safe-next-path";
import { ProfileOnboarding } from "@/components/onboarding/profile-onboarding";
import {
  getInviteLinkByToken,
  isInviteLinkExpired,
} from "@/lib/community/invite-links";
import { getCommunityById } from "@/lib/community/queries";

function communityIdFromNextPath(path: string | null): string | null {
  if (!path) return null;
  const m = path.match(/^\/communities\/([0-9a-f-]{36})/i);
  return m?.[1] ?? null;
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams?: Promise<{
    next?: string;
    from?: string;
    inviteToken?: string;
  }>;
}) {
  const sp = searchParams != null ? await searchParams : {};
  const rawNext = typeof sp.next === "string" ? sp.next : undefined;
  const nextPath = safeOnboardingNextPath(rawNext);
  const fromInviteRaw = sp.from === "invite";
  const rawInviteToken =
    typeof sp.inviteToken === "string" ? sp.inviteToken.trim() : "";

  let inviteToken: string | null = null;
  let communityInviteName: string | null = null;
  if (fromInviteRaw && rawInviteToken) {
    const link = await getInviteLinkByToken(rawInviteToken);
    const expectedCommunityId = communityIdFromNextPath(nextPath);
    if (
      link &&
      !isInviteLinkExpired(link) &&
      (!expectedCommunityId || link.community_id === expectedCommunityId)
    ) {
      inviteToken = rawInviteToken;
      const c = await getCommunityById(link.community_id);
      communityInviteName = c?.name ?? null;
    }
  }

  const inviteFlow = Boolean(inviteToken);

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? null;

  if (!userId) {
    const q = new URLSearchParams();
    if (nextPath) q.set("next", nextPath);
    if (inviteFlow) {
      q.set("from", "invite");
      q.set("inviteToken", inviteToken!);
    }
    const callbackPath = `/onboarding?${q.toString()}`;
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent(callbackPath)}`);
  }

  const admin = createSupabaseAdminClient();
  const { data: user, error: userErr } = await admin
    .from("users")
    .select("id, username, lastfm_username, onboarding_completed")
    .eq("id", userId)
    .maybeSingle();

  if (userErr || !user) {
    redirect("/");
  }

  const row = user as {
    id: string;
    username: string;
    lastfm_username: string | null;
    onboarding_completed: boolean;
  };

  if (row.onboarding_completed === true) {
    redirect(nextPath ?? "/");
  }

  const favoriteAlbums = await getUserFavoriteAlbums(row.id);

  return (
    <ProfileOnboarding
      userId={row.id}
      initialUsername={row.username}
      initialFavoriteAlbums={favoriteAlbums.map((f) => ({
        album_id: f.album_id,
        name: f.name,
        image_url: f.image_url,
      }))}
      hasLastfmAlready={Boolean(row.lastfm_username?.trim())}
      nextPath={nextPath}
      inviteFlow={inviteFlow}
      inviteToken={inviteToken}
      communityInviteName={communityInviteName}
    />
  );
}
