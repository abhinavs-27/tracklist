"use client";

import Link from "next/link";
import Image from "next/image";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { AlbumReviews } from "@/app/album/[id]/album-reviews";
import { TrackRating } from "@/app/album/[id]/track-rating";
import { TrackCard } from "@/components/track-card";
import { useReviews } from "@/lib/hooks/use-reviews";
import type { FriendActivityItem } from "@/app/album/[id]/friends-who-listened";
import { AlbumFavoritedByModal } from "@/components/album-favorited-by-modal";
import { AlbumInfoTab } from "@/components/info-tab/AlbumInfoTab";
import { HALF_STAR_RATINGS, formatStarDisplay } from "@/lib/ratings";
import { formatRelativeTime } from "@/lib/time";
import { sectionTitle } from "@/lib/ui/surface";

// ── Helpers ───────────────────────────────────────────────────────────────

function formatDuration(ms: number | undefined) {
  if (!ms) return null;
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function formatTotalDuration(items: SpotifyApi.TrackObjectSimplified[]) {
  const totalMs = items.reduce((s, t) => s + (t.duration_ms ?? 0), 0);
  const totalMin = Math.round(totalMs / 60000);
  if (totalMin < 60) return `${totalMin} min`;
  return `${Math.floor(totalMin / 60)} hr ${totalMin % 60} min`;
}

type TrackStatRow = { listen_count: number; review_count: number; average_rating: number | null };

function TrackStatsLine({ listen_count, review_count, average_rating }: TrackStatRow) {
  if (listen_count === 0 && review_count === 0) return <span className="text-xs text-zinc-700">—</span>;
  const parts: string[] = [];
  if (listen_count > 0) parts.push(`${listen_count.toLocaleString()} play${listen_count !== 1 ? "s" : ""}`);
  if (review_count > 0) parts.push(`${review_count} review${review_count !== 1 ? "s" : ""}`);
  if (average_rating != null) parts.push(`${average_rating.toFixed(1)}★`);
  return <span className="text-xs text-zinc-500">{parts.join(" · ")}</span>;
}

// ── Tab nav ───────────────────────────────────────────────────────────────

type Tab = "tracks" | "reviews" | "info" | "social";

function TabNav({ active, onChange, hasSocial }: { active: Tab; onChange: (t: Tab) => void; hasSocial: boolean }) {
  const tabs: { id: Tab; label: string }[] = [
    { id: "tracks", label: "Tracks" },
    { id: "reviews", label: "Reviews" },
    { id: "info", label: "Info" },
    ...(hasSocial ? [{ id: "social" as Tab, label: "Social" }] : []),
  ];
  return (
    <div className="flex gap-0 border-b border-zinc-800/80">
      {tabs.map((tab) => (
        <button key={tab.id} type="button" onClick={() => onChange(tab.id)}
          className={`relative flex-1 py-3 text-sm font-medium capitalize transition-colors duration-150 ${active === tab.id ? "text-white" : "text-zinc-500 hover:text-zinc-300"}`}>
          {tab.label}
          {active === tab.id && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-gold-400" />}
        </button>
      ))}
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────

export type AlbumPageClientProps = {
  id: string;
  album: SpotifyApi.AlbumObjectFull;
  tracks: SpotifyApi.PagingObject<SpotifyApi.TrackObjectSimplified>;
  session: boolean;
  viewerUserId: string | null;
  stats: {
    listen_count: number;
    average_rating: number | null;
    review_count: number;
    rating_distribution?: Record<string, number>;
  };
  engagementStats: {
    listen_count: number;
    review_count: number;
    avg_rating: number | null;
    favorite_count: number;
  };
  friendActivity: FriendActivityItem[];
  viewerTrackRatings?: Map<string, number>;
  recommendationsNode?: ReactNode;
  leaderboardNode?: ReactNode;
  bio?: string | null;
  producers?: any[];
  songwriters?: any[];
  labels?: any[];
  creditsEnrichedAt?: string | null;
};

// ── Main component ────────────────────────────────────────────────────────

export function AlbumPageClient({
  id,
  album,
  tracks,
  session,
  viewerUserId,
  stats,
  engagementStats,
  friendActivity,
  viewerTrackRatings,
  recommendationsNode,
  leaderboardNode,
  bio: initialBio = null,
  producers: initialProducers = [],
  songwriters: initialSongwriters = [],
  labels: initialLabels = [],
  creditsEnrichedAt: initialCreditsEnrichedAt = null,
}: AlbumPageClientProps) {
  const image = album.images?.[0]?.url;
  const firstTrack = tracks.items?.[0];
  const [favoritedByOpen, setFavoritedByOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("tracks");
  const [trackStats, setTrackStats] = useState<Record<string, TrackStatRow>>({});
  const [trackStatsLoading, setTrackStatsLoading] = useState(true);

  const initialHasContent = !!initialBio || initialProducers.length > 0 || initialSongwriters.length > 0 || initialLabels.length > 0;
  const [bio, setBio] = useState(initialBio);
  const [producers, setProducers] = useState(initialProducers);
  const [songwriters, setSongwriters] = useState(initialSongwriters);
  const [labels, setLabels] = useState(initialLabels);
  const [creditsEnrichedAt, setCreditsEnrichedAt] = useState(initialCreditsEnrichedAt);
  const [isPolling, setIsPolling] = useState(!initialHasContent && initialCreditsEnrichedAt === null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollAttemptsRef = useRef(0);

  useEffect(() => {
    if (initialHasContent || initialCreditsEnrichedAt !== null) return;
    let cancelled = false;
    setIsPolling(true);
    pollAttemptsRef.current = 0;
    const poll = async () => {
      if (pollAttemptsRef.current >= 10) {
        if (!cancelled) setIsPolling(false);
        return;
      }
      pollAttemptsRef.current++;
      try {
        const res = await fetch(`/api/albums/${encodeURIComponent(id)}/info`);
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          if (data.credits_enriched_at) {
            setBio(data.bio ?? null);
            setProducers(data.producers ?? []);
            setSongwriters(data.songwriters ?? []);
            setLabels(data.labels ?? []);
            setCreditsEnrichedAt(data.credits_enriched_at);
            if (!cancelled) setIsPolling(false);
            return;
          }
        }
      } catch { /* swallow */ }
      if (!cancelled) pollRef.current = setTimeout(poll, 3000);
    };
    void poll();
    return () => {
      cancelled = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: reviewData } = useReviews("album", id);
  const myReview = reviewData?.my_review ?? null;

  const trackIdsKey = useMemo(() => tracks.items?.map((t) => t.id).join(",") ?? "", [tracks.items]);

  useEffect(() => {
    const ids = tracks.items?.map((t) => t.id) ?? [];
    if (ids.length === 0) { setTrackStatsLoading(false); return; }
    let cancelled = false;
    void (async () => {
      try {
        const merged: Record<string, TrackStatRow> = {};
        for (let i = 0; i < ids.length; i += 400) {
          const chunk = ids.slice(i, i + 400);
          const res = await fetch("/api/track-stats/batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ track_ids: chunk }) });
          if (!res.ok) { if (!cancelled) setTrackStats({}); return; }
          Object.assign(merged, ((await res.json()) as { stats?: Record<string, TrackStatRow> }).stats ?? {});
        }
        if (!cancelled) setTrackStats(merged);
      } catch { if (!cancelled) setTrackStats({}); }
      finally { if (!cancelled) setTrackStatsLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [trackIdsKey]);

  const emptyTrackStat: TrackStatRow = { listen_count: 0, review_count: 0, average_rating: null };
  const totalDuration = tracks.items?.length ? formatTotalDuration(tracks.items) : null;
  const hasSocial = !!viewerUserId;

  return (
    <>
    {/* Mobile fixed header — matches app nav bar style */}
    <header className="fixed left-0 right-0 top-0 z-[60] border-b border-white/[0.06] bg-zinc-950/95 backdrop-blur-xl md:hidden">
      <div className="flex min-h-[3rem] items-center gap-3 px-4 py-2.5">
        <button type="button" onClick={() => window.history.back()} className="shrink-0 text-gold-400 touch-manipulation">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <p className="min-w-0 flex-1 truncate text-center text-base font-bold tracking-tight text-white">{album.name}</p>
        <div className="w-6 shrink-0" />
      </div>
    </header>
    <div className="h-12 md:hidden" />

    <div className="space-y-10">

      {/* ── Hero — clean, no background tricks ───────────── */}
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:gap-8">
        {/* Album art — large square, prominent */}
        <div className="relative h-56 w-56 shrink-0 overflow-hidden rounded-2xl bg-zinc-800 shadow-[0_24px_60px_-16px_rgba(0,0,0,0.85)] sm:h-64 sm:w-64">
          {image ? (
            <Image src={image} alt="" fill sizes="256px" className="object-cover" priority />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-6xl text-zinc-600">♪</div>
          )}
        </div>

        {/* Metadata */}
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="hidden text-xs font-medium uppercase tracking-widest text-zinc-500 md:block">Album</p>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {album.name}
          </h1>
          <p className="mt-2 text-base text-zinc-300">
            {album.artists?.map((a, i) => (
              <span key={a.id}>
                {i > 0 && <span className="text-zinc-600"> · </span>}
                <Link href={`/artist/${a.id}`} className="hover:text-gold-400 hover:underline">{a.name}</Link>
              </span>
            ))}
          </p>
          <p className="mt-1.5 text-sm text-zinc-500">
            {album.release_date && new Date(album.release_date).getFullYear()}
            {tracks.items?.length ? ` · ${tracks.items.length} tracks` : ""}
            {totalDuration ? ` · ${totalDuration}` : ""}
          </p>

          {/* Community stats — matches mobile StatRow */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm sm:justify-start">
            {engagementStats.avg_rating != null && (
              <span className="text-amber-400 font-medium">★ {engagementStats.avg_rating.toFixed(1)} <span className="text-zinc-500 font-normal">avg</span></span>
            )}
            {engagementStats.listen_count > 0 && (
              <span><span className="font-semibold text-white">{engagementStats.listen_count.toLocaleString()}</span> <span className="text-zinc-400">plays</span></span>
            )}
            {engagementStats.favorite_count > 0 && (
              <button type="button" onClick={() => setFavoritedByOpen(true)} className="transition hover:text-zinc-300">
                <span className="font-semibold text-white">{engagementStats.favorite_count.toLocaleString()}</span> <span className="text-zinc-400 underline-offset-2 hover:underline">favorited</span>
              </button>
            )}
            {stats.review_count > 0 && (
              <span><span className="font-semibold text-white">{stats.review_count.toLocaleString()}</span> <span className="text-zinc-400">{stats.review_count === 1 ? "review" : "reviews"}</span></span>
            )}
          </div>

          {/* Rating distribution — 5 whole-star buckets, matching mobile */}
          {stats.rating_distribution && stats.review_count > 0 && (
            <div className="mt-3 flex items-end gap-1">
              {[1, 2, 3, 4, 5].map((star) => {
                const dist = stats.rating_distribution!;
                // Sum the half-step and whole-step for each star bucket
                const count = (dist[String(star - 0.5)] ?? 0) + (dist[String(star)] ?? 0);
                const max = Math.max(
                  ...[1,2,3,4,5].map(s => (dist[String(s - 0.5)] ?? 0) + (dist[String(s)] ?? 0)),
                );
                return (
                  <div key={star} className="flex flex-1 flex-col items-center gap-0.5">
                    <div className="w-full rounded-sm bg-amber-500/40"
                      style={{ height: `${Math.max(max > 0 ? (count / max) * 28 : 0, 2)}px` }} />
                    <span className="text-[9px] text-zinc-600">{star}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <AlbumFavoritedByModal albumId={id} albumTitle={album.name} isOpen={favoritedByOpen} onClose={() => setFavoritedByOpen(false)} viewerUserId={viewerUserId} />

      {/* Your rating strip */}
      {myReview && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-zinc-800/60 bg-zinc-900/40 px-4 py-3 text-sm">
          <span className="text-zinc-400">
            Your rating: <span className="text-amber-400">{formatStarDisplay(myReview.rating)}</span>
          </span>
          {myReview.review_text && (
            <><span className="text-zinc-700">·</span>
              <span className="line-clamp-1 italic text-zinc-300">&quot;{myReview.review_text}&quot;</span></>
          )}
        </div>
      )}

      {/* ── Tabs ─────────────────────────────────────────── */}
      <div>
        <TabNav active={activeTab} onChange={setActiveTab} hasSocial={hasSocial} />

        {/* Tracks */}
        <div className={`mt-6 space-y-8 ${activeTab !== "tracks" ? "hidden" : ""}`}>
          {tracks.items?.length ? (
            <div>
              {tracks.items.map((t, i) => {
                const s = trackStats[t.id] ?? emptyTrackStat;
                const href = `/song/${t.id}`;
                return (
                  <div key={t.id} className="group border-b border-zinc-800/50 py-2 last:border-b-0">
                    <div className="flex items-center gap-2">
                      <span className="w-6 shrink-0 text-right text-xs text-zinc-600 tabular-nums">{i + 1}</span>
                      <a href={href} className="min-w-0 flex-1 truncate text-sm font-medium text-white hover:text-gold-400 transition-colors">
                        {t.name}
                      </a>
                      <span className="shrink-0 text-xs tabular-nums text-zinc-600">{formatDuration(t.duration_ms) ?? "—"}</span>
                      {session && viewerTrackRatings !== undefined && (
                        <span className="hidden sm:block">
                          <TrackRating
                            trackId={t.id}
                            initialRating={viewerTrackRatings.get(t.id) ?? null}
                          />
                        </span>
                      )}
                    </div>
                    <div className="flex min-h-[1.1rem] items-center pl-8">
                      {trackStatsLoading
                        ? <span className="inline-block h-2.5 w-24 animate-pulse rounded bg-zinc-800/60" />
                        : <TrackStatsLine {...s} />}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
          {recommendationsNode}
        </div>

        {/* Reviews */}
        <div className={`mt-6 ${activeTab !== "reviews" ? "hidden" : ""}`}>
          <AlbumReviews albumId={id} albumName={album.name} />
        </div>

        {/* Info */}
        {activeTab === "info" && (
          <div className="mt-6">
            <AlbumInfoTab
              bio={bio}
              producers={producers}
              songwriters={songwriters}
              isEnriching={isPolling}
              labels={labels}
            />
          </div>
        )}

        {/* Social — leaderboard + recent listening, same pattern as artist page */}
        {hasSocial && (
          <div className={`mt-6 space-y-8 ${activeTab !== "social" ? "hidden" : ""}`}>
            {leaderboardNode}

            <section>
              <h2 className="mb-3 text-lg font-semibold text-white">Recently listened</h2>
              {friendActivity.length > 0 ? (
                <ul className="space-y-2">
                  {friendActivity.map((l, i) => (
                    <li key={`${l.user_id}-${l.listened_at}-${i}`}>
                      <div className="flex items-center gap-3 rounded-2xl border border-zinc-800/60 bg-zinc-900/40 px-3 py-2.5 transition hover:bg-zinc-900/60">
                        {/* Album art thumbnail */}
                        {album.images?.[0]?.url && (
                          <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/[0.07]">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={album.images[0].url} alt="" className="h-full w-full object-cover" loading="lazy" />
                          </div>
                        )}
                        {/* Text */}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm leading-snug">
                            <Link href={`/profile/${l.user_id}`} className="font-semibold text-white hover:underline">{l.username}</Link>
                            <span className="text-zinc-400"> listened</span>
                            {l.rating != null && (
                              <span className="ml-1.5 text-amber-400">{formatStarDisplay(l.rating)}</span>
                            )}
                          </p>
                          <p className="mt-0.5 text-xs text-zinc-500 tabular-nums">{formatRelativeTime(l.listened_at)}</p>
                        </div>
                        {/* User avatar */}
                        <Link href={`/profile/${l.user_id}`} className="shrink-0">
                          {l.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={l.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover ring-1 ring-white/10" />
                          ) : (
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-semibold text-zinc-400 ring-1 ring-white/10">
                              {l.username[0]?.toUpperCase()}
                            </span>
                          )}
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-8 text-center text-sm text-zinc-500">No friends have listened to this album recently.</p>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
