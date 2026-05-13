"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useState, use } from "react";
import { RecordRecentView } from "@/components/logging/record-recent-view";
import { AlbumReviews } from "@/app/album/[id]/album-reviews";
import { TrackRating } from "@/app/album/[id]/track-rating";
import { TrackCard } from "@/components/track-card";
import { useReviews } from "@/lib/hooks/use-reviews";
import { AlbumFavoritedByModal } from "@/components/album-favorited-by-modal";
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

type Tab = "tracks" | "reviews" | "social";

function TabNav({ active, onChange, hasSocial }: { active: Tab; onChange: (t: Tab) => void; hasSocial: boolean }) {
  const tabs: { id: Tab; label: string }[] = [
    { id: "tracks", label: "Tracks" },
    { id: "reviews", label: "Reviews" },
    ...(hasSocial ? [{ id: "social" as Tab, label: "Social" }] : []),
  ];
  return (
    <div className="flex gap-0 border-b border-zinc-800/80">
      {tabs.map((tab) => (
        <button key={tab.id} type="button" onClick={() => onChange(tab.id)}
          className={`relative px-5 py-3 text-sm font-medium transition-colors duration-150 ${active === tab.id ? "text-white" : "text-zinc-500 hover:text-zinc-300"}`}>
          {tab.label}
          {active === tab.id && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-emerald-400" />}
        </button>
      ))}
    </div>
  );
}

// ── Deferred Sections ─────────────────────────────────────────────────────

export function AlbumEngagementSection({
  statsPromise,
  albumId,
  albumName,
  viewerUserId,
}: {
  statsPromise: Promise<{
    listen_count: number;
    review_count: number;
    avg_rating: number | null;
    favorite_count: number;
  }>;
  albumId: string;
  albumName: string;
  viewerUserId: string | null;
}) {
  const stats = use(statsPromise);
  const [favoritedByOpen, setFavoritedByOpen] = useState(false);

  return (
    <>
      <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm sm:justify-start">
        {stats.avg_rating != null && (
          <span>
            <span className="text-amber-400">★ {stats.avg_rating.toFixed(1)}</span>
            <span className="ml-1 text-zinc-500">avg</span>
          </span>
        )}
        {stats.listen_count > 0 && (
          <span>
            <span className="font-semibold text-white">{stats.listen_count.toLocaleString()}</span>{" "}
            <span className="text-zinc-400">plays</span>
          </span>
        )}
        {stats.favorite_count > 0 && (
          <button type="button" onClick={() => setFavoritedByOpen(true)} className="transition hover:text-zinc-300">
            <span className="font-semibold text-white">{stats.favorite_count.toLocaleString()}</span>{" "}
            <span className="text-zinc-400 underline-offset-2 hover:underline">favorited</span>
          </button>
        )}
      </div>
      <AlbumFavoritedByModal albumId={albumId} albumTitle={albumName} isOpen={favoritedByOpen} onClose={() => setFavoritedByOpen(false)} viewerUserId={viewerUserId} />
    </>
  );
}

export function AlbumRatingDistributionSection({
  statsPromise,
}: {
  statsPromise: Promise<{
    review_count: number;
    rating_distribution?: Record<string, number>;
  }>;
}) {
  const stats = use(statsPromise);
  if (!stats.rating_distribution || stats.review_count === 0) return null;
  const max = Math.max(...Object.values(stats.rating_distribution));

  return (
    <div className="mt-3 flex items-end gap-0.5">
      {HALF_STAR_RATINGS.map((star) => {
        const count = stats.rating_distribution![String(star)] ?? 0;
        return (
          <div key={star} className="flex min-w-[1.1rem] flex-1 flex-col items-center gap-0.5">
            <div className="w-full rounded-t bg-amber-500/35"
              style={{ height: `${Math.max(max > 0 ? (count / max) * 28 : 0, 2)}px` }}
              title={`${star}★: ${count}`} />
            <span className="text-[8px] text-zinc-600">{star}</span>
          </div>
        );
      })}
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
  viewerTrackRatingsPromise: Promise<Map<string, number>>;
  recommendationsNode?: ReactNode;
  leaderboardNode?: ReactNode;
  engagementStatsNode?: ReactNode;
  ratingDistributionNode?: ReactNode;
  friendActivityNode?: ReactNode;
};

// ── Main component ────────────────────────────────────────────────────────

export function AlbumPageClient({
  id,
  album,
  tracks,
  session,
  viewerUserId,
  viewerTrackRatingsPromise,
  recommendationsNode,
  leaderboardNode,
  engagementStatsNode,
  ratingDistributionNode,
  friendActivityNode,
}: AlbumPageClientProps) {
  const image = album.images?.[0]?.url;
  const firstTrack = tracks.items?.[0];
  const [activeTab, setActiveTab] = useState<Tab>("tracks");
  const [trackStats, setTrackStats] = useState<Record<string, TrackStatRow>>({});
  const [trackStatsLoading, setTrackStatsLoading] = useState(true);

  const viewerTrackRatings = use(viewerTrackRatingsPromise);

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
    <div className="space-y-8">
      {session && firstTrack && (
        <RecordRecentView kind="album" id={id} title={album.name}
          subtitle={album.artists?.map((a) => a.name).join(", ") ?? ""}
          artworkUrl={image ?? null} trackId={firstTrack.id} albumId={id}
          artistId={album.artists?.[0]?.id ?? null} />
      )}

      {/* ── Hero — clean, no background tricks ───────────── */}
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:gap-8">
        {/* Album art — large square, prominent */}
        <div className="h-56 w-56 shrink-0 overflow-hidden rounded-2xl bg-zinc-800 shadow-[0_32px_64px_-24px_rgba(0,0,0,0.7)] ring-1 ring-inset ring-white/[0.08] sm:h-64 sm:w-64">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-6xl text-zinc-600">♪</div>
          )}
        </div>

        {/* Metadata */}
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Album</p>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {album.name}
          </h1>
          <p className="mt-2 text-base text-zinc-300">
            {album.artists?.map((a, i) => (
              <span key={a.id}>
                {i > 0 && <span className="text-zinc-600"> · </span>}
                <Link href={`/artist/${a.id}`} className="hover:text-emerald-400 hover:underline">{a.name}</Link>
              </span>
            ))}
          </p>
          <p className="mt-1.5 text-sm text-zinc-500">
            {album.release_date && new Date(album.release_date).getFullYear()}
            {tracks.items?.length ? ` · ${tracks.items.length} tracks` : ""}
            {totalDuration ? ` · ${totalDuration}` : ""}
          </p>

          {/* Community stats */}
          {engagementStatsNode}

          {/* Rating distribution */}
          {ratingDistributionNode}
        </div>
      </div>

      {/* Your rating strip */}
      {myReview && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-zinc-800/60 bg-zinc-900/40 px-4 py-3 text-sm">
          <span className="text-zinc-400">
            Your rating: <span className="text-amber-400">{formatStarDisplay(myReview.rating)}</span>
          </span>
          {myReview.review_text && (
            <><span className="text-zinc-700">·</span>
              <span className="line-clamp-1 italic text-zinc-300">"{myReview.review_text}"</span></>
          )}
        </div>
      )}

      {/* ── Tabs ─────────────────────────────────────────── */}
      <div>
        <TabNav active={activeTab} onChange={setActiveTab} hasSocial={hasSocial} />

        {/* Tracks */}
        <div className={`mt-6 space-y-8 ${activeTab !== "tracks" ? "hidden" : ""}`}>
          {tracks.items?.length ? (
            <div className="space-y-0.5">
              {tracks.items.map((t, i) => {
                const s = trackStats[t.id] ?? emptyTrackStat;
                return (
                  <div key={t.id} className="group flex flex-col rounded-xl px-2 py-1.5 transition hover:bg-zinc-900/50">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <span className="w-6 shrink-0 text-right text-xs text-zinc-600 tabular-nums">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <TrackCard track={t} showAlbum={false} songPageLink showThumbnail={false} />
                      </div>
                      <span className="shrink-0 text-xs tabular-nums text-zinc-600">{formatDuration(t.duration_ms) ?? "—"}</span>
                      {session && viewerTrackRatings !== undefined && (
                        <TrackRating
                          trackId={t.id}
                          initialRating={viewerTrackRatings.get(t.id) ?? null}
                        />
                      )}
                    </div>
                    <div className="flex min-h-[1.1rem] items-center pl-8 sm:pl-9">
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

        {/* Social — leaderboard + recent listening, same pattern as artist page */}
        {hasSocial && (
          <div className={`mt-6 space-y-8 ${activeTab !== "social" ? "hidden" : ""}`}>
            {leaderboardNode}

            <section>
              <h2 className="mb-3 text-lg font-semibold text-white">Recently listened</h2>
              {friendActivityNode}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
