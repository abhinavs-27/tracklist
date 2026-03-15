"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlbumCard } from "@/components/album-card";
import { TrackCard } from "@/components/track-card";
import { AddToListModal } from "@/components/add-to-list-modal";
import { useToast } from "@/components/toast";
import type { ListItemEnriched } from "./page";

type OptimisticItem = {
  id: string;
  entity_type: "album" | "song";
  entity_id: string;
  album?: SpotifyApi.AlbumObjectSimplified;
  track?: SpotifyApi.TrackObjectSimplified | SpotifyApi.TrackObjectFull;
  _optimistic: true;
};

type ListItemsClientProps = {
  initialItems: ListItemEnriched[];
  listId: string;
  listType: "album" | "song";
  isOwner: boolean;
};

export function ListItemsClient({
  initialItems,
  listId,
  listType,
  isOwner,
}: ListItemsClientProps) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState<ListItemEnriched[]>(initialItems);
  const [pendingAdd, setPendingAdd] = useState<OptimisticItem | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  const displayItems = pendingAdd ? [...items, pendingAdd] : items;

  const handleOptimisticAdd = (
    entityType: "album" | "song",
    entityId: string,
    album?: SpotifyApi.AlbumObjectSimplified,
    track?: SpotifyApi.TrackObjectSimplified | SpotifyApi.TrackObjectFull
  ) => {
    setPendingAdd({
      id: `opt-${entityId}`,
      entity_type: entityType,
      entity_id: entityId,
      ...(album && { album }),
      ...(track && { track }),
      _optimistic: true,
    });
  };

  const handleAddFailed = () => {
    setPendingAdd(null);
    toast("Action failed, please try again.");
  };

  const handleAdded = () => {
    setPendingAdd(null);
    router.refresh();
  };

  const handleRemove = async (item: ListItemEnriched) => {
    if (item.id.startsWith("opt-")) return;
    if (!confirm("Remove this item from the list?")) return;
    const removed = item;
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setRemovingId(item.id);
    try {
      const res = await fetch(`/api/lists/${listId}/items/${item.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setItems((prev) => [...prev, removed]);
        toast("Action failed, please try again.");
      } else {
        router.refresh();
      }
    } catch {
      setItems((prev) => [...prev, removed]);
      toast("Action failed, please try again.");
    } finally {
      setRemovingId(null);
    }
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
