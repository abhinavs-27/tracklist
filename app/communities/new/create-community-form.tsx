"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CreateCommunityForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/communities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description.trim() || null,
          is_private: isPrivate,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "Could not create");
        return;
      }
      const id = (data as { community?: { id: string } }).community?.id;
      if (id) router.push(`/communities/${id}`);
      else router.push("/communities");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-zinc-300">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={2}
          maxLength={120}
          className="mt-2 w-full rounded-2xl bg-zinc-900/70 px-4 py-3 text-white shadow-inner shadow-black/20 ring-1 ring-inset ring-white/[0.08] placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          placeholder="e.g. Indie heads SF"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-zinc-300">
          Description (optional)
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="mt-2 w-full rounded-2xl bg-zinc-900/70 px-4 py-3 text-white shadow-inner shadow-black/20 ring-1 ring-inset ring-white/[0.08] placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          placeholder="What’s this group about?"
        />
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
        <input
          type="checkbox"
          checked={isPrivate}
          onChange={(e) => setIsPrivate(e.target.checked)}
          className="rounded border-zinc-600"
        />
        Private (invite-only)
      </label>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <button
        type="submit"
        disabled={loading || name.trim().length < 2}
        className="w-full rounded-2xl bg-emerald-600 py-3.5 text-base font-semibold text-white shadow-lg shadow-emerald-950/30 transition hover:bg-emerald-500 disabled:opacity-50"
      >
        {loading ? "Creating…" : "Create"}
      </button>
    </form>
  );
}
