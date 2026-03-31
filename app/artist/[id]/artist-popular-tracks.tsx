"use client";

import { useState } from "react";
import { TrackCard } from "@/components/track-card";
import type { ArtistPopularTrack } from "@/lib/queries";

const INITIAL_VISIBLE = 5;
const MAX_TRACKS = 10;

export function ArtistPopularTracks({ tracks }: { tracks: ArtistPopularTrack[] }) {
  const [expanded, setExpanded] = useState(false);
  const limit = expanded ? MAX_TRACKS : INITIAL_VISIBLE;
  const shown = tracks.slice(0, Math.min(limit, tracks.length));
  const canLoadMore = tracks.length > INITIAL_VISIBLE && !expanded;

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-white">Popular tracks</h2>
      <div className="space-y-2">
        {shown.map(({ track: t, playCount, avgRating, ratingCount }) => (
          <TrackCard
            key={t.id}
            track={t}
            showAlbum
            songPageLink
            engagement={{
              playCount,
              avgRating,
              ratingCount,
            }}
          />
        ))}
      </div>
      {canLoadMore ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-3 text-sm font-medium text-emerald-400 hover:text-emerald-300 hover:underline"
        >
          Load more
        </button>
      ) : null}
    </section>
  );
}
