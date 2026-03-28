"use client";

/** Base skeleton element for loading placeholders. */
export function Skeleton({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-zinc-800/90 ${className}`}
    />
  );
}

export function SkeletonBlock({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`skeleton-shimmer rounded ${className}`}
      style={style}
    />
  );
}

export function SkeletonText({
  lines = 1,
  className = "",
  lastLineWidth,
}: {
  lines?: number;
  className?: string;
  /** e.g. "75%" so last line is shorter */
  lastLineWidth?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <SkeletonBlock
          key={i}
          className="h-4"
          style={{
            width: i === lines - 1 && lastLineWidth ? lastLineWidth : "100%",
          }}
        />
      ))}
    </div>
  );
}

export function SkeletonAvatar({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <SkeletonBlock
      className={`rounded-full ${className}`}
      style={{ width: size, height: size, minWidth: size, minHeight: size }}
    />
  );
}

export function SkeletonCard({
  className = "",
  imageHeight = 120,
  lines = 2,
}: {
  className?: string;
  imageHeight?: number | string;
  lines?: number;
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl bg-zinc-900/55 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.55)] ring-1 ring-inset ring-white/[0.07] ${className}`}
    >
      <SkeletonBlock className="rounded-none" style={{ width: "100%", height: imageHeight }} />
      <div className="space-y-2 p-4">
        <SkeletonBlock className="h-4 w-full rounded-md" />
        {lines > 1 && <SkeletonBlock className="h-3 w-[75%] rounded-md" />}
      </div>
    </div>
  );
}
