"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { UserSearchResult } from "@/components/user-search-result";
import type { UserSearchResult as UserSearchResultType } from "@/types";

// ─── Types ───────────────────────────────────────────────────────────────────

type FilterTab = "all" | "artists" | "albums" | "tracks" | "people";

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "artists", label: "Artists" },
  { id: "albums", label: "Albums" },
  { id: "tracks", label: "Tracks" },
  { id: "people", label: "People" },
];

type TopResult =
  | { kind: "artist"; data: SpotifyApi.ArtistObjectFull }
  | { kind: "album"; data: SpotifyApi.AlbumObjectSimplified }
  | { kind: "track"; data: SpotifyApi.TrackObjectFull };

const DEBOUNCE_MS = 280;
const MIN_PEOPLE_QUERY = 2;

// ─── Search input ─────────────────────────────────────────────────────────────

const SearchInput = forwardRef<
  HTMLInputElement,
  { value: string; onChange: (v: string) => void; loading: boolean }
>(({ value, onChange, loading }, ref) => (
  <div className="relative">
    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2">
      {loading ? (
        <svg
          className="h-5 w-5 animate-spin text-emerald-500"
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
          className="h-5 w-5 text-emerald-500"
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
      ref={ref}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Search artists, albums, tracks, people…"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      className="w-full rounded-2xl border border-zinc-700/60 bg-zinc-800/70 py-3.5 pl-12 pr-10 text-base text-white placeholder-zinc-500 transition focus:border-emerald-500/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
    />
    {value && (
      <button
        type="button"
        onClick={() => onChange("")}
        aria-label="Clear search"
        className="absolute right-3.5 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full bg-zinc-700 text-zinc-400 transition hover:bg-zinc-600 hover:text-white"
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
));
SearchInput.displayName = "SearchInput";

// ─── Top result spotlight ─────────────────────────────────────────────────────

function TopResultCard({ result }: { result: TopResult }) {
  const { kind, data } = result;
  const image =
    kind === "artist"
      ? (data as SpotifyApi.ArtistObjectFull).images?.[0]?.url
      : kind === "album"
        ? (data as SpotifyApi.AlbumObjectSimplified).images?.[0]?.url
        : (data as SpotifyApi.TrackObjectFull).album?.images?.[0]?.url;
  const href =
    kind === "artist"
      ? `/artist/${data.id}`
      : kind === "album"
        ? `/album/${data.id}`
        : `/song/${data.id}`;
  const subtitle =
    kind === "artist"
      ? "Artist"
      : (data as SpotifyApi.AlbumObjectSimplified | SpotifyApi.TrackObjectFull).artists
          ?.map((a) => a.name)
          .join(", ") ?? "";
  const typeLabel = kind.charAt(0).toUpperCase() + kind.slice(1);

  return (
    <section>
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        Top result
      </h2>
      <Link
        href={href}
        className="group flex items-center gap-5 rounded-2xl border border-zinc-800/60 bg-zinc-900/40 p-5 ring-1 ring-white/[0.04] transition hover:bg-zinc-800/50"
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            className={`h-20 w-20 shrink-0 object-cover shadow-xl ring-1 ring-white/10 sm:h-24 sm:w-24 ${
              kind === "artist" ? "rounded-full" : "rounded-xl"
            }`}
          />
        ) : (
          <div
            className={`flex h-20 w-20 shrink-0 items-center justify-center bg-zinc-800 text-3xl text-zinc-600 sm:h-24 sm:w-24 ${
              kind === "artist" ? "rounded-full" : "rounded-xl"
            }`}
          >
            ♪
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xl font-bold text-white transition group-hover:text-emerald-300 sm:text-2xl">
            {data.name}
          </p>
          <p className="mt-1 truncate text-sm text-zinc-400">{subtitle}</p>
          <span className="mt-3 inline-block rounded-full bg-zinc-800/80 px-2.5 py-0.5 text-xs font-medium text-zinc-400">
            {typeLabel}
          </span>
        </div>
      </Link>
    </section>
  );
}

// ─── Artists ──────────────────────────────────────────────────────────────────

function ArtistsSection({
  artists,
}: {
  artists: SpotifyApi.ArtistObjectFull[];
}) {
  return (
    <section>
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        Artists
      </h2>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {artists.map((artist) => {
          const image = artist.images?.[0]?.url;
          return (
            <Link
              key={artist.id}
              href={`/artist/${artist.id}`}
              className="group flex flex-col items-center gap-2 rounded-xl p-2 transition hover:bg-zinc-800/40"
            >
              <div className="aspect-square w-full overflow-hidden rounded-full bg-zinc-800 shadow-md ring-1 ring-white/10">
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image}
                    alt=""
                    className="h-full w-full object-cover transition group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-2xl text-zinc-600">
                    ♪
                  </div>
                )}
              </div>
              <p className="w-full truncate text-center text-xs font-medium text-zinc-300 group-hover:text-white">
                {artist.name}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

// ─── Albums ───────────────────────────────────────────────────────────────────

function AlbumsSection({
  albums,
}: {
  albums: SpotifyApi.AlbumObjectSimplified[];
}) {
  return (
    <section>
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        Albums
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {albums.map((album) => {
          const image = album.images?.[0]?.url;
          const artistNames = album.artists?.map((a) => a.name).join(", ");
          return (
            <Link
              key={album.id}
              href={`/album/${album.id}`}
              className="group flex flex-col overflow-hidden rounded-xl border border-zinc-800/60 bg-zinc-900/40 ring-1 ring-white/[0.04] transition hover:bg-zinc-800/50"
            >
              <div className="aspect-square w-full overflow-hidden bg-zinc-800">
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image}
                    alt=""
                    className="h-full w-full object-cover transition group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-3xl text-zinc-600">
                    ♪
                  </div>
                )}
              </div>
              <div className="p-3">
                <p className="truncate text-sm font-medium text-white group-hover:text-emerald-400">
                  {album.name}
                </p>
                <p className="mt-0.5 truncate text-xs text-zinc-500">
                  {artistNames}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

// ─── Tracks ───────────────────────────────────────────────────────────────────

function TracksSection({ tracks }: { tracks: SpotifyApi.TrackObjectFull[] }) {
  return (
    <section>
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        Tracks
      </h2>
      <div className="space-y-1.5">
        {tracks.map((track) => {
          const image = track.album?.images?.[0]?.url;
          const artistNames = track.artists?.map((a) => a.name).join(", ");
          return (
            <Link
              key={track.id}
              href={`/song/${track.id}`}
              className="group flex items-center gap-3 rounded-xl border border-zinc-800/60 bg-zinc-900/30 px-3 py-2.5 transition hover:bg-zinc-800/50"
            >
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={image}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-md object-cover ring-1 ring-white/10"
                />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-zinc-800 text-zinc-600">
                  ♪
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white group-hover:text-emerald-400">
                  {track.name}
                </p>
                <p className="truncate text-xs text-zinc-500">{artistNames}</p>
              </div>
              {track.album && (
                <p className="hidden max-w-[8rem] shrink-0 truncate text-xs text-zinc-600 sm:block">
                  {track.album.name}
                </p>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

// ─── People ───────────────────────────────────────────────────────────────────

function PeopleSection({ people }: { people: UserSearchResultType[] }) {
  return (
    <section>
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        People
      </h2>
      <div className="space-y-1.5">
        {people.map((user) => (
          <UserSearchResult key={user.id} user={user} showFollowButton />
        ))}
      </div>
    </section>
  );
}

// ─── Top result scoring ───────────────────────────────────────────────────────

function nameMatchScore(query: string, name: string): number {
  const q = query.toLowerCase().trim();
  const n = name.toLowerCase().trim();
  if (n === q) return 200;
  if (n.startsWith(q)) return 150;
  if (q.startsWith(n)) return 120;
  if (n.includes(q)) return 80;
  if (q.includes(n)) return 60;
  const qWords = new Set(q.split(/\s+/).filter(Boolean));
  const nWords = n.split(/\s+/).filter(Boolean);
  const overlap = nWords.filter((w) => qWords.has(w)).length;
  return overlap > 0 ? 20 + overlap * 15 : 0;
}

function pickTopResult(
  query: string,
  artists: SpotifyApi.ArtistObjectFull[],
  albums: SpotifyApi.AlbumObjectSimplified[],
  tracks: SpotifyApi.TrackObjectFull[],
): TopResult | null {
  type Candidate = { result: TopResult; score: number };
  const candidates: Candidate[] = [];

  if (artists[0]) {
    const a = artists[0];
    const pop = (a as unknown as { popularity?: number }).popularity ?? 0;
    const score = nameMatchScore(query, a.name) + pop * 0.5;
    candidates.push({ result: { kind: "artist", data: a }, score });
  }
  if (albums[0]) {
    const al = albums[0];
    const pop = (al as unknown as { popularity?: number }).popularity ?? 50;
    const score = nameMatchScore(query, al.name) + pop * 0.5;
    candidates.push({ result: { kind: "album", data: al }, score });
  }
  if (tracks[0]) {
    const t = tracks[0];
    const pop = (t as unknown as { popularity?: number }).popularity ?? 0;
    const score = nameMatchScore(query, t.name) + pop * 0.5;
    candidates.push({ result: { kind: "track", data: t }, score });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.result ?? null;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SearchClient({ initialQuery = "" }: { initialQuery?: string }) {
  const { data: session } = useSession();
  const [query, setQuery] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [artists, setArtists] = useState<SpotifyApi.ArtistObjectFull[]>([]);
  const [albums, setAlbums] = useState<SpotifyApi.AlbumObjectSimplified[]>([]);
  const [tracks, setTracks] = useState<SpotifyApi.TrackObjectFull[]>([]);
  const [people, setPeople] = useState<UserSearchResultType[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Kick off initial search if URL had ?q=
  const hasInitialQuery = initialQuery.length > 0;
  useEffect(() => {
    if (hasInitialQuery) setLoading(true);
  }, [hasInitialQuery]);

  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setArtists([]);
      setAlbums([]);
      setTracks([]);
      setPeople([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const musicFetch = fetch(
        `/api/search?q=${encodeURIComponent(trimmed)}&limit=10`,
        { credentials: "include" },
      );
      const peopleFetch =
        trimmed.length >= MIN_PEOPLE_QUERY
          ? fetch(
              `/api/search/users?q=${encodeURIComponent(trimmed)}&limit=6`,
              { credentials: "include" },
            )
          : Promise.resolve(null);

      const [musicRes, usersRes] = await Promise.all([musicFetch, peopleFetch]);

      if (musicRes.ok) {
        const data = (await musicRes.json()) as {
          artists?: { items: SpotifyApi.ArtistObjectFull[] };
          albums?: { items: SpotifyApi.AlbumObjectSimplified[] };
          tracks?: { items: SpotifyApi.TrackObjectFull[] };
        };
        setArtists(data.artists?.items ?? []);
        setAlbums(data.albums?.items ?? []);
        setTracks(data.tracks?.items ?? []);
      }

      if (usersRes?.ok) {
        const userData = (await usersRes.json()) as UserSearchResultType[];
        setPeople(Array.isArray(userData) ? userData : []);
      } else {
        setPeople([]);
      }
    } catch {
      // silent — show stale results
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search on query change
  useEffect(() => {
    if (!query.trim()) {
      setArtists([]);
      setAlbums([]);
      setTracks([]);
      setPeople([]);
      setLoading(false);
      return;
    }
    const timer = setTimeout(() => void doSearch(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, doSearch]);

  const hasResults =
    artists.length > 0 ||
    albums.length > 0 ||
    tracks.length > 0 ||
    people.length > 0;

  const topResult = pickTopResult(query, artists, albums, tracks);

  const showArtists =
    (activeTab === "all" || activeTab === "artists") && artists.length > 0;
  const showAlbums =
    (activeTab === "all" || activeTab === "albums") && albums.length > 0;
  const showTracks =
    (activeTab === "all" || activeTab === "tracks") && tracks.length > 0;
  const showPeople =
    (activeTab === "all" || activeTab === "people") && people.length > 0;

  return (
    <div className="space-y-5">
      <SearchInput
        ref={inputRef}
        value={query}
        onChange={(v) => {
          setQuery(v);
          setLoading(v.trim().length > 0);
        }}
        loading={loading}
      />

      {/* Filter pills — only when query is active */}
      {query.trim() && (
        <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [-webkit-overflow-scrolling:touch]">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                activeTab === tab.id
                  ? "bg-emerald-600 text-white"
                  : "bg-zinc-800/70 text-zinc-400 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Results */}
      {query.trim() && (
        <div
          className={`space-y-10 transition-opacity duration-150 ${
            loading && hasResults ? "opacity-50" : "opacity-100"
          }`}
        >
          {hasResults ? (
            <>
              {activeTab === "all" && topResult && (
                <TopResultCard result={topResult} />
              )}
              {showArtists && <ArtistsSection artists={artists} />}
              {showAlbums && <AlbumsSection albums={albums} />}
              {showTracks && <TracksSection tracks={tracks} />}
              {showPeople && <PeopleSection people={people} />}
            </>
          ) : !loading ? (
            <p className="py-8 text-center text-sm text-zinc-500">
              No results for &ldquo;{query}&rdquo;
            </p>
          ) : null}
        </div>
      )}

      {/* Empty state */}
      {!query.trim() && (
        <p className="py-10 text-center text-sm text-zinc-500">
          Search for artists, albums, tracks, or people
        </p>
      )}
    </div>
  );
}
