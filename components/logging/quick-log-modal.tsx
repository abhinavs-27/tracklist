"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/toast";
import { resolveTrackForSearchResultWeb } from "@/lib/logging/resolve-log-target";
import type { LogSource } from "@/lib/logging/types";
import { useLogging } from "./logging-context";

type SearchKind = "artist" | "album" | "track";

type SearchResult = {
  key: string;
  kind: SearchKind;
  id: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
};

type SpotifySearchPayload = {
  artists?: {
    items: Array<{
      id: string;
      name: string;
      images?: Array<{ url: string }>;
    }>;
  };
  albums?: {
    items: Array<{
      id: string;
      name: string;
      artists?: Array<{ name: string }>;
      images?: Array<{ url: string }>;
    }>;
  };
  tracks?: {
    items: Array<{
      id: string;
      name: string;
      artists?: Array<{ name: string }>;
      album?: { images?: Array<{ url: string }> };
    }>;
  };
};

function flattenSpotifySearch(data: SpotifySearchPayload): SearchResult[] {
  const out: SearchResult[] = [];
  for (const a of data.artists?.items ?? []) {
    out.push({
      key: `artist:${a.id}`,
      kind: "artist",
      id: a.id,
      title: a.name,
      artist: "Artist",
      artworkUrl: a.images?.[0]?.url ?? null,
    });
  }
  for (const al of data.albums?.items ?? []) {
    out.push({
      key: `album:${al.id}`,
      kind: "album",
      id: al.id,
      title: al.name,
      artist: al.artists?.[0]?.name ?? "Album",
      artworkUrl: al.images?.[0]?.url ?? null,
    });
  }
  for (const t of data.tracks?.items ?? []) {
    out.push({
      key: `track:${t.id}`,
      kind: "track",
      id: t.id,
      title: t.name,
      artist: t.artists?.[0]?.name ?? "Track",
      artworkUrl: t.album?.images?.[0]?.url ?? null,
    });
  }
  return out;
}

type Props = {
  open: boolean;
  onClose: () => void;
  source?: LogSource;
};

export function QuickLogModal({ open, onClose, source = "manual" }: Props) {
  const { logListen, logBusy } = useLogging();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolvingKey, setResolvingKey] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const runSearch = useCallback(async (text: string) => {
    const q = text.trim();
    if (!q) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) {
        setResults([]);
        return;
      }
      const data = (await res.json()) as SpotifySearchPayload;
      setResults(flattenSpotifySearch(data));
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      void runSearch(q);
    }, 320);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setNote("");
      setResolvingKey(null);
    }
  }, [open]);

  async function onPick(item: SearchResult) {
    if (logBusy) return;
    setResolvingKey(item.key);
    try {
      const resolved = await resolveTrackForSearchResultWeb(item.kind, item.id);
      if (!resolved) {
        toast("No track found for that item.");
        return;
      }
      try {
        await logListen({
          trackId: resolved.trackId,
          albumId: resolved.albumId ?? null,
          artistId: resolved.artistId ?? null,
          source,
          note: note.trim() || null,
          displayName: item.title,
        });
        onClose();
      } catch {
        /* logListen already toasts */
      }
    } catch {
      toast("Couldn’t load details. Check your connection.");
    } finally {
      setResolvingKey(null);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/65 p-0 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div
        className="relative z-10 flex max-h-[88vh] min-h-[420px] w-full max-w-lg flex-1 flex-col rounded-t-2xl border border-zinc-800 bg-zinc-950 sm:max-h-[85vh] sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-log-title"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-4 py-4">
          <h2 id="quick-log-title" className="text-lg font-extrabold text-white">
            Log a listen
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="font-bold text-emerald-400 hover:underline"
          >
            Done
          </button>
        </div>
        <p className="shrink-0 px-4 pb-3 text-sm font-medium text-zinc-400">
          Search, then tap once to log. Optional note applies to the next pick.
        </p>
        <div className="shrink-0 space-y-2.5 px-4 pb-3">
          <input
            type="search"
            placeholder="Artists, albums, tracks…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            className="w-full rounded-full border border-zinc-700 bg-zinc-900 px-4 py-3 text-base text-white placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <input
            type="text"
            placeholder="Optional note (applies to next log)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        {loading ? (
          <div className="flex justify-center py-2">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-500" />
          </div>
        ) : null}
        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-zinc-800/80">
          {results.length === 0 ? (
            <li className="px-4 py-3 text-sm font-semibold text-zinc-500">
              {query.trim().length === 0
                ? "Type to search Spotify."
                : "No results"}
            </li>
          ) : (
            results.map((item) => {
              const busy = resolvingKey === item.key;
              const sub =
                item.kind === "artist"
                  ? "Artist"
                  : item.kind === "album"
                    ? `Album · ${item.artist}`
                    : `Song · ${item.artist}`;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    disabled={!!resolvingKey}
                    onClick={() => void onPick(item)}
                    className="flex w-full items-center gap-3 border-b border-zinc-800/80 px-4 py-3 text-left transition hover:bg-zinc-900/80 disabled:opacity-60"
                  >
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded bg-zinc-800">
                      {item.artworkUrl ? (
                        <img
                          src={item.artworkUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-zinc-600">
                          ♪
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-white">
                        {item.title}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-zinc-500">
                        {sub}
                      </p>
                    </div>
                    {busy ? (
                      <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-500" />
                    ) : (
                      <span className="shrink-0 font-extrabold text-emerald-400">
                        Log
                      </span>
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}
