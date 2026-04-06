"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SectionBlock } from "@/components/layout/section-block";
import type {
  ExploreCommunityContrastRow,
  ExploreDiscoveryBundle,
  ExploreDiscoveryReviewEntityItem,
  ExploreDiscoveryTrackItem,
  ExploreMovement,
  ExploreRangeParam,
} from "@/lib/explore-discovery-data";

function MovementBadges({ movement }: { movement: ExploreMovement }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {movement.badge === "new" ? (
        <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300 ring-1 ring-amber-500/25">
          New
        </span>
      ) : null}
      {movement.badge === "hot" ? (
        <span className="rounded-md bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-300 ring-1 ring-rose-500/25">
          Hot
        </span>
      ) : null}
      {movement.rank_delta != null && movement.rank_delta !== 0 ? (
        <span
          className={
            movement.rank_delta > 0
              ? "text-[11px] font-semibold text-emerald-400"
              : "text-[11px] font-medium text-zinc-500"
          }
        >
          {movement.rank_delta > 0
            ? `↑${movement.rank_delta}`
            : `↓${Math.abs(movement.rank_delta)}`}
        </span>
      ) : null}
    </span>
  );
}

function RangeToggle({
  value,
  onChange,
}: {
  value: ExploreRangeParam;
  onChange: (r: ExploreRangeParam) => void;
}) {
  return (
    <div
      className="flex w-full max-w-md rounded-xl bg-zinc-950/90 p-1 ring-1 ring-white/[0.08] sm:inline-flex sm:w-auto sm:max-w-none sm:shrink-0"
      role="group"
      aria-label="Time range for discovery"
    >
      {(
        [
          ["24h", "24h" as const, "24h", "Past 24 hours of activity"],
          ["week", "week" as const, "7 days", "Past 7 days of activity"],
        ] as const
      ).map(([key, v, label, ariaLabel]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(v)}
          title={ariaLabel}
          aria-label={ariaLabel}
          aria-pressed={value === v}
          className={
            value === v
              ? "min-h-11 flex-1 rounded-lg bg-zinc-100 px-2 py-2.5 text-center text-xs font-semibold text-zinc-900 shadow-sm sm:min-h-0 sm:flex-none sm:px-4 sm:py-2"
              : "min-h-11 flex-1 rounded-lg px-2 py-2.5 text-center text-xs font-medium text-zinc-400 transition hover:text-zinc-200 sm:min-h-0 sm:flex-none sm:px-4 sm:py-2"
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function TrackCard({
  item,
  large,
}: {
  item: ExploreDiscoveryTrackItem;
  large?: boolean;
}) {
  return (
    <Link
      href={item.href}
      className={
        large
          ? "flex w-[9.5rem] shrink-0 snap-start flex-col sm:w-[10.5rem]"
          : "flex w-[7.25rem] shrink-0 snap-start flex-col sm:w-32"
      }
    >
      <div className="overflow-hidden rounded-xl bg-zinc-800 ring-1 ring-white/[0.06]">
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image_url}
            alt=""
            className={
              large
                ? "aspect-square w-full object-cover"
                : "aspect-square w-full object-cover"
            }
          />
        ) : (
          <div className="flex aspect-square w-full items-center justify-center text-2xl text-zinc-600">
            ♪
          </div>
        )}
      </div>
      <div className="mt-2 flex min-h-[2.5rem] flex-col gap-1">
        <div className="flex items-start justify-between gap-1">
          <p className="line-clamp-2 text-xs font-semibold leading-snug text-white">
            {item.name}
          </p>
          <MovementBadges movement={item.movement} />
        </div>
        <p className="line-clamp-1 text-[0.65rem] text-zinc-500">
          {item.artist}
        </p>
        <p className="line-clamp-1 text-[0.65rem] text-zinc-400">
          {item.stat_label}
        </p>
      </div>
    </Link>
  );
}

function ReviewRow({ item }: { item: ExploreDiscoveryReviewEntityItem }) {
  const quote = "review_snippet" in item ? item.review_snippet : null;
  return (
    <Link
      href={item.href}
      className="flex gap-3 rounded-2xl bg-zinc-900/50 p-3 ring-1 ring-white/[0.06] transition hover:bg-zinc-900/70"
    >
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-zinc-800 ring-1 ring-white/[0.06]">
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image_url}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-600">
            ♪
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-white">
            {item.name}
          </p>
          <MovementBadges movement={item.movement} />
        </div>
        <p className="truncate text-xs text-zinc-500">{item.artist}</p>
        <p className="mt-1 text-xs text-zinc-400">{item.stat_label}</p>
        {quote ? (
          <p className="mt-2 line-clamp-2 text-xs italic leading-relaxed text-zinc-300">
            “{quote}”
          </p>
        ) : null}
      </div>
    </Link>
  );
}

function CommunityRow({ row }: { row: ExploreCommunityContrastRow }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-zinc-900/40 p-3 ring-1 ring-white/[0.06] sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          {row.community_name}
        </p>
        <p className="mt-0.5 truncate text-sm font-semibold text-white">
          #1 track this month
        </p>
      </div>
      <Link
        href={row.href}
        className="flex shrink-0 items-center gap-3 rounded-xl bg-zinc-950/50 p-2 ring-1 ring-white/[0.05] transition hover:ring-emerald-500/30"
      >
        {row.top_track_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.top_track_image}
            alt=""
            className="h-12 w-12 rounded-md object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-zinc-800 text-zinc-600">
            ♪
          </div>
        )}
        <div className="min-w-0">
          <p className="line-clamp-1 text-sm font-medium text-white">
            {row.top_track_name}
          </p>
          <span className="text-xs font-medium text-emerald-400/90">
            Open community →
          </span>
        </div>
      </Link>
    </div>
  );
}

export function ExploreDiscoveryFeedClient({
  initial,
}: {
  initial: ExploreDiscoveryBundle | null;
}) {
  const [range, setRange] = useState<ExploreRangeParam>("week");
  const [data, setData] = useState<ExploreDiscoveryBundle | null>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (r: ExploreRangeParam) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/explore/discovery-bundle?range=${r === "24h" ? "24h" : "week"}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("Failed to load");
      const json = (await res.json()) as ExploreDiscoveryBundle & {
        fetched_at?: string;
      };
      setData({
        range: json.range,
        blowing_up: json.blowing_up,
        most_talked_about: json.most_talked_about,
        most_loved: json.most_loved,
        hidden_gems: json.hidden_gems,
        across_communities: json.across_communities,
      });
    } catch {
      setError("Couldn’t refresh discovery. Try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initial) setData(initial);
  }, [initial]);

  const onRangeChange = useCallback(
    (r: ExploreRangeParam) => {
      setRange(r);
      void load(r);
    },
    [load],
  );

  const bundle = data;

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <p className="max-w-xl text-sm leading-relaxed text-zinc-400">
          Live picks from listens, reviews, saves, and communities.
        </p>
        <div className="flex w-full flex-col gap-1.5 sm:w-auto sm:items-end">
          <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 sm:text-right">
            Window
          </span>
          <RangeToggle value={range} onChange={onRangeChange} />
        </div>
      </div>

      {error ? (
        <p className="rounded-xl bg-red-950/40 px-4 py-3 text-sm text-red-200 ring-1 ring-red-500/20">
          {error}
        </p>
      ) : null}

      {loading && !bundle ? (
        <p className="text-sm text-zinc-500">Loading discovery…</p>
      ) : null}

      {bundle ? (
        <>
          <SectionBlock
            title="Blowing up"
            description="Fastest-rising tracks"
            action={{ label: "Charts →", href: "/discover" }}
          >
            {bundle.blowing_up.length === 0 ? (
              <EmptyHint />
            ) : (
              <div className="-mx-1 flex gap-3 overflow-x-auto overscroll-x-contain pb-1 pt-0.5 px-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {bundle.blowing_up.map((item) => (
                  <TrackCard key={item.id} item={item} large />
                ))}
              </div>
            )}
          </SectionBlock>

          <SectionBlock
            title="Most talked about"
            description="Albums and songs sparking the most reviews."
            action={{ label: "Browse charts →", href: "/discover" }}
          >
            {bundle.most_talked_about.length === 0 ? (
              <EmptyHint />
            ) : (
              <div className="space-y-2">
                {bundle.most_talked_about.map((item) => (
                  <ReviewRow key={`${item.kind}-${item.id}`} item={item} />
                ))}
              </div>
            )}
          </SectionBlock>

          <SectionBlock
            title="Most loved"
            description="Saves, repeat listens, and momentum."
          >
            {bundle.most_loved.length === 0 ? (
              <EmptyHint />
            ) : (
              <div className="-mx-1 flex gap-3 overflow-x-auto overscroll-x-contain pb-1 pt-0.5 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {bundle.most_loved.map((item) => (
                  <TrackCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </SectionBlock>

          <SectionBlock
            title="Hidden gems"
            description="Strong ratings and engagement without huge play counts."
          >
            {bundle.hidden_gems.length === 0 ? (
              <EmptyHint />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {bundle.hidden_gems.map((item) => (
                  <div
                    key={`${item.kind}-${item.id}`}
                    className="flex gap-3 rounded-2xl bg-zinc-900/40 p-3 ring-1 ring-white/[0.06]"
                  >
                    <Link
                      href={item.href}
                      className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl ring-1 ring-white/[0.06]"
                    >
                      {item.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.image_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-zinc-800 text-zinc-600">
                          ♪
                        </div>
                      )}
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link href={item.href} className="block">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-semibold text-white">
                            {item.name}
                          </p>
                          <MovementBadges movement={item.movement} />
                        </div>
                        <p className="truncate text-xs text-zinc-500">
                          {item.artist}
                        </p>
                        <p className="mt-1 text-xs text-zinc-400">
                          {item.stat_label}
                        </p>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionBlock>

          <SectionBlock
            title="Across communities"
            description="Each group’s #1 track — see how taste diverges."
            action={{ label: "Communities →", href: "/communities" }}
          >
            {bundle.across_communities.length === 0 ? (
              <p className="rounded-2xl bg-zinc-900/40 px-4 py-6 text-center text-sm text-zinc-500 ring-1 ring-white/[0.06]">
                No public community charts yet — open the Communities tab to
                join one.
              </p>
            ) : (
              <div className="space-y-3">
                {bundle.across_communities.map((row) => (
                  <CommunityRow key={row.community_id} row={row} />
                ))}
              </div>
            )}
          </SectionBlock>
        </>
      ) : null}

      <SectionBlock
        title="Classic leaderboard"
        description="All-time popular songs and albums — the original charts."
        action={{ label: "Open leaderboard →", href: "/leaderboard" }}
      >
        <Link
          href="/leaderboard"
          className="block rounded-2xl bg-gradient-to-br from-emerald-950/40 to-zinc-900/60 p-5 ring-1 ring-emerald-500/15 transition hover:ring-emerald-500/35 sm:p-6"
        >
          <p className="text-sm text-zinc-300">
            Prefer ranked lists? Jump to global most-played and top-rated
            leaderboards anytime.
          </p>
          <span className="mt-3 inline-flex text-sm font-semibold text-emerald-400">
            Go to leaderboard →
          </span>
        </Link>
      </SectionBlock>

      <SectionBlock
        title="More charts"
        description="Trending strips, rising artists, and hidden gems in one place."
        action={{ label: "Discover →", href: "/discover" }}
      >
        <Link
          href="/discover"
          className="block rounded-2xl bg-zinc-900/40 p-5 ring-1 ring-white/[0.06] transition hover:bg-zinc-900/60 sm:p-6"
        >
          <p className="text-sm text-zinc-400">
            The Discover page still hosts full trending, rising artist, and gem
            sections.
          </p>
          <span className="mt-3 inline-flex text-sm font-medium text-emerald-400">
            Open Discover →
          </span>
        </Link>
      </SectionBlock>
    </div>
  );
}

function EmptyHint() {
  return (
    <p className="rounded-2xl bg-zinc-900/40 px-4 py-6 text-center text-sm text-zinc-500 ring-1 ring-white/[0.06]">
      Not enough activity in this window yet — try &quot;This week&quot; or
      check back soon.
    </p>
  );
}
