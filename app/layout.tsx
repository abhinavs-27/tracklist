import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getServerSession } from "next-auth";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Navbar } from "@/components/navbar";
import { ProfilingHydrationMarker } from "@/components/profiling-hydration-marker";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { createSupabaseServerClient } from "@/lib/supabase-server";
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
  const session = await getServerSession(authOptions);

  let hideQuickLogFab = false;
  if (session?.user?.id) {
    try {
      const supabase = await createSupabaseServerClient();
      const { data: meRow } = await supabase
        .from("users")
        .select("lastfm_username")
        .eq("id", session.user.id)
        .maybeSingle();
      hideQuickLogFab = Boolean(
        (meRow as { lastfm_username?: string | null } | null)?.lastfm_username?.trim(),
      );
    } catch {
      hideQuickLogFab = false;
    }
  }

  const mainPaddingBottom = hideQuickLogFab
    ? "pb-6 sm:pb-8"
    : "pb-24";

  return (
    <html lang="en" className="overflow-x-clip">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen overflow-x-clip bg-zinc-950 text-zinc-100 antialiased`}
      >
        <Providers session={session} hideQuickLogFab={hideQuickLogFab}>
          <ProfilingHydrationMarker />
          <Navbar />
          <main
            className={`mx-auto w-full max-w-6xl min-w-0 px-4 pt-6 sm:px-6 lg:px-8 ${mainPaddingBottom}`}
          >
            {children}
          </main>
          <Analytics />
          <SpeedInsights />
        </Providers>
      </body>
    </html>
  );
}
