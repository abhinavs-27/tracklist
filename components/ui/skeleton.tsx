"use client";

/** Base skeleton element for loading placeholders. */
export function Skeleton({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div
      className={`animate-pulse rounded-md bg-muted ${className}`}
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
    <div className={`overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50 ${className}`}>
      <SkeletonBlock style={{ width: "100%", height: imageHeight }} />
      <div className="p-3 space-y-2">
        <SkeletonBlock className="h-4 w-full" />
        {lines > 1 && <SkeletonBlock className="h-3 w-[75%]" />}
      </div>
    </div>
  );
}
