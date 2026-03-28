import Link from "next/link";
import type { CommunityHeroTopArtist } from "@/lib/community/get-community-hero-data";

type Props = {
  name: string;
  description: string | null;
  isPrivate: boolean;
  memberCount: number;
  membersJoinedThisWeek: number;
  topThisWeek: CommunityHeroTopArtist[];
  backgroundImageUrls: string[];
  /** Toolbar actions — render top-right (Edit, Join, Joined, Leave, Sign in). */
  actions: React.ReactNode;
};

function HeroBackground({ imageUrls }: { imageUrls: string[] }) {
  const urls = imageUrls.slice(0, 6);
  if (urls.length === 0) {
    return (
      <div
        className="absolute inset-0 bg-gradient-to-br from-emerald-950/50 via-zinc-900/90 to-zinc-950"
        aria-hidden
      />
    );
  }

  const positions: { left: string; top: string; w: string; h: string }[] = [
    { left: "-8%", top: "-12%", w: "52%", h: "65%" },
    { left: "38%", top: "-18%", w: "48%", h: "58%" },
    { left: "12%", top: "38%", w: "45%", h: "55%" },
    { left: "52%", top: "32%", w: "52%", h: "62%" },
    { left: "-5%", top: "55%", w: "42%", h: "50%" },
    { left: "58%", top: "58%", w: "48%", h: "52%" },
  ];

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      {urls.map((url, i) => {
        const pos = positions[i % positions.length];
        return (
          <div
            key={`${url}-${i}`}
            className="absolute scale-110 opacity-[0.42] blur-3xl saturate-125"
            style={{
              left: pos.left,
              top: pos.top,
              width: pos.w,
              height: pos.h,
              backgroundImage: `url(${url})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
        );
      })}
      <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/20 via-zinc-950/80 to-zinc-950" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-zinc-950/40 to-black/50" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(16,185,129,0.12),transparent_55%)]" />
    </div>
  );
}

function formatGrowth(n: number): string {
  if (n <= 0) return "No new members this week";
  return `+${n} this week`;
}

export function CommunityHero({
  name,
  description,
  isPrivate,
  memberCount,
  membersJoinedThisWeek,
  topThisWeek,
  backgroundImageUrls,
  actions,
}: Props) {
  const descriptionText = description?.trim() ?? "";

  return (
    <div className="relative mb-10 w-full min-w-0 sm:mb-12">
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] shadow-[0_24px_80px_-20px_rgba(0,0,0,0.75)] sm:rounded-[1.75rem]">
        <HeroBackground imageUrls={backgroundImageUrls} />

        {/* Same horizontal rhythm as navbar / search row: px-4 sm:px-6 lg:px-8 */}
        <div className="relative z-10 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-9">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <Link
              href="/communities"
              className="inline-flex min-w-0 items-center gap-1.5 text-sm font-medium text-emerald-400/95 transition hover:text-emerald-300"
            >
              <span aria-hidden className="text-base leading-none">
                ←
              </span>
              Communities
            </Link>
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 sm:gap-2.5">
              {actions}
            </div>
          </div>

          <div className="mt-6 space-y-5 sm:mt-7">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl sm:leading-tight lg:text-[2.5rem] lg:leading-[1.12]">
                  {name}
                </h1>
                {isPrivate ? (
                  <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide text-zinc-300">
                    Private
                  </span>
                ) : null}
              </div>
              {descriptionText ? (
                <p className="max-w-2xl text-pretty text-base leading-relaxed text-zinc-300/95 sm:text-lg">
                  {descriptionText}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-zinc-400">
              <span className="font-medium text-zinc-200">
                {memberCount.toLocaleString()}{" "}
                <span className="font-normal text-zinc-400">
                  member{memberCount !== 1 ? "s" : ""}
                </span>
              </span>
              <span className="hidden sm:inline text-zinc-600" aria-hidden>
                ·
              </span>
              <span
                className={
                  membersJoinedThisWeek > 0
                    ? "text-emerald-400/95"
                    : "text-zinc-500"
                }
              >
                {formatGrowth(membersJoinedThisWeek)}
              </span>
            </div>

            {topThisWeek.length > 0 ? (
              <div className="rounded-2xl border border-white/[0.08] bg-zinc-950/35 px-4 py-3.5 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.45)] backdrop-blur-md sm:px-5 sm:py-4">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  Top this week
                </p>
                <ul className="mt-3 flex flex-wrap gap-4 sm:gap-5">
                  {topThisWeek.map((a) => (
                    <li key={a.id} className="flex min-w-0 items-center gap-3">
                      <Link
                        href={`/artist/${a.id}`}
                        className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border border-white/10 bg-zinc-800/80 shadow-inner ring-1 ring-white/[0.06] transition hover:ring-emerald-500/30"
                      >
                        {a.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={a.imageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-zinc-800 text-xs font-medium text-zinc-500">
                            ?
                          </div>
                        )}
                      </Link>
                      <div className="min-w-0">
                        <Link
                          href={`/artist/${a.id}`}
                          className="truncate font-medium text-zinc-100 transition hover:text-emerald-400"
                        >
                          {a.name}
                        </Link>
                        <p className="text-xs text-zinc-500">
                          {a.listens.toLocaleString()} listens
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/[0.08] bg-zinc-950/25 px-4 py-3 text-sm text-zinc-500 backdrop-blur-sm">
                Listening picks will appear here once members log music this
                week.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
