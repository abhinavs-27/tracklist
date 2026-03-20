import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getServerSession } from "next-auth";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Navbar } from "@/components/navbar";
import { ProfilingHydrationMarker } from "@/components/profiling-hydration-marker";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
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
  description: "A Letterboxd for music. Log listens, rate albums and tracks, follow friends.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession(authOptions);
  return (
    <html lang="en" className="overflow-x-clip">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen overflow-x-clip bg-zinc-950 text-zinc-100 antialiased`}
      >
        <Providers session={session}>
          <ProfilingHydrationMarker />
          <Navbar />
          <main className="mx-auto w-full max-w-6xl min-w-0 px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </main>
          <Analytics />
          <SpeedInsights />
        </Providers>
      </body>
    </html>
  );
}
