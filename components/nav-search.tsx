"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const DEBOUNCE_MS = 250;
const MAX_PER_SECTION = 3;

export function NavSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [artists, setArtists] = useState<SpotifyApi.ArtistObjectFull[]>([]);
  const [albums, setAlbums] = useState<SpotifyApi.AlbumObjectSimplified[]>([]);
  const [tracks, setTracks] = useState<SpotifyApi.TrackObjectFull[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const doSearch = useCallback(async (q: string) => {
    // Cancel any previous in-flight request before starting a new one
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const { signal } = abortRef.current;
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(q)}&limit=${MAX_PER_SECTION + 1}`,
        { credentials: "include", signal },
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        artists?: { items: SpotifyApi.ArtistObjectFull[] };
        albums?: { items: SpotifyApi.AlbumObjectSimplified[] };
        tracks?: { items: SpotifyApi.TrackObjectFull[] };
      };
      setArtists((data.artists?.items ?? []).slice(0, MAX_PER_SECTION));
      setAlbums((data.albums?.items ?? []).slice(0, MAX_PER_SECTION));
      setTracks((data.tracks?.items ?? []).slice(0, MAX_PER_SECTION));
      setOpen(true);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      // silent for other errors
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setArtists([]);
      setAlbums([]);
      setTracks([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => void doSearch(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, doSearch]);

  const hasResults =
    artists.length > 0 || albums.length > 0 || tracks.length > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  function handleResultClick() {
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <form onSubmit={handleSubmit}>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
            {loading ? (
              <svg
                className="h-4 w-4 animate-spin text-emerald-500"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            ) : (
              <svg
                className="h-4 w-4 text-emerald-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            )}
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
              if (hasResults) setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setOpen(false);
                inputRef.current?.blur();
              }
            }}
            placeholder="Search artists, albums, tracks..."
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="w-full rounded-xl border border-zinc-700/60 bg-zinc-800/50 py-2 pl-9 pr-3 text-sm text-white placeholder-zinc-500 transition focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setOpen(false);
                inputRef.current?.focus();
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 transition hover:text-zinc-300"
              aria-label="Clear"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
      </form>

      {/* Suggestions dropdown */}
      {open && hasResults && (
        <div className="absolute left-0 right-0 top-full z-[200] mt-1.5 overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-950 shadow-2xl ring-1 ring-white/[0.06]">
          {artists.length > 0 && (
            <div>
              <p className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                Artists
              </p>
              {artists.map((a) => {
                const img = a.images?.[0]?.url;
                return (
                  <Link
                    key={a.id}
                    href={`/artist/${a.id}`}
                    onClick={handleResultClick}
                    className="flex items-center gap-3 px-4 py-2 transition hover:bg-zinc-800/60"
                  >
                    <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-zinc-800 ring-1 ring-white/10">
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={img}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-xs text-zinc-600">
                          ♪
                        </span>
                      )}
                    </div>
                    <span className="min-w-0 truncate text-sm font-medium text-zinc-200">
                      {a.name}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}

          {albums.length > 0 && (
            <div>
              <p className="px-4 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                Albums
              </p>
              {albums.map((al) => {
                const img = al.images?.[0]?.url;
                const artistNames = al.artists?.map((a) => a.name).join(", ");
                return (
                  <Link
                    key={al.id}
                    href={`/album/${al.id}`}
                    onClick={handleResultClick}
                    className="flex items-center gap-3 px-4 py-2 transition hover:bg-zinc-800/60"
                  >
                    <div className="h-8 w-8 shrink-0 overflow-hidden rounded bg-zinc-800 ring-1 ring-white/10">
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={img}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-xs text-zinc-600">
                          ♪
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-200">
                        {al.name}
                      </p>
                      {artistNames && (
                        <p className="truncate text-xs text-zinc-500">
                          {artistNames}
                        </p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {tracks.length > 0 && (
            <div>
              <p className="px-4 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                Tracks
              </p>
              {tracks.map((t) => {
                const img = t.album?.images?.[0]?.url;
                const artistNames = t.artists?.map((a) => a.name).join(", ");
                return (
                  <Link
                    key={t.id}
                    href={`/song/${t.id}`}
                    onClick={handleResultClick}
                    className="flex items-center gap-3 px-4 py-2 transition hover:bg-zinc-800/60"
                  >
                    <div className="h-8 w-8 shrink-0 overflow-hidden rounded bg-zinc-800 ring-1 ring-white/10">
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={img}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-xs text-zinc-600">
                          ♪
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-200">
                        {t.name}
                      </p>
                      {artistNames && (
                        <p className="truncate text-xs text-zinc-500">
                          {artistNames}
                        </p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Footer: see all */}
          <div className="border-t border-zinc-800/60 px-4 py-2.5">
            <Link
              href={`/search?q=${encodeURIComponent(query.trim())}`}
              onClick={handleResultClick}
              className="text-sm font-medium text-emerald-400 transition hover:text-emerald-300"
            >
              See all results for &ldquo;{query.trim()}&rdquo; →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
