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
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();

  let hideQuickLogFab = false;
  let unreadCount = 0;
  if (session?.user?.id) {
    const uid = session.user.id;
    try {
      const supabase = await createSupabaseServerClient();
      const [{ data: meRow }, unread] = await Promise.all([
        supabase
          .from("users")
          .select("lastfm_username")
          .eq("id", uid)
          .maybeSingle(),
        countUnreadNotifications(uid),
      ]);
      hideQuickLogFab = Boolean(
        (meRow as { lastfm_username?: string | null } | null)?.lastfm_username?.trim(),
      );
      unreadCount = unread;
    } catch {
      hideQuickLogFab = false;
      try {
        unreadCount = await countUnreadNotifications(uid);
      } catch {
        unreadCount = 0;
      }
    }
  }

  return (
    <html lang="en" className="overflow-x-clip">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen overflow-x-clip bg-zinc-950 font-sans text-zinc-100 antialiased`}
      >
        <Providers session={session} hideQuickLogFab={hideQuickLogFab}>
          <ProfilingHydrationMarker />
          <AppLayout unreadCount={unreadCount} hideQuickLogFab={hideQuickLogFab}>
            {children}
          </AppLayout>
          <Analytics />
          <SpeedInsights />
        </Providers>
      </body>
    </html>
  );
}
