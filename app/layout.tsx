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
  children: (data: { unreadCount: number }) => React.ReactNode;
}) {
  let unreadCount = 0;
  try {
    const supabase = await createSupabaseServerClient();
    unreadCount = await countUnreadNotifications(userId, supabase);
  } catch {
    try {
      unreadCount = await countUnreadNotifications(userId);
    } catch {
      unreadCount = 0;
    }
  }

  return <>{children({ unreadCount })}</>;
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
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen overflow-x-clip bg-background font-sans text-zinc-100 antialiased`}
      >
        <Suspense
          fallback={
            <Providers session={session}>
              <ProfilingHydrationMarker />
              <AppLayout unreadCount={0}>
                {children}
              </AppLayout>
              <Analytics />
              <SpeedInsights />
            </Providers>
          }
        >
          {userId ? (
            <LayoutData userId={userId}>
              {({ unreadCount }) => (
                <Providers session={session}>
                  <ProfilingHydrationMarker />
                  <AppLayout unreadCount={unreadCount}>
                    {children}
                  </AppLayout>
                  <Analytics />
                  <SpeedInsights />
                </Providers>
              )}
            </LayoutData>
          ) : (
            <Providers session={session}>
              <ProfilingHydrationMarker />
              <AppLayout unreadCount={0}>
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
