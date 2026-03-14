import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getList } from "@/lib/queries";
import { getOrFetchAlbum } from "@/lib/spotify-cache";
import { getOrFetchTrack } from "@/lib/spotify-cache";
import { AlbumCard } from "@/components/album-card";
import { TrackCard } from "@/components/track-card";
import { ListDetailClient } from "./list-detail-client";

type PageParams = Promise<{ listId: string }>;

export type ListItemEnriched = {
  id: string;
  list_id: string;
  entity_type: "album" | "song";
  entity_id: string;
  position: number;
  added_at: string;
  album?: SpotifyApi.AlbumObjectSimplified;
  track?: SpotifyApi.TrackObjectSimplified | SpotifyApi.TrackObjectFull;
};

export default async function ListDetailPage({ params }: { params: PageParams }) {
  const { listId } = await params;
  const session = await getServerSession(authOptions);
  const data = await getList(listId);
  if (!data) notFound();

  const enriched: ListItemEnriched[] = await Promise.all(
    data.items.map(async (item) => {
      try {
        if (item.entity_type === "album") {
          const { album } = await getOrFetchAlbum(item.entity_id);
          return { ...item, album: album as SpotifyApi.AlbumObjectSimplified };
        }
        const track = await getOrFetchTrack(item.entity_id);
        return { ...item, track };
      } catch (e) {
        console.warn(`[lists] Failed to fetch ${item.entity_type} ${item.entity_id}:`, e);
        return { ...item };
      }
    })
  );

  const isOwner = !!session?.user?.id && session.user.id === data.list.user_id;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white">{data.list.title}</h1>
        {data.list.description ? (
          <p className="mt-1 text-zinc-400">{data.list.description}</p>
        ) : null}
        <p className="mt-2 text-sm text-zinc-500">
          {data.owner_username ? (
            <>
              By{" "}
              <Link
                href={`/profile/${data.owner_username}`}
                className="text-emerald-400 hover:underline"
              >
                {data.owner_username}
              </Link>
            </>
          ) : (
            "By unknown"
          )}
        </p>
        {isOwner && (
          <div className="mt-3">
            <ListDetailClient listId={listId} />
          </div>
        )}
      </header>

      {enriched.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
          <p className="text-zinc-400">This list is empty. Add some albums or songs!</p>
          {isOwner && (
            <div className="mt-4">
              <ListDetailClient listId={listId} triggerLabel="Add item" />
            </div>
          )}
        </div>
      ) : (
        <section>
          <ul className="space-y-3">
            {enriched.map((item, index) => (
              <li key={item.id} className="flex items-center gap-3">
                <span className="w-8 shrink-0 text-right text-sm text-zinc-500">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  {item.entity_type === "album" && item.album ? (
                    <AlbumCard album={item.album} />
                  ) : item.entity_type === "song" && item.track ? (
                    <TrackCard
                      track={item.track}
                      showAlbum={true}
                      songPageLink
                      showThumbnail={true}
                    />
                  ) : (
                    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                      <p className="text-zinc-400">
                        {item.entity_type === 'album' ? 'Unknown album' : 'Unknown track'}
                      </p>
                    </div>
                  )}
                </div>
                {isOwner && (
                  <ListDetailClient
                    listId={listId}
                    itemId={item.id}
                    onRemoved={() => {}}
                  />
                )}
              </li>
            ))}
          </ul>
          {isOwner && (
            <div className="mt-4">
              <ListDetailClient listId={listId} triggerLabel="Add another item" />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
