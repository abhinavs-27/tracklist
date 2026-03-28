"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  communityBody,
  communityButton,
  communityCard,
  communityMeta,
} from "@/lib/ui/surface";

type EntityTab = "track" | "album" | "artist";
type RangeTab = "week" | "month" | "all";

export type ConsensusApiItem = {
  entityId: string;
  name: string;
  image: string | null;
  uniqueListeners: number;
  cappedPlays: number;
  totalPlays: number;
  score: number;
  albumId?: string | null;
};

const ENTITY_TABS: { value: EntityTab; label: string }[] = [
  { value: "track", label: "Songs" },
  { value: "album", label: "Albums" },
  { value: "artist", label: "Artists" },
];

const RANGE_TABS: { value: RangeTab; label: string }[] = [
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "all", label: "All time" },
];

function itemHref(type: EntityTab, row: ConsensusApiItem): string | null {
  if (type === "track") {
    if (row.albumId) return `/album/${row.albumId}`;
    return null;
  }
  if (type === "album") return `/album/${row.entityId}`;
  return `/artist/${row.entityId}`;
}

const PAGE_SIZE = 10;

export function CommunityConsensusSection({
  communityId,
  embedded = false,
}: {
  communityId: string;
  /** When true, omits outer card shell (use inside a collapsible). */
  embedded?: boolean;
}) {
  const [entity, setEntity] = useState<EntityTab>("track");
  const [range, setRange] = useState<RangeTab>("week");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ConsensusApiItem[]>([]);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [communityId]);

  const fetchPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const offset = (page - 1) * PAGE_SIZE;
      const q = new URLSearchParams({
        type: entity,
        range,
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      const res = await fetch(
        `/api/communities/${encodeURIComponent(communityId)}/consensus?${q}`,
        { cache: "no-store" },
      );
      const json = (await res.json().catch(() => null)) as
        | {
            items?: ConsensusApiItem[];
            hasMore?: boolean;
            error?: string;
          }
        | null;
      if (!res.ok) {
        setError(json?.error ?? "Could not load consensus");
        setItems([]);
        setHasNextPage(false);
        return;
      }
      setItems(json?.items ?? []);
      setHasNextPage(Boolean(json?.hasMore));
    } catch {
      setError("Could not load consensus");
      setItems([]);
      setHasNextPage(false);
    } finally {
      setLoading(false);
    }
  }, [entity, range, page, communityId]);

  useEffect(() => {
    void fetchPage();
  }, [fetchPage]);

  const rankBase = (page - 1) * PAGE_SIZE;

  const rowShell =
    "flex items-center gap-3 rounded-xl bg-zinc-950/40 px-3 py-2.5 ring-1 ring-white/[0.05] transition hover:bg-zinc-900/40 hover:ring-white/[0.08]";

  const consensusBody = (
    <>
      <div className="flex flex-wrap gap-2">
        {ENTITY_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => {
              setEntity(t.value);
              setPage(1);
            }}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              entity === t.value
                ? "bg-emerald-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {RANGE_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => {
              setRange(t.value);
              setPage(1);
            }}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
              range === t.value
                ? "bg-violet-600 text-white"
                : "bg-zinc-800/80 text-zinc-500 hover:bg-zinc-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className={`mt-3 ${communityBody} text-red-400`}>{error}</p>
      ) : null}

      <div className="mt-4" aria-busy={loading}>
        {loading ? (
          <ul className="space-y-2" aria-hidden>
            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
              <li
                key={i}
                className="flex animate-pulse items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2"
              >
                <div className="h-12 w-12 shrink-0 rounded bg-zinc-800" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-4 max-w-[70%] rounded bg-zinc-800" />
                  <div className="h-3 w-32 rounded bg-zinc-800/80" />
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {!loading && items.length === 0 ? (
          <p className={`${communityBody} text-zinc-500`}>No listens in this range yet.</p>
        ) : null}

        {!loading && items.length > 0 ? (
          <>
            <ol className="space-y-2">
              {items.map((row, i) => {
                const href = itemHref(entity, row);
                const inner = (
                  <>
                    <span className={`w-6 shrink-0 tabular-nums ${communityMeta}`}>
                      {rankBase + i + 1}
                    </span>
                    {row.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={row.image}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-zinc-800 text-zinc-500">
                        ♪
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className={`font-medium text-white ${communityBody}`}>{row.name}</p>
                      <p className={communityMeta}>
                        {row.uniqueListeners} member
                        {row.uniqueListeners !== 1 ? "s" : ""} listened
                        {row.totalPlays > 0 ? (
                          <span className="text-zinc-600">
                            {" "}
                            · {row.totalPlays.toLocaleString()} plays
                          </span>
                        ) : null}
                      </p>
                    </div>
                  </>
                );
                return (
                  <li key={`${row.entityId}-${i}`}>
                    {href ? (
                      <Link href={href} className={rowShell}>
                        {inner}
                      </Link>
                    ) : (
                      <div className={rowShell}>{inner}</div>
                    )}
                  </li>
                );
              })}
            </ol>

            <nav
              className="mt-6 flex flex-wrap items-center justify-center gap-3"
              aria-label="Consensus pagination"
            >
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={loading || page <= 1}
                className={`min-h-10 ${communityButton}`}
              >
                Previous
              </button>
              <span className={`min-w-[5rem] text-center tabular-nums ${communityBody} text-zinc-400`}>
                Page {page}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={loading || !hasNextPage}
                className={`min-h-10 ${communityButton}`}
              >
                Next
              </button>
            </nav>
          </>
        ) : null}
      </div>
    </>
  );

  return embedded ? (
    <div className="space-y-4">{consensusBody}</div>
  ) : (
    <section className={communityCard}>{consensusBody}</section>
  );
}
