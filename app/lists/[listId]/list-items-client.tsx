"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlbumCard } from "@/components/album-card";
import { TrackCard } from "@/components/track-card";
import { AddToListModal } from "@/components/add-to-list-modal";
import { useToast } from "@/components/toast";
import { queryKeys } from "@/lib/query-keys";
import type { ListItemEnriched } from "./page";

type ListData = {
  list: Record<string, unknown>;
  owner_username: string | null;
  items: ListItemEnriched[];
};

type OptimisticItem = ListItemEnriched & { _optimistic?: true };

type ListItemsClientProps = {
  initialItems: ListItemEnriched[];
  initialListData?: ListData | null;
  listId: string;
  listType: "album" | "song";
  isOwner: boolean;
};

async function fetchList(listId: string): Promise<ListData> {
  const res = await fetch(`/api/lists/${listId}`);
  if (!res.ok) throw new Error("Failed to load list");
  return res.json();
}

export function ListItemsClient({
  initialItems,
  initialListData,
  listId,
  listType,
  isOwner,
}: ListItemsClientProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const listItemsKey = queryKeys.listItems(listId);
  const [pendingAdd, setPendingAdd] = useState<OptimisticItem | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const { data: listData } = useQuery({
    queryKey: listItemsKey,
    queryFn: () => fetchList(listId),
    initialData: initialListData ?? undefined,
    staleTime: 30 * 1000,
  });

  const items = listData?.items ?? initialItems;
  const displayItems = pendingAdd ? [...items, pendingAdd] : items;

  const handleOptimisticAdd = (
    entityType: "album" | "song",
    entityId: string,
    album?: SpotifyApi.AlbumObjectSimplified,
    track?: SpotifyApi.TrackObjectSimplified | SpotifyApi.TrackObjectFull
  ) => {
    const opt: OptimisticItem = {
      id: `opt-${entityId}`,
      list_id: listId,
      entity_type: entityType,
      entity_id: entityId,
      position: items.length + 1,
      added_at: new Date().toISOString(),
      ...(album && { album }),
      ...(track && { track }),
      _optimistic: true,
    };
    setPendingAdd(opt);
    queryClient.setQueryData<ListData>(listItemsKey, (prev) =>
      prev ? { ...prev, items: [...prev.items, opt] } : prev
    );
  };

  const handleAddFailed = () => {
    setPendingAdd(null);
    queryClient.invalidateQueries({ queryKey: listItemsKey });
    toast("Action failed, please try again.");
  };

  const handleAdded = () => {
    setPendingAdd(null);
    queryClient.invalidateQueries({ queryKey: listItemsKey });
  };

  const removeMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const res = await fetch(`/api/lists/${listId}/items/${itemId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Remove failed");
    },
    onMutate: async (itemId) => {
      await queryClient.cancelQueries({ queryKey: listItemsKey });
      const previous = queryClient.getQueryData<ListData>(listItemsKey);
      queryClient.setQueryData<ListData>(listItemsKey, (prev) =>
        prev ? { ...prev, items: prev.items.filter((i) => i.id !== itemId) } : prev
      );
      return { previous };
    },
    onError: (_err, _itemId, context) => {
      if (context?.previous) queryClient.setQueryData(listItemsKey, context.previous);
      toast("Action failed, please try again.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: listItemsKey });
    },
  });

  const handleRemove = (item: ListItemEnriched) => {
    if (item.id.startsWith("opt-")) return;
    if (!confirm("Remove this item from the list?")) return;
    setRemovingId(item.id);
    removeMutation.mutate(item.id, {
      onSettled: () => setRemovingId(null),
    });
  };

  return (
    <>
      <section>
        <ul className="space-y-3">
          {displayItems.map((item, index) => (
            <li key={item.id} className="flex items-center gap-3">
              <span className="w-8 shrink-0 text-right text-sm text-zinc-500">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                {item.entity_type === "album" && (item.album || (item as OptimisticItem).album) ? (
                  <AlbumCard album={(item.album ?? (item as OptimisticItem).album)!} />
                ) : item.entity_type === "song" && (item.track || (item as OptimisticItem).track) ? (
                  <TrackCard
                    track={(item.track ?? (item as OptimisticItem).track)!}
                    showAlbum
                    songPageLink
                    showThumbnail
                  />
                ) : (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                    <p className="text-zinc-400">
                      {item.entity_type === "album" ? "Unknown album" : "Unknown track"}
                    </p>
                  </div>
                )}
              </div>
              {isOwner && (
                <button
                  type="button"
                  onClick={() => handleRemove(item)}
                  disabled={removingId === item.id}
                  className="shrink-0 rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-red-400 disabled:opacity-50"
                >
                  {removingId === item.id ? "Removing…" : "Remove"}
                </button>
              )}
            </li>
          ))}
        </ul>
        {isOwner && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="rounded-lg border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white"
            >
              Add another item
            </button>
          </div>
        )}
      </section>
      {showAddModal && (
        <AddToListModal
          listId={listId}
          listType={listType}
          onClose={() => setShowAddModal(false)}
          onAdded={handleAdded}
          onOptimisticAdd={handleOptimisticAdd}
          onAddFailed={handleAddFailed}
        />
      )}
    </>
  );
}
