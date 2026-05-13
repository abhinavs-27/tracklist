import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ProfilingHydrationMarker } from "@/components/profiling-hydration-marker";
import { getSession } from "@/lib/auth";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { LayoutData } from "@/components/layout/layout-data";

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

  return (
    <html lang="en" className="overflow-x-clip">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen overflow-x-clip bg-zinc-950 font-sans text-zinc-100 antialiased`}
      >
        <ProfilingHydrationMarker />
        <LayoutData session={session}>
          {children}
        </LayoutData>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
