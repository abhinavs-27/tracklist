import Link from "next/link";
import { cardRadius } from "@/lib/ui/surface";

/**
 * Curated demo list — art from Spotify CDN (`i.scdn.co`), matched per track via oEmbed.
 * Track ids: Hey Ya! 2PpruBYCo4H7WOBJ7Q2EwM · Around the World 1pKYYY0dkg23sQQXi0Q5zN ·
 * 3 7eusnHDVdvqjUGAigj77XC · DtMF 3sK8wGT43QFpWrvNQsrQya · Girl, so confusing 41krZZovstMJKeJZJtbL78
 */
const SAMPLE_FROM_LOGS_SNAPSHOT: {
  rank: number;
  title: string;
  artist: string;
  plays: number;
  imageUrl: string;
}[] = [
  {
    rank: 1,
    title: "Hey Ya!",
    artist: "Outkast",
    plays: 38,
    imageUrl:
      "https://i.scdn.co/image/ab67616d0000b2736e88eb6508fd94cd1b745ce2",
  },
  {
    rank: 2,
    title: "Around the World",
    artist: "Daft Punk",
    plays: 31,
    imageUrl:
      "https://i.scdn.co/image/ab67616d0000b2738ac778cc7d88779f74d33311",
  },
  {
    rank: 3,
    title: "3",
    artist: "Britney Spears",
    plays: 27,
    imageUrl:
      "https://i.scdn.co/image/ab67616d0000b273cb2d3892eaaee5bbee25af06",
  },
  {
    rank: 4,
    title: "DtMF",
    artist: "Bad Bunny",
    plays: 22,
    imageUrl:
      "https://i.scdn.co/image/ab67616d0000b273bbd45c8d36e0e045ef640411",
  },
  {
    rank: 5,
    title: "Girl, so confusing",
    artist: "Charli xcx",
    plays: 19,
    imageUrl:
      "https://i.scdn.co/image/ab67616d0000b273f88b43d15fd14e9525338b59",
  },
];

type Props = {
  signInHref?: string;
  variant?: "marketing" | "onboarding";
};

export function SampleWeeklyChartPreview({
  signInHref = "/auth/signin?callbackUrl=%2Fcharts",
  variant = "marketing",
}: Props) {
  const caption =
    variant === "onboarding"
      ? "Rough idea of the layout — yours fills in from what you actually play."
      : "Placeholder week with real cover art. Your list will be yours.";

  return (
    <div
      className={`overflow-hidden ${cardRadius} bg-zinc-900/50 ring-1 ring-white/[0.08]`}
    >
      <div className="border-b border-white/[0.06] bg-zinc-950/40 px-4 py-3 sm:px-5">
        <p className="text-xs font-medium uppercase tracking-wide text-amber-200/90">
          Weekly chart preview
        </p>
        <p className="mt-1 text-sm text-zinc-400">{caption}</p>
        {variant === "marketing" ? (
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Follow people and you&apos;ll see their listens in your feed; jump into a
            community if you want a shared chart on top of that.
          </p>
        ) : null}
      </div>
      <ol className="divide-y divide-white/[0.05]">
        {SAMPLE_FROM_LOGS_SNAPSHOT.map((row) => (
          <li
            key={row.rank}
            className="flex items-center gap-3 px-4 py-2.5 sm:px-5"
          >
            <span className="w-7 shrink-0 text-right text-sm font-semibold tabular-nums text-zinc-500">
              {row.rank}
            </span>
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-zinc-800 ring-1 ring-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element -- Spotify CDN; matches catalog hydration */}
              <img
                src={row.imageUrl}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{row.title}</p>
              <p className="truncate text-xs text-zinc-500">{row.artist}</p>
            </div>
            <span className="shrink-0 text-xs tabular-nums text-zinc-400">
              {row.plays} plays
            </span>
          </li>
        ))}
      </ol>
      {variant === "marketing" ? (
        <div className="border-t border-white/[0.06] bg-zinc-950/30 px-4 py-3 text-center sm:px-5">
          <Link
            href={signInHref}
            className="text-sm font-medium text-emerald-400/95 hover:text-emerald-300 hover:underline"
          >
            Sign in to see your chart
          </Link>
        </div>
      ) : null}
    </div>
  );
}
