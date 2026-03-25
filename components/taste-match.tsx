"use client";

import Link from "next/link";
import { useState } from "react";
import type { TasteMatchResponse } from "@/types";

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
        throw new Error(body?.error || `Taste match failed (${res.status})`);
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
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Taste match</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Compare top artists and genres from your taste identities.
          </p>
        </div>

        <button
          type="button"
          onClick={onCompare}
          disabled={loading || !canQuery}
          className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-emerald-500/70"
        >
          {loading ? "Comparing…" : "Compare taste"}
        </button>
      </div>

      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}

      {data ? (
        <div className="mt-5 space-y-5">
          {data.insufficientData ? (
            <p className="text-sm text-zinc-400">{data.summary}</p>
          ) : (
            <>
              <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  Match score
                </p>
                <p
                  className="mt-1 text-4xl font-bold tabular-nums text-white"
                  data-testid="taste-score"
                >
                  {data.score}
                  <span className="text-lg font-semibold text-zinc-500">%</span>
                </p>
                <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                  {data.summary}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/30 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                    Artist overlap
                  </p>
                  <p className="text-lg font-semibold tabular-nums text-emerald-400">
                    {data.overlapScore}%
                  </p>
                </div>
                <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/30 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                    Genre overlap
                  </p>
                  <p className="text-lg font-semibold tabular-nums text-violet-400">
                    {data.genreOverlapScore}%
                  </p>
                </div>
                <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/30 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                    Discovery (them → you)
                  </p>
                  <p className="text-lg font-semibold tabular-nums text-amber-400">
                    {data.discoveryScore}%
                  </p>
                  <p className="text-[10px] text-zinc-600">
                    Their top artists you don’t share
                  </p>
                </div>
              </div>

              {data.sharedArtists.length > 0 ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Shared artists
                  </p>
                  <ul className="mt-2 space-y-2">
                    {data.sharedArtists.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center gap-3 rounded-lg border border-zinc-800/60 bg-zinc-950/30 px-2 py-2"
                      >
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-zinc-800">
                          {a.imageUrl ? (
                            <img
                              src={a.imageUrl}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-zinc-600">
                              ♪
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-zinc-100">
                            {a.name}
                          </p>
                          <p className="text-xs text-zinc-500">
                            You {a.listenCountUserA} · Them{" "}
                            {a.listenCountUserB} plays
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {data.sharedGenres.length > 0 ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Overlapping genres
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {data.sharedGenres.map((g) => (
                      <li
                        key={g.name}
                        className="rounded-full border border-zinc-700 bg-zinc-900/50 px-3 py-1 text-xs text-zinc-300"
                      >
                        {g.name}{" "}
                        <span className="text-zinc-500">
                          ({g.weightUserA}% / {g.weightUserB}%)
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
