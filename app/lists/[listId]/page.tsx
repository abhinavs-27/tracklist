import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getList } from "@/lib/queries";
import { getOrFetchAlbum } from "@/lib/spotify-cache";
import { getOrFetchTrack } from "@/lib/spotify-cache";
import { ListDetailClient } from "./list-detail-client";
import { ListHeaderClient } from "./list-header-client";
import { ListItemsClient } from "./list-items-client";

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
  const session = await getSession();
  const data = await getList(listId);
  if (!data) notFound();

  const enriched: ListItemEnriched[] = await Promise.all(
    data.items.map(async (item) => {
      try {
        if (item.entity_type === "album") {
          const { album } = await getOrFetchAlbum(item.entity_id, {
            allowNetwork: true,
          });
          return { ...item, album: album as SpotifyApi.AlbumObjectSimplified };
        }
        const { track } = await getOrFetchTrack(item.entity_id, {
          allowNetwork: true,
        });
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
      <header className="space-y-3">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {data.list.title}
          </h1>
          {data.list.description ? (
            <p className="mt-1 text-zinc-400">{data.list.description}</p>
          ) : null}
          <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500">
            {data.list.type === "song" ? "Song list" : "Album list"} ·{" "}
            {data.list.visibility === "public"
              ? "Public"
              : data.list.visibility === "friends"
                ? "Friends only"
                : "Private"}
          </p>
        </div>
        <p className="mt-2 text-sm text-zinc-500">
            {data.owner_username ? (
              <>
                By{" "}
                <Link
                  href={`/profile/${data.list.user_id}`}
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
          <ListHeaderClient
            listId={listId}
            initialTitle={data.list.title}
            initialDescription={data.list.description}
            initialVisibility={data.list.visibility}
          />
        )}
      </header>

      {enriched.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
          <p className="text-zinc-400">
            {data.list.type === "song"
              ? "This song list is empty. Add your first track."
              : "This album list is empty. Add your first album."}
          </p>
          {isOwner && (
            <div className="mt-4">
              <ListDetailClient
                listId={listId}
                listType={data.list.type}
                triggerLabel="Add item"
              />
            </div>
          )}
        </div>
      ) : (
        <ListItemsClient
          initialItems={enriched}
          initialListData={{ list: data.list, owner_username: data.owner_username, items: enriched }}
          listId={listId}
          listType={data.list.type}
          isOwner={isOwner}
        />
      )}
    </div>
  );
}
