"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import type { GenreKey } from "@/lib/onboarding/genre-map";
import { StarRatingInput } from "@/components/ui/star-rating";

export type AlbumSuggestion = {
  id: string;
  name: string;
  artistName: string;
  imageUrl: string | null;
};

export type RatedAlbum = {
  albumId: string;
  rating: number;
  reviewText?: string;
};

type GenreGroup = {
  genreKey: string;
  genreLabel: string;
  albums: AlbumSuggestion[];
};

type Props = {
  suggestions: GenreGroup[];
  onRatingsChange: (ratings: RatedAlbum[]) => void;
};

export function RatingGrid({ suggestions, onRatingsChange }: Props) {
  const [ratings, setRatings] = useState<Map<string, number>>(new Map());
  const [reviewTexts, setReviewTexts] = useState<Map<string, string>>(new Map());
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());

  const handleRating = useCallback(
    (albumId: string, rating: number) => {
      const next = new Map(ratings).set(albumId, rating);
      setRatings(next);
      const result: RatedAlbum[] = Array.from(next.entries()).map(([id, r]) => ({
        albumId: id,
        rating: r,
        reviewText: reviewTexts.get(id) || undefined,
      }));
      onRatingsChange(result);
    },
    [ratings, reviewTexts, onRatingsChange],
  );

  const handleReviewText = useCallback(
    (albumId: string, text: string) => {
      const next = new Map(reviewTexts).set(albumId, text);
      setReviewTexts(next);
      const result: RatedAlbum[] = Array.from(ratings.entries()).map(([id, r]) => ({
        albumId: id,
        rating: r,
        reviewText: next.get(id) || undefined,
      }));
      onRatingsChange(result);
    },
    [ratings, reviewTexts, onRatingsChange],
  );

  const toggleNote = (albumId: string) => {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      next.has(albumId) ? next.delete(albumId) : next.add(albumId);
      return next;
    });
  };

  const ratedCount = ratings.size;

  return (
    <div>
      {ratedCount > 0 ? (
        <p className="mb-4 text-sm text-zinc-500">
          {ratedCount} album{ratedCount === 1 ? "" : "s"} rated
        </p>
      ) : (
        <p className="mb-4 text-sm text-zinc-500">
          Rate albums you know. Skip anything unfamiliar.
        </p>
      )}

      <div className="space-y-8">
        {suggestions.map((group) => (
          <div key={group.genreKey}>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-600">
              {group.genreLabel}
            </h3>
            <div className="space-y-3">
              {group.albums.map((album) => {
                const currentRating = ratings.get(album.id) ?? 0;
                const noteExpanded = expandedNotes.has(album.id);
                return (
                  <div key={album.id} className="flex gap-3">
                    {album.imageUrl ? (
                      <Image
                        src={album.imageUrl}
                        alt={album.name}
                        width={48}
                        height={48}
                        className="shrink-0 rounded object-cover"
                      />
                    ) : (
                      <div className="h-12 w-12 shrink-0 rounded bg-zinc-800" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{album.name}</p>
                      <p className="truncate text-xs text-zinc-500">{album.artistName}</p>
                      <div className="mt-1.5 flex items-center gap-3">
                        <StarRatingInput
                          value={currentRating}
                          onChange={(r) => handleRating(album.id, r)}
                        />
                        {currentRating > 0 ? (
                          <button
                            type="button"
                            onClick={() => toggleNote(album.id)}
                            className="text-xs text-zinc-600 hover:text-zinc-400"
                          >
                            {noteExpanded ? "hide note" : "add note"}
                          </button>
                        ) : null}
                      </div>
                      {noteExpanded ? (
                        <textarea
                          rows={2}
                          placeholder="What do you think? (optional)"
                          value={reviewTexts.get(album.id) ?? ""}
                          onChange={(e) => handleReviewText(album.id, e.target.value)}
                          className="mt-2 w-full resize-none rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:border-emerald-600 focus:outline-none"
                        />
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
