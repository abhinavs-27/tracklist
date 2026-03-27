import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getUserFavoriteAlbums } from "@/lib/queries";
import { safeOnboardingNextPath } from "@/lib/onboarding/safe-next-path";
import { ProfileOnboarding } from "@/components/onboarding/profile-onboarding";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams?: Promise<{ next?: string; from?: string }>;
}) {
  const sp = searchParams != null ? await searchParams : {};
  const rawNext = typeof sp.next === "string" ? sp.next : undefined;
  const nextPath = safeOnboardingNextPath(rawNext);
  const fromInvite = sp.from === "invite";

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? null;

  if (!userId) {
    const callbackPath =
      nextPath != null
        ? `/onboarding?next=${encodeURIComponent(nextPath)}${fromInvite ? "&from=invite" : ""}`
        : fromInvite
          ? "/onboarding?from=invite"
          : "/onboarding";
    redirect(
      `/auth/signin?callbackUrl=${encodeURIComponent(callbackPath)}`,
    );
  }

  const admin = createSupabaseAdminClient();
  const { data: user, error: userErr } = await admin
    .from("users")
    .select(
      "id, username, lastfm_username, onboarding_completed",
    )
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
    redirect(nextPath ?? "/feed");
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
      variant="fullPage"
      nextPath={nextPath}
      inviteFlow={fromInvite}
    />
  );
}
