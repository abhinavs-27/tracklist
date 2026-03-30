"use client";

import { useCallback, useEffect, useState } from "react";
import type { SpotifySearchResponse } from "@/lib/spotify";

type Kind = "artist" | "album" | "track";

type Props = {
  recipientUserId: string;
  onClose: () => void;
  onSent?: () => void;
};

const kindLabel: Record<Kind, string> = {
  artist: "Artist",
  album: "Album",
  track: "Track",
};

export function SendRecommendationModal({
  recipientUserId,
  onClose,
  onSent,
}: Props) {
  const [kind, setKind] = useState<Kind>("artist");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SpotifySearchResponse | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(
    async (q: string, k: Kind) => {
      const trimmed = q.trim();
      if (!trimmed) {
        setResults(null);
        return;
      }
      setSearchLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}&type=${k}&limit=10`,
        );
        if (!res.ok) {
          setResults(null);
          return;
        }
        const data = (await res.json()) as SpotifySearchResponse;
        setResults(data);
      } catch {
        setResults(null);
      } finally {
        setSearchLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      if (query.trim()) search(query, kind);
      else setResults(null);
    }, 280);
    return () => clearTimeout(t);
  }, [query, kind, search]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function sendSelection(
    entityType: Kind,
    entityId: string,
    payload: {
      title?: string;
      subtitle?: string | null;
      imageUrl?: string | null;
      albumId?: string | null;
    },
  ) {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/recommendations/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientUserId,
          entityType,
          entityId,
          payload,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        throw new Error(data?.error || "Could not send");
      }
      onSent?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="send-rec-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-2xl border border-zinc-700/80 bg-zinc-900 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-zinc-800 px-5 py-4 sm:px-6">
          <h2
            id="send-rec-title"
            className="text-lg font-semibold tracking-tight text-white"
          >
            Send a recommendation
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Pick something from Spotify — they’ll get a notification with a link.
          </p>
        </div>

        <div className="flex shrink-0 gap-1 border-b border-zinc-800 px-4 py-3 sm:px-5">
          {(["artist", "album", "track"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k);
                setResults(null);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm ${
                kind === k
                  ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40"
                  : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
              }`}
            >
              {kindLabel[k]}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
          <label className="sr-only" htmlFor="send-rec-search">
            Search {kindLabel[kind]}
          </label>
          <input
            id="send-rec-search"
            type="search"
            autoFocus
            autoComplete="off"
            placeholder={`Search ${kindLabel[kind].toLowerCase()}s…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
          />

          {searchLoading ? (
            <p className="mt-4 text-center text-sm text-zinc-500">Searching…</p>
          ) : null}

          {!searchLoading && query.trim() && results ? (
            <ul className="mt-4 space-y-1">
              {kind === "artist" &&
                (results.artists?.items ?? []).map((a) => (
                  <ResultRow
                    key={a.id}
                    title={a.name}
                    subtitle={a.genres?.slice(0, 2).join(" · ") || "Artist"}
                    imageUrl={a.images?.[0]?.url ?? null}
                    disabled={sending}
                    onPick={() =>
                      sendSelection("artist", a.id, {
                        title: a.name,
                        subtitle: null,
                        imageUrl: a.images?.[0]?.url ?? null,
                        albumId: null,
                      })
                    }
                  />
                ))}
              {kind === "album" &&
                (results.albums?.items ?? []).map((al) => (
                  <ResultRow
                    key={al.id}
                    title={al.name}
                    subtitle={al.artists?.map((x) => x.name).join(", ") ?? ""}
                    imageUrl={al.images?.[0]?.url ?? null}
                    disabled={sending}
                    onPick={() =>
                      sendSelection("album", al.id, {
                        title: al.name,
                        subtitle: al.artists?.map((x) => x.name).join(", ") ?? null,
                        imageUrl: al.images?.[0]?.url ?? null,
                        albumId: null,
                      })
                    }
                  />
                ))}
              {kind === "track" &&
                (results.tracks?.items ?? []).map((tr) => {
                  const album = tr.album;
                  const artistLine = tr.artists?.map((x) => x.name).join(", ");
                  const sub = [artistLine, album?.name].filter(Boolean).join(" · ");
                  return (
                    <ResultRow
                      key={tr.id}
                      title={tr.name}
                      subtitle={sub}
                      imageUrl={album?.images?.[0]?.url ?? null}
                      disabled={sending}
                      onPick={() =>
                        sendSelection("track", tr.id, {
                          title: tr.name,
                          subtitle: sub,
                          imageUrl: album?.images?.[0]?.url ?? null,
                          albumId: album?.id ?? null,
                        })
                      }
                    />
                  );
                })}
            </ul>
          ) : null}

          {!searchLoading &&
          query.trim() &&
          results &&
          ((kind === "artist" && !(results.artists?.items ?? []).length) ||
            (kind === "album" && !(results.albums?.items ?? []).length) ||
            (kind === "track" && !(results.tracks?.items ?? []).length)) ? (
            <p className="mt-4 text-center text-sm text-zinc-500">No results</p>
          ) : null}

          {error ? (
            <p className="mt-3 text-sm text-red-400">{error}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 gap-2 border-t border-zinc-800 px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="flex-1 rounded-xl border border-zinc-700 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function ResultRow({
  title,
  subtitle,
  imageUrl,
  onPick,
  disabled,
}: {
  title: string;
  subtitle: string;
  imageUrl: string | null;
  onPick: () => void;
  disabled: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        disabled={disabled}
        onClick={onPick}
        className="flex w-full items-center gap-3 rounded-xl border border-transparent px-2 py-2 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-950/80 disabled:opacity-50"
      >
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-zinc-800">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-zinc-600">
              ♪
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-zinc-100">{title}</p>
          <p className="truncate text-xs text-zinc-500">{subtitle}</p>
          <p className="mt-0.5 text-[11px] font-medium text-emerald-400/90">
            Tap to send
          </p>
        </div>
      </button>
    </li>
  );
}
