"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";

type ListHeaderClientProps = {
  listId: string;
  initialTitle: string;
  initialDescription: string | null;
  initialVisibility: "public" | "friends" | "private";
};

export function ListHeaderClient({
  listId,
  initialTitle,
  initialDescription,
  initialVisibility,
}: ListHeaderClientProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [visibility, setVisibility] = useState(initialVisibility);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/lists/${listId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          visibility,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to save changes");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.listItems(listId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.list(listId) });
      setEditing(false);
      router.refresh();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to save changes");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/lists/${listId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to delete list");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.listItems(listId) });
      router.push("/feed");
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to delete list");
    },
  });

  const save = () => {
    if (!editing) return;
    setError("");
    saveMutation.mutate();
  };

  const remove = () => {
    if (!confirm("Delete this list? This cannot be undone.")) return;
    setError("");
    deleteMutation.mutate();
  };

  return (
    <div className="mt-3 space-y-3">
      {!editing && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setTitle(initialTitle);
              setDescription(initialDescription ?? "");
              setVisibility(initialVisibility);
              setError("");
              setEditing(true);
            }}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
          >
            Edit list
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={deleteMutation.isPending}
            className="rounded-lg border border-red-600 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-900/40 disabled:opacity-50"
          >
            {deleteMutation.isPending ? "Deleting…" : "Delete"}
          </button>
        </div>
      )}
      {editing && (
        <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-col gap-2">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="List title"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="Description (optional)"
              />
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-56">
              <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-2 text-xs text-zinc-300">
                <p className="mb-1 font-medium">Visibility</p>
                <div className="space-y-1">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="list-visibility"
                      value="public"
                      checked={visibility === "public"}
                      onChange={() => setVisibility("public")}
                    />
                    <span>Public</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="list-visibility"
                      value="friends"
                      checked={visibility === "friends"}
                      onChange={() => setVisibility("friends")}
                    />
                    <span>Friends only</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="list-visibility"
                      value="private"
                      checked={visibility === "private"}
                      onChange={() => setVisibility("private")}
                    />
                    <span>Private</span>
                  </label>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={save}
                  disabled={saveMutation.isPending}
                  className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {saveMutation.isPending ? "Saving…" : "Save changes"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTitle(initialTitle);
                    setDescription(initialDescription ?? "");
                    setVisibility(initialVisibility);
                    setError("");
                    setEditing(false);
                  }}
                  className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}

