"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AddToListModal } from "@/components/add-to-list-modal";
import { queryKeys } from "@/lib/query-keys";

type ListDetailClientProps = {
  listId: string;
  listType: "album" | "song";
  itemId?: string;
  triggerLabel?: string;
};

export function ListDetailClient({
  listId,
  listType,
  itemId,
  triggerLabel,
}: ListDetailClientProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);

  const removeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/lists/${listId}/items/${itemId!}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Remove failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.listItems(listId) });
      router.refresh();
    },
  });

  const handleAdded = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.listItems(listId) });
    router.refresh();
  };

  if (itemId != null) {
    return (
      <button
        type="button"
        onClick={() => {
          if (!confirm("Remove this item from the list?")) return;
          removeMutation.mutate();
        }}
        disabled={removeMutation.isPending}
        className="shrink-0 rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-red-400 disabled:opacity-50"
      >
        {removeMutation.isPending ? "Removing…" : "Remove"}
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowAddModal(true)}
        className="rounded-lg border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white"
      >
        {triggerLabel ?? "Add item"}
      </button>
      {showAddModal && (
        <AddToListModal
          listId={listId}
          listType={listType}
          onClose={() => setShowAddModal(false)}
          onAdded={handleAdded}
        />
      )}
    </>
  );
}
