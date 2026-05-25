import Link from "next/link";
import { getAlbumFriendLeaderboard, type AlbumLeaderboardEntry } from "@/lib/queries";

export async function AlbumFriendLeaderboard({
  viewerId,
  albumId,
}: {
  viewerId: string;
  albumId: string;
}) {
  const entries = await getAlbumFriendLeaderboard(viewerId, albumId);
  if (!entries || entries.length < 2) return null;

  const max = entries[0]?.playCount ?? 1;

  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold text-white">Among your friends</h2>
      <ul className="space-y-3">
        {entries.map((entry, i) => (
          <LeaderboardRow key={entry.userId} entry={entry} rank={i + 1} max={max} />
        ))}
      </ul>
    </section>
  );
}

function LeaderboardRow({
  entry,
  rank,
  max,
}: {
  entry: AlbumLeaderboardEntry;
  rank: number;
  max: number;
}) {
  const pct = Math.max(4, Math.round((entry.playCount / max) * 100));
  const isViewer = entry.isViewer;

  return (
    <li className={`group relative rounded-2xl px-4 py-3 transition ${
      isViewer
        ? "bg-gold-950/40 ring-1 ring-gold-500/20"
        : "bg-zinc-900/40 ring-1 ring-white/[0.04]"
    }`}>
      <div className="flex items-center gap-3">
        <span className={`w-5 shrink-0 text-center text-sm font-bold tabular-nums ${
          rank === 1 ? "text-amber-400" : "text-zinc-600"
        }`}>
          {rank}
        </span>
        <Link href={`/profile/${entry.userId}`} className="shrink-0">
          {entry.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={entry.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover ring-1 ring-white/10" />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold text-zinc-300 ring-1 ring-white/10">
              {entry.username[0]?.toUpperCase() ?? "?"}
            </span>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <Link
              href={`/profile/${entry.userId}`}
              className={`truncate text-sm font-medium hover:underline ${
                isViewer ? "text-gold-300" : "text-zinc-200"
              }`}
            >
              {isViewer ? "You" : entry.username}
            </Link>
            <span className={`shrink-0 text-xs tabular-nums font-medium ${
              isViewer ? "text-gold-400" : "text-zinc-500"
            }`}>
              {entry.playCount.toLocaleString()} {entry.playCount === 1 ? "play" : "plays"}
            </span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-800/60">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isViewer ? "bg-gold-500" : "bg-zinc-500"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
    </li>
  );
}
