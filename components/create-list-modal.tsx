"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type CreateListModalProps = {
  onClose: () => void;
  onSuccess?: (listId: string) => void;
};

export function CreateListModal({ onClose, onSuccess }: CreateListModalProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const t = title.trim();
    if (!t) {
      setError("Title is required");
      return;
    }
    if (t.length > 100) {
      setError("Title must be 100 characters or less");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: t,
          description: description.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create list");
        return;
      }
      onSuccess?.(data.id);
      router.push(`/lists/${data.id}`);
      onClose();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-list-title"
    >
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
        <h2 id="create-list-title" className="text-lg font-semibold text-white">
          Create new list
        </h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="list-title" className="block text-sm font-medium text-zinc-300">
              Title
            </label>
            <input
              id="list-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              placeholder="My favorites"
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              required
            />
            <p className="mt-0.5 text-xs text-zinc-500">{title.length}/100</p>
          </div>
          <div>
            <label htmlFor="list-desc" className="block text-sm font-medium text-zinc-300">
              Description (optional)
            </label>
            <textarea
              id="list-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="A few words about this list..."
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {loading ? "Creating…" : "Create list"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
