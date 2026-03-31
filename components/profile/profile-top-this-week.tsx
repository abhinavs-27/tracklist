import Link from "next/link";
import { SectionBlock } from "@/components/layout/section-block";
import { TopThisWeekInteractive } from "@/components/profile/top-this-week-interactive";
import {
  getTopThisWeek,
  type TopThisWeekResult,
} from "@/lib/profile/top-this-week";
import { cardElevated } from "@/lib/ui/surface";

export async function ProfileTopThisWeekSection({
  userId,
  compact = false,
  prefetched,
}: {
  userId: string;
  compact?: boolean;
  /** When set (e.g. parent already awaited `getTopThisWeek`), skip duplicate fetch. */
  prefetched?: TopThisWeekResult | null;
}) {
  const data = prefetched ?? (await getTopThisWeek(userId));
  const max = compact ? 5 : 10;
  const tracks = data.tracks.slice(0, max);
  const artists = data.artists.slice(0, max);
  const albums = data.albums.slice(0, max);
  const empty =
    tracks.length === 0 && artists.length === 0 && albums.length === 0;

  return (
    <section id="top-week" className="scroll-mt-24">
      <SectionBlock
        title="Top this week"
        description={`${data.rangeLabel} · your most-played tracks and artists over the last seven days`}
        action={
          compact
            ? {
                label: "On your profile",
                href: `/profile/${userId}#top-week`,
              }
            : { label: "Weekly report", href: "/reports/week" }
        }
      >
        {empty ? (
          <div
            className={`${cardElevated} px-4 py-6 text-center text-sm text-zinc-500`}
          >
            No listens logged this week yet. Play music through Tracklist or sync
            Last.fm / Spotify to fill this in.
          </div>
        ) : (
          <TopThisWeekInteractive
            payload={{ tracks, artists, albums }}
          />
        )}

        {!compact ? (
          <p className="mt-4 text-xs text-zinc-600">
            Profile and Pulse use the last seven days; full reports can use calendar weeks.{" "}
            <Link href="/reports/listening" className="text-emerald-400/95 hover:underline">
              Pick a date range →
            </Link>
          </p>
        ) : null}
      </SectionBlock>
    </section>
  );
}
