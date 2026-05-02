import Link from "next/link";
import { feedAlbumCoverUrl } from "@/lib/feed-artwork";
import type { FeedActivity } from "@/types";

export type FriendArtCard = {
  albumArt: string;
  albumId: string;
  username: string;
  userId: string;
  albumName: string;
  artistName: string;
};

export function extractFriendArtCards(
  items: FeedActivity[],
  limit = 8,
): FriendArtCard[] {
  const cards: FriendArtCard[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    if (cards.length >= limit) break;

    if (item.type === "listen_session") {
      const art = feedAlbumCoverUrl(item.album);
      if (!art || !item.album_id || seen.has(item.album_id)) continue;
      seen.add(item.album_id);
      cards.push({
        albumArt: art,
        albumId: item.album_id,
        username: item.user?.username ?? "Someone",
        userId: item.user?.id ?? item.user_id,
        albumName: item.album?.name ?? "",
        artistName:
          item.artist_name ??
          item.album?.artists?.map((a) => a.name).join(", ") ??
          "",
      });
    } else if (item.type === "listen_sessions_summary") {
      const first = item.sessions[0];
      if (!first) continue;
      const art = feedAlbumCoverUrl(first.album);
      if (!art || !first.album_id || seen.has(first.album_id)) continue;
      seen.add(first.album_id);
      cards.push({
        albumArt: art,
        albumId: first.album_id,
        username: item.user?.username ?? "Someone",
        userId: item.user?.id ?? item.user_id,
        albumName: first.album?.name ?? "",
        artistName:
          first.artist_name ??
          first.album?.artists?.map((a) => a.name).join(", ") ??
          "",
      });
    }
  }

  return cards;
}

export function FriendActivityGrid({ cards }: { cards: FriendArtCard[] }) {
  if (cards.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
      {cards.map((card, i) => (
        <Link
          key={`${card.albumId}-${i}`}
          href={`/album/${card.albumId}`}
          className="group relative overflow-hidden rounded-2xl bg-zinc-900 ring-1 ring-white/[0.07] transition-all duration-300 hover:ring-white/[0.15] hover:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.7)] motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.99]"
        >
          <div className="aspect-square w-full overflow-hidden">
            <img
              src={card.albumArt}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.06]"
            />
          </div>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent p-3">
            <p className="truncate text-[13px] font-semibold leading-snug text-white">
              {card.albumName}
            </p>
            {card.artistName ? (
              <p className="mt-0.5 truncate text-[11px] text-zinc-400">
                {card.artistName}
              </p>
            ) : null}
            <p className="mt-1.5 truncate text-[10px] text-zinc-500">
              <span className="text-zinc-300">{card.username}</span>
              {" listened"}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
