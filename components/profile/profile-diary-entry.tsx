// components/profile/profile-diary-entry.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

export type DiaryEntry = {
  id: string;
  entity_type: "album" | "song";
  entity_id: string;
  rating: number;
  review_text: string | null;
  created_at: string;
  name: string | null;
  image_url: string | null;
  artist_name: string | null;
  listen_count: number | null;
};

function HalfStarDisplay({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const filled = rating >= i;
        const half = !filled && rating >= i - 0.5;
        return (
          <span key={i} className="relative inline-block h-3.5 w-3.5 text-zinc-700">
            <span className="absolute inset-0 flex items-center justify-center text-sm leading-none">★</span>
            <span
              className="absolute inset-y-0 left-0 overflow-hidden text-amber-400 text-sm leading-none flex items-center justify-center w-3.5"
              style={{ width: filled ? "100%" : half ? "50%" : "0%" }}
            >
              ★
            </span>
          </span>
        );
      })}
      <span className="ml-1 text-xs tabular-nums text-zinc-500">{rating}</span>
    </span>
  );
}

export function ProfileDiaryEntry({ entry }: { entry: DiaryEntry }) {
  const [expanded, setExpanded] = useState(false);
  const href = entry.entity_type === "album"
    ? `/album/${entry.entity_id}`
    : `/song/${entry.entity_id}`;

  const date = new Date(entry.created_at);
  const day = date.getDate();

  return (
    <div className="flex gap-3 py-3">
      {/* Day number */}
      <div className="w-7 shrink-0 pt-0.5 text-right text-sm tabular-nums text-zinc-600">
        {day}
      </div>

      {/* Art */}
      <Link href={href} className="shrink-0">
        {entry.image_url ? (
          <Image
            src={entry.image_url}
            alt={entry.name ?? ""}
            width={40}
            height={40}
            className="rounded object-cover"
          />
        ) : (
          <div className="h-10 w-10 rounded bg-zinc-800" />
        )}
      </Link>

      {/* Main content */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <Link href={href} className="truncate text-sm font-medium text-white hover:underline">
            {entry.name ?? "Unknown"}
          </Link>
          <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            {entry.entity_type === "album" ? "Album" : "Track"}
          </span>
          {entry.artist_name ? (
            <span className="truncate text-sm text-zinc-500">{entry.artist_name}</span>
          ) : null}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <HalfStarDisplay rating={entry.rating} />
          {entry.listen_count != null && entry.listen_count > 0 ? (
            <span className="text-xs text-zinc-600">
              played {entry.listen_count}×
            </span>
          ) : null}
        </div>

        {entry.review_text ? (
          <div className="mt-1.5">
            <p
              className={`text-sm leading-relaxed text-zinc-400 ${expanded ? "" : "line-clamp-2"}`}
            >
              {entry.review_text}
            </p>
            {entry.review_text.length > 120 ? (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-0.5 text-xs text-zinc-600 hover:text-zinc-400"
              >
                {expanded ? "less" : "more"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
