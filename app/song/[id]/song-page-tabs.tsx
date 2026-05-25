"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ReviewsSectionWithData } from "@/components/reviews-section-with-data";
import { MediaGrid, type MediaItem } from "@/components/media/MediaGrid";
import { SongInfoTab } from "@/components/info-tab/SongInfoTab";
import type { ReviewsResponse } from "@/lib/hooks/use-reviews";
import type { ListenLogWithUser } from "@/types";
import type { AlbumLeaderboardEntry } from "@/lib/queries";
import { formatStarDisplay } from "@/lib/ratings";
import { formatRelativeTime } from "@/lib/time";

type Tab = "reviews" | "info" | "recommendations" | "social";

function TabNav({
  active, onChange, hasSocial, hasRecommendations,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
  hasSocial: boolean;
  hasRecommendations: boolean;
}) {
  const tabs: { id: Tab; label: string }[] = [
    { id: "reviews", label: "Reviews" },
    { id: "info", label: "Info" },
    ...(hasRecommendations ? [{ id: "recommendations" as Tab, label: "Recommended" }] : []),
    ...(hasSocial ? [{ id: "social" as Tab, label: "Social" }] : []),
  ];
  return (
    <div className="flex gap-0 border-b border-zinc-800/80">
      {tabs.map((tab) => (
        <button key={tab.id} type="button" onClick={() => onChange(tab.id)}
          className={`relative px-5 py-3 text-sm font-medium transition-colors duration-150 ${active === tab.id ? "text-white" : "text-zinc-500 hover:text-zinc-300"}`}>
          {tab.label}
          {active === tab.id && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-gold-400" />}
        </button>
      ))}
    </div>
  );
}

export function SongPageTabs({
  entityId,
  trackName,
  reviewsInitialData,
  recentListens,
  leaderboard,
  hasSocial,
  albumImageUrl,
  relatedTracks = [],
  producers = [],
  songwriters = [],
  featuring = [],
  samples = [],
  sampledBy = [],
  covers = [],
  creditsEnrichedAt: initialCreditsEnrichedAt = null,
}: {
  entityId: string;
  trackName: string;
  reviewsInitialData: ReviewsResponse | null;
  recentListens: ListenLogWithUser[];
  leaderboard: AlbumLeaderboardEntry[] | null;
  hasSocial: boolean;
  albumImageUrl: string | null;
  relatedTracks?: SpotifyApi.TrackObjectFull[];
  producers?: any[];
  songwriters?: any[];
  featuring?: any[];
  samples?: any[];
  sampledBy?: any[];
  covers?: any[];
  creditsEnrichedAt?: string | null;
}) {
  const [active, setActive] = useState<Tab>("reviews");
  const initialHasContent = producers.length > 0 || songwriters.length > 0 || featuring.length > 0 || samples.length > 0 || sampledBy.length > 0 || covers.length > 0;
  const [producersState, setProducers] = useState(producers ?? []);
  const [songwritersState, setSongwriters] = useState(songwriters ?? []);
  const [featuringState, setFeaturing] = useState(featuring ?? []);
  const [samplesState, setSamples] = useState(samples ?? []);
  const [sampledByState, setSampledBy] = useState(sampledBy ?? []);
  const [coversState, setCovers] = useState(covers ?? []);
  const [creditsEnrichedAtState, setCreditsEnrichedAt] = useState(initialCreditsEnrichedAt ?? null);
  // Only poll when enrichment hasn't run yet (null timestamp at page load).
  // If the timestamp is already set, enrichment already ran — show the result immediately.
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
        const res = await fetch(`/api/songs/${encodeURIComponent(entityId)}`);
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          if (data.credits_enriched_at) {
            setProducers(data.producers ?? []);
            setSongwriters(data.songwriters ?? []);
            setFeaturing(data.featuring ?? []);
            setSamples(data.samples ?? []);
            setSampledBy(data.sampled_by ?? []);
            setCovers(data.covers ?? []);
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
  }, [entityId]); // eslint-disable-line react-hooks/exhaustive-deps
  const max = leaderboard?.[0]?.playCount ?? 1;
  const hasRecommendations = relatedTracks.length > 0;

  return (
    <div>
      <TabNav active={active} onChange={setActive} hasSocial={hasSocial} hasRecommendations={hasRecommendations} />

      {/* Reviews */}
      <div className={`mt-6 ${active !== "reviews" ? "hidden" : ""}`}>
        <ReviewsSectionWithData
          entityType="song"
          entityId={entityId}
          spotifyName={trackName}
          initialData={reviewsInitialData}
        />
      </div>

      {/* Info */}
      {active === "info" && (
        <div className="mt-6">
          <SongInfoTab
            producers={producersState}
            songwriters={songwritersState}
            featuring={featuringState}
            samples={samplesState}
            sampledBy={sampledByState}
            covers={coversState}
            isEnriching={isPolling}
          />
        </div>
      )}

      {/* Recommendations */}
      {hasRecommendations && (
        <div className={`mt-6 ${active !== "recommendations" ? "hidden" : ""}`}>
          <MediaGrid
            items={relatedTracks.map((t): MediaItem => ({
              id: t.id,
              type: "song",
              title: t.name,
              artist: t.artists?.map((a) => a.name).join(", ") ?? "",
              artworkUrl: t.album?.images?.[0]?.url ?? null,
            }))}
          />
        </div>
      )}

      {/* Social */}
      {hasSocial && (
        <div className={`mt-6 space-y-8 ${active !== "social" ? "hidden" : ""}`}>
          {/* Leaderboard */}
          {leaderboard && leaderboard.length >= 2 && (
            <section>
              <h2 className="mb-4 text-lg font-semibold text-white">Among your friends</h2>
              <ul className="space-y-3">
                {leaderboard.map((entry, i) => {
                  const pct = Math.max(4, Math.round((entry.playCount / max) * 100));
                  return (
                    <li key={entry.userId}
                      className={`rounded-2xl px-4 py-3 transition ${
                        entry.isViewer
                          ? "bg-gold-950/40 ring-1 ring-gold-500/20"
                          : "bg-zinc-900/40 ring-1 ring-white/[0.04]"
                      }`}>
                      <div className="flex items-center gap-3">
                        <span className={`w-5 shrink-0 text-center text-sm font-bold tabular-nums ${i === 0 ? "text-amber-400" : "text-zinc-600"}`}>
                          {i + 1}
                        </span>
                        <Link href={`/profile/${entry.userId}`} className="shrink-0">
                          {entry.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={entry.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover ring-1 ring-white/10" />
                          ) : (
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold text-zinc-300 ring-1 ring-white/10">
                              {entry.username[0]?.toUpperCase() ?? "?"}
                            </span>
                          )}
                        </Link>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <Link href={`/profile/${entry.userId}`}
                              className={`truncate text-sm font-medium hover:underline ${entry.isViewer ? "text-gold-300" : "text-zinc-200"}`}>
                              {entry.isViewer ? "You" : entry.username}
                            </Link>
                            <span className={`shrink-0 text-xs tabular-nums font-medium ${entry.isViewer ? "text-gold-400" : "text-zinc-500"}`}>
                              {entry.playCount.toLocaleString()} {entry.playCount === 1 ? "play" : "plays"}
                            </span>
                          </div>
                          <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-800/60">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${entry.isViewer ? "bg-gold-500" : "bg-zinc-500"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* Recent listens */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">Recently played</h2>
            {recentListens.length > 0 ? (
              <ul className="space-y-2">
                {recentListens.map((log) => {
                  const username = log.user?.username ?? "Someone";
                  return (
                    <li key={log.id}>
                      <div className="flex items-center gap-3 rounded-2xl border border-zinc-800/60 bg-zinc-900/40 px-3 py-2.5 transition hover:bg-zinc-900/60">
                        {albumImageUrl && (
                          <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/[0.07]">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={albumImageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm">
                            <Link href={log.user?.id ? `/profile/${log.user.id}` : "#"}
                              className="font-semibold text-white hover:underline">
                              {username}
                            </Link>
                            <span className="text-zinc-400"> played this</span>
                          </p>
                          <p className="mt-0.5 text-xs text-zinc-500 tabular-nums">
                            {formatRelativeTime(log.listened_at)}
                          </p>
                        </div>
                        <Link href={log.user?.id ? `/profile/${log.user.id}` : "#"} className="shrink-0">
                          {log.user?.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={log.user.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover ring-1 ring-white/10" />
                          ) : (
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-semibold text-zinc-400 ring-1 ring-white/10">
                              {username[0]?.toUpperCase() ?? "?"}
                            </span>
                          )}
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="py-8 text-center text-sm text-zinc-500">No recent plays from your network.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
