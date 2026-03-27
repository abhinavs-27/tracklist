/**
 * Default artwork when catalog / Spotify enrichment has no album image yet (e.g. Last.fm–only rows).
 */
export function CatalogArtworkPlaceholder({
  className = "",
  size = "md",
}: {
  className?: string;
  /** sm: feed rows; md: track cards; lg: feed session blocks */
  size?: "sm" | "md" | "lg";
}) {
  const sizeClass =
    size === "sm"
      ? "h-10 w-10 text-lg"
      : size === "lg"
        ? "h-14 w-14 text-2xl"
        : "h-12 w-12 text-xl";

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded bg-gradient-to-br from-zinc-800 to-zinc-950 text-zinc-500 ring-1 ring-inset ring-zinc-700/50 ${sizeClass} ${className}`}
      title="Album artwork unavailable or still loading"
      role="img"
      aria-label="Album artwork unavailable or still loading"
    >
      ♪
    </div>
  );
}
