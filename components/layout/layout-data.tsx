import { Suspense } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { getSession } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { countUnreadNotifications } from "@/lib/queries";
import { Providers } from "@/components/providers";

async function LayoutDataFetcherWithChildren({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session?.user?.id) {
    return (
      <Providers session={session} hideQuickLogFab={false}>
        <AppLayout unreadCount={0} hideQuickLogFab={false}>{children}</AppLayout>
      </Providers>
    );
  }

  const uid = session.user.id;
  try {
    const supabase = await createSupabaseServerClient();
    const [{ data: meRow }, unread] = await Promise.all([
      supabase
        .from("users")
        .select("lastfm_username")
        .eq("id", uid)
        .maybeSingle(),
      countUnreadNotifications(uid, supabase),
    ]);
    const hideQuickLogFab = Boolean(
      (meRow as { lastfm_username?: string | null } | null)?.lastfm_username?.trim(),
    );
    return (
      <Providers session={session} hideQuickLogFab={hideQuickLogFab}>
        <AppLayout unreadCount={unread} hideQuickLogFab={hideQuickLogFab}>{children}</AppLayout>
      </Providers>
    );
  } catch {
    let unreadCount = 0;
    try {
      unreadCount = await countUnreadNotifications(uid);
    } catch {
      unreadCount = 0;
    }
    return (
      <Providers session={session} hideQuickLogFab={false}>
        <AppLayout unreadCount={unreadCount} hideQuickLogFab={false}>{children}</AppLayout>
      </Providers>
    );
  }
}

export function LayoutData({ children, session }: { children: React.ReactNode; session: any }) {
  return (
    <Suspense fallback={
      <Providers session={session} hideQuickLogFab={false}>
        <AppLayout unreadCount={0} hideQuickLogFab={false}>{children}</AppLayout>
      </Providers>
    }>
      <LayoutDataFetcherWithChildren>
        {children}
      </LayoutDataFetcherWithChildren>
    </Suspense>
  );
}
