/** Small loading indicator for buttons and inline status. */
export function InlineSpinner({
  className = "",
  label,
  tone = "dark",
}: {
  className?: string;
  /** Announced to screen readers when provided. */
  label?: string;
  /** `light` = white/zinc-100 buttons; `emerald` = emerald primary; `white` = red/dark CTAs. */
  tone?: "dark" | "light" | "emerald" | "white";
}) {
  const ring =
    tone === "light"
      ? "border-zinc-300 border-t-zinc-900"
      : tone === "emerald"
        ? "border-emerald-300/50 border-t-white"
        : tone === "white"
          ? "border-white/35 border-t-white"
          : "border-zinc-500 border-t-emerald-400";
  return (
    <span
      className={`inline-flex items-center justify-center ${className}`}
      role={label ? "status" : undefined}
      aria-label={label}
    >
      <span
        className={`h-4 w-4 shrink-0 animate-spin rounded-full border-2 ${ring}`}
        aria-hidden={!!label}
      />
    </span>
  );
}
