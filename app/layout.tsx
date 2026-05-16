import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { AppLayout } from "@/components/layout/app-layout";
import { ProfilingHydrationMarker } from "@/components/profiling-hydration-marker";
import { getSession } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { countUnreadNotifications } from "@/lib/queries";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Suspense } from "react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tracklist — Log your music",
  description:
    "The social media app for music. Log listens, rate albums and tracks, follow friends.",
  other: {
    "color-scheme": "dark",
  },
};

async function LayoutData({
  userId,
  children,
}: {
  userId: string;
  children: (data: { unreadCount: number; hideQuickLogFab: boolean }) => React.ReactNode;
}) {
  let hideQuickLogFab = false;
  let unreadCount = 0;
  try {
    const supabase = await createSupabaseServerClient();
    const [{ data: meRow }, unread] = await Promise.all([
      supabase
        .from("users")
        .select("lastfm_username")
        .eq("id", userId)
        .maybeSingle(),
      countUnreadNotifications(userId, supabase),
    ]);
    hideQuickLogFab = Boolean(
      (meRow as { lastfm_username?: string | null } | null)?.lastfm_username?.trim(),
    );
    unreadCount = unread;
  } catch {
    hideQuickLogFab = false;
    try {
      unreadCount = await countUnreadNotifications(userId);
    } catch {
      unreadCount = 0;
    }
  }

  return <>{children({ unreadCount, hideQuickLogFab })}</>;
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();
  const userId = session?.user?.id;

  return (
    <html lang="en" className="overflow-x-clip" style={{ colorScheme: "dark" }}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen overflow-x-clip bg-zinc-950 font-sans text-zinc-100 antialiased`}
      >
        <Suspense
          fallback={
            <Providers session={session} hideQuickLogFab={false}>
              <ProfilingHydrationMarker />
              <AppLayout unreadCount={0} hideQuickLogFab={false}>
                {children}
              </AppLayout>
              <Analytics />
              <SpeedInsights />
            </Providers>
          }
        >
          {userId ? (
            <LayoutData userId={userId}>
              {({ unreadCount, hideQuickLogFab }) => (
                <Providers session={session} hideQuickLogFab={hideQuickLogFab}>
                  <ProfilingHydrationMarker />
                  <AppLayout unreadCount={unreadCount} hideQuickLogFab={hideQuickLogFab}>
                    {children}
                  </AppLayout>
                  <Analytics />
                  <SpeedInsights />
                </Providers>
              )}
            </LayoutData>
          ) : (
            <Providers session={session} hideQuickLogFab={false}>
              <ProfilingHydrationMarker />
              <AppLayout unreadCount={0} hideQuickLogFab={false}>
                {children}
              </AppLayout>
              <Analytics />
              <SpeedInsights />
            </Providers>
          )}
        </Suspense>
      </body>
    </html>
  );
}
