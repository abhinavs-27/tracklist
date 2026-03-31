"use client";

import Link from "next/link";
import { useState } from "react";
import type { TasteMatchResponse } from "@/types";
import { TasteCard } from "@/components/taste-card";

export function TasteMatchSection({
  profileUserId,
  viewerUserId,
}: {
  profileUserId: string;
  viewerUserId?: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TasteMatchResponse | null>(null);

  const canQuery =
    Boolean(viewerUserId?.trim()) &&
    Boolean(profileUserId.trim()) &&
    viewerUserId !== profileUserId;

  async function onCompare() {
    setError(null);
    setLoading(true);
    setData(null);

    try {
      if (!canQuery) {
        throw new Error("Sign in to compare taste with this profile.");
      }

      const res = await fetch(
        `/api/taste-match?userB=${encodeURIComponent(profileUserId)}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error || "Couldn’t load taste comparison");
      }
      const json = (await res.json()) as TasteMatchResponse;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to compare taste");
    } finally {
      setLoading(false);
    }
  }

  if (!viewerUserId) {
    return (
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
        <h2 className="text-lg font-semibold text-white">Taste match</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Sign in to see how your listening overlaps with this profile.
        </p>
        <Link
          href="/auth/signin"
          className="mt-3 inline-flex rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
        >
          Sign in
        </Link>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/25 p-5 shadow-lg shadow-black/20 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-white sm:text-xl">
            Taste match
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Compare overlap, differences, and discovery — then connect.
          </p>
        </div>

        <button
          type="button"
          onClick={onCompare}
          disabled={loading || !canQuery}
          className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-black transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-emerald-500/70"
        >
          {loading ? "Comparing…" : "Compare taste"}
        </button>
      </div>

      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}

      {data ? (
        <div className="mt-6 sm:mt-8">
          <TasteCard
            mode="compare"
            match={data}
            youLabel="You"
            themLabel="Them"
            profileUserId={profileUserId}
          />
        </div>
      ) : null}
    </section>
  );
}
