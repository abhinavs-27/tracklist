import Link from "next/link";
import { getExploreDiscoverStaticPayload } from "@/lib/explore-discover-static";
import { isSocialInboxAndMusicRecUiEnabled } from "@/lib/feature-social-music-rec-ui";

type Props = {
  userId: string | null;
};

export function ExploreDiscoverSection({ userId }: Props) {
  const d = getExploreDiscoverStaticPayload();
  const socialMusicUi = isSocialInboxAndMusicRecUiEnabled();

  return (
    <div className="rounded-2xl bg-zinc-900/40 p-5 ring-1 ring-white/[0.06] sm:p-6">
      <p className="text-sm leading-relaxed text-zinc-400">{d.description}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        {d.links.map((link) => {
          if (link.href === "/discover/recommended" && (!socialMusicUi || !userId)) {
            return null;
          }
          const isPrimary = link.variant === "primary";
          return (
            <Link
              key={link.href}
              href={link.href}
              className={
                isPrimary
                  ? "inline-flex rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500"
                  : "inline-flex rounded-xl bg-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-200 ring-1 ring-white/[0.08] transition hover:bg-zinc-700"
              }
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
