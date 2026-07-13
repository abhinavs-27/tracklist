"use client";

import { GENRES, type GenreKey } from "@/lib/onboarding/genre-map";

type Props = {
  selected: GenreKey[];
  onChange: (genres: GenreKey[]) => void;
  maxSelections?: number;
};

export function GenrePicker({ selected, onChange, maxSelections = 5 }: Props) {
  function toggle(key: GenreKey) {
    if (selected.includes(key)) {
      onChange(selected.filter((k) => k !== key));
    } else if (selected.length < maxSelections) {
      onChange([...selected, key]);
    }
  }

  return (
    <div>
      <p className="mb-3 text-sm text-zinc-500">
        Pick up to {maxSelections}. We&apos;ll show you albums to rate.
      </p>
      <div className="flex flex-wrap gap-2">
        {GENRES.map((genre) => {
          const active = selected.includes(genre.key);
          const disabled = !active && selected.length >= maxSelections;
          return (
            <button
              key={genre.key}
              type="button"
              onClick={() => toggle(genre.key)}
              disabled={disabled}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                active
                  ? "border-gold-500 bg-gold-500/10 text-gold-300"
                  : disabled
                  ? "cursor-not-allowed border-zinc-800 text-zinc-700"
                  : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white"
              }`}
            >
              {genre.label}
            </button>
          );
        })}
      </div>
      {selected.length > 0 ? (
        <p className="mt-3 text-xs text-zinc-600">
          {selected.length} selected
        </p>
      ) : null}
    </div>
  );
}
