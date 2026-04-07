"use client";

const glyphBox =
  "relative inline-flex h-11 w-11 shrink-0 items-center justify-center text-4xl leading-none";

function StarGlyph({ index, value }: { index: number; value: number }) {
  const filled = value >= index;
  const half = !filled && value >= index - 0.5;
  return (
    <span className={glyphBox}>
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-zinc-600">
        ★
      </span>
      <span
        className="pointer-events-none absolute inset-y-0 left-0 overflow-hidden text-amber-400"
        style={{ width: filled ? "100%" : half ? "50%" : "0%" }}
      >
        <span className="flex h-full w-11 items-center justify-center">
          ★
        </span>
      </span>
    </span>
  );
}

type StarRatingInputProps = {
  value: number;
  onChange: (rating: number) => void;
  disabled?: boolean;
  className?: string;
};

/**
 * Five stars; left half = n−0.5, right half = n (same pattern as major retail sites).
 */
export function StarRatingInput({
  value,
  onChange,
  disabled,
  className = "",
}: StarRatingInputProps) {
  return (
    <div
      className={`inline-flex w-max max-w-full flex-nowrap items-center gap-0.5 ${className}`}
      role="radiogroup"
      aria-label="Rating from 1 to 5 stars in half-star steps"
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="relative inline-flex h-12 w-[3.65rem] shrink-0 select-none items-center justify-center"
        >
          <button
            type="button"
            disabled={disabled}
            className="absolute left-0 top-0 z-10 h-full w-1/2 min-w-[2.25rem] cursor-pointer rounded-l-lg border-0 bg-transparent p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/80 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={`${i - 0.5} out of 5 stars`}
            onClick={() => onChange(i - 0.5)}
          />
          <button
            type="button"
            disabled={disabled}
            className="absolute right-0 top-0 z-10 h-full w-1/2 min-w-[2.25rem] cursor-pointer rounded-r-lg border-0 bg-transparent p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/80 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={`${i} out of 5 stars`}
            onClick={() => onChange(i)}
          />
          <span className="pointer-events-none flex items-center justify-center" aria-hidden>
            <StarGlyph index={i} value={value} />
          </span>
        </div>
      ))}
    </div>
  );
}

/** Read-only row of stars (half fills supported). */
export function StarRatingDisplay({
  rating,
  className = "",
}: {
  rating: number;
  className?: string;
}) {
  const v = Math.max(0, Math.min(5, Number(rating)));
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-amber-400 ${className}`}
      aria-hidden
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <StarGlyph key={i} index={i} value={v} />
      ))}
    </span>
  );
}
