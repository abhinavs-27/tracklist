import Link from "next/link";
import type { CommunityHeroTopArtist } from "@/lib/community/get-community-hero-data";
import {
  communityBody,
  communityInset,
  communityMeta,
  communityMetaLabel,
  pageTitle,
} from "@/lib/ui/surface";

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
    <div className="relative mb-8 w-full min-w-0 sm:mb-10">
      <div className="relative overflow-hidden rounded-2xl shadow-[0_24px_80px_-20px_rgba(0,0,0,0.75)] ring-1 ring-white/[0.08] sm:rounded-[1.75rem]">
        <HeroBackground imageUrls={backgroundImageUrls} />

        <div className="relative z-10 border-b border-white/[0.07] bg-zinc-950/20 px-4 py-4 backdrop-blur-[2px] sm:px-6 sm:py-5 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
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

          <div className="mt-4 sm:mt-5">
            <div className="flex flex-wrap items-center gap-2.5 gap-y-2">
              <h1 className={`text-balance ${pageTitle}`}>{name}</h1>
              {isPrivate ? (
                <span
                  className={`shrink-0 rounded-full bg-white/[0.06] px-2.5 py-0.5 ring-1 ring-white/10 ${communityMeta} font-medium uppercase tracking-wide text-zinc-300`}
                >
                  Private
                </span>
              ) : null}
            </div>

            <p className={`mt-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 ${communityMeta}`}>
              <span className="text-zinc-400">
                <span className="font-semibold tabular-nums text-zinc-100">
                  {memberCount.toLocaleString()}
                </span>
                {" "}
                member{memberCount !== 1 ? "s" : ""}
              </span>
              {membersJoinedThisWeek > 0 ? (
                <>
                  <span className="text-zinc-700" aria-hidden>
                    ·
                  </span>
                  <span className="font-medium text-emerald-400/95">
                    +{membersJoinedThisWeek} new this week
                  </span>
                </>
              ) : null}
            </p>

            {descriptionText ? (
              <p className={`mt-3 max-w-2xl text-pretty sm:mt-4 ${communityBody}`}>
                {descriptionText}
              </p>
            ) : null}
          </div>
        </div>

        <div className="relative z-10 px-4 pb-4 pt-3 sm:px-6 sm:pb-5 sm:pt-4 lg:px-8">
          {topThisWeek.length > 0 ? (
            <div>
              <p className={communityMetaLabel}>Top this week</p>
              <ul className="mt-2.5 flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] sm:gap-3">
                {topThisWeek.map((a) => (
                  <li key={a.id} className="shrink-0">
                    <Link
                      href={`/artist/${a.id}`}
                      className={`flex items-center gap-2.5 rounded-xl py-1 pr-3 pl-1 transition ${communityInset} hover:bg-zinc-900/50 hover:ring-emerald-500/20`}
                    >
                      <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-zinc-800/80 ring-1 ring-white/10">
                        {a.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={a.imageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-xs text-zinc-500">
                            ?
                          </span>
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block max-w-[10rem] truncate font-medium text-zinc-100 sm:max-w-[12rem]">
                          {a.name}
                        </span>
                        <span className={communityMeta}>
                          {a.listens.toLocaleString()} listens
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div
              className={`rounded-xl bg-zinc-950/30 px-3 py-2.5 ring-1 ring-dashed ring-white/[0.08] ${communityBody} text-zinc-500`}
            >
              Listening picks will appear once members log music this week.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
