"use client";

import { useId } from "react";

const RECORD_BOX = {
  sm: "h-11 w-11",
  md: "h-[4.5rem] w-[4.5rem]",
  lg: "h-32 w-32",
  xl: "h-44 w-44",
} as const;

function safeId(id: string) {
  return id.replace(/:/g, "");
}

/** Static tonearm (top-down): pivot, tube, headshell, stylus — does not spin. */
function TonearmOverlay({ prefix }: { prefix: string }) {
  const arm = `url(#${prefix}-arm-metal)`;
  return (
    <svg
      viewBox="0 0 100 100"
      className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible"
      aria-hidden
    >
      <defs>
        <linearGradient id={`${prefix}-arm-metal`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e7e5e4" />
          <stop offset="35%" stopColor="#a8a29e" />
          <stop offset="70%" stopColor="#78716c" />
          <stop offset="100%" stopColor="#57534e" />
        </linearGradient>
      </defs>
      <circle cx="84" cy="16" r="4.2" fill={arm} opacity={0.95} />
      <circle cx="84" cy="16" r="2.2" fill="#292524" opacity={0.9} />
      <ellipse
        cx="88"
        cy="12"
        rx="2.5"
        ry="1.8"
        fill="#57534e"
        opacity={0.85}
        transform="rotate(-35 88 12)"
      />
      <path
        d="M 84 16 C 74 28 64 38 56 46"
        fill="none"
        stroke={arm}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M 83 15.5 C 73.5 27 63.5 37 55.5 45.5"
        fill="none"
        stroke="#fafaf9"
        strokeOpacity={0.22}
        strokeWidth={0.9}
        strokeLinecap="round"
      />
      <path
        d="M 54.5 45.5 L 51 51.5 L 54.5 53.5 L 57.5 48 Z"
        fill="#1c1917"
        stroke="#44403c"
        strokeWidth={0.35}
      />
      <circle cx="52.5" cy="51.2" r="1.1" fill="#10b981" />
      <circle cx="52.5" cy="51.2" r="0.45" fill="#ecfdf5" opacity={0.7} />
    </svg>
  );
}

/**
 * Top-down vinyl on a colored platter + static tonearm — music-themed loading indicator.
 */
function SpinningRecord({
  size = "md",
  className,
}: {
  size?: keyof typeof RECORD_BOX;
  className?: string;
}) {
  const reactId = useId();
  const prefix = safeId(reactId);
  const dim = RECORD_BOX[size];

  const labelFill = `url(#${prefix}-label)`;
  const vinylFill = `url(#${prefix}-vinyl)`;

  return (
    <span
      className={`relative inline-block shrink-0 ${dim} ${className ?? ""}`}
      aria-hidden
    >
      <span className="absolute inset-0 rounded-full bg-gradient-to-br from-emerald-950/85 via-teal-950/40 to-zinc-950 shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_12px_40px_-12px_rgb(0_0_0/0.65)] ring-1 ring-inset ring-emerald-400/30" />
      <span
        className="absolute inset-0 rounded-full opacity-[0.85]"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, transparent 56%, rgba(45, 212, 191, 0.14) 62%, transparent 72%)",
        }}
      />
      <span className="absolute inset-[7%] block">
        <svg
          viewBox="0 0 100 100"
          className="h-full w-full animate-spin rounded-full motion-reduce:animate-none"
          style={{ animationDuration: "2.6s" }}
        >
          <defs>
            <linearGradient
              id={`${prefix}-label`}
              x1="15%"
              y1="15%"
              x2="85%"
              y2="85%"
            >
              <stop offset="0%" stopColor="#059669" />
              <stop offset="45%" stopColor="#0d9488" />
              <stop offset="100%" stopColor="#2dd4bf" />
            </linearGradient>
            <radialGradient id={`${prefix}-vinyl`} cx="42%" cy="38%" r="65%">
              <stop offset="0%" stopColor="#115e59" stopOpacity={0.5} />
              <stop offset="50%" stopColor="#0c0a09" />
              <stop offset="100%" stopColor="#020617" />
            </radialGradient>
          </defs>
          <title>Loading</title>
          <circle cx="50" cy="50" r="48" fill={vinylFill} />
          <circle
            cx="50"
            cy="50"
            r="48"
            fill="none"
            stroke="#0d9488"
            strokeOpacity={0.4}
            strokeWidth={0.55}
          />
          {[44, 40, 36, 32, 28, 24, 20].map((r) => (
            <circle
              key={r}
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke="currentColor"
              className="text-teal-500/40"
              strokeWidth={0.35}
            />
          ))}
          <circle cx="50" cy="50" r="15" fill={labelFill} />
          <circle
            cx="50"
            cy="50"
            r="15"
            fill="none"
            stroke="#6ee7b7"
            strokeOpacity={0.5}
            strokeWidth={0.55}
          />
          <path
            d="M 50 35 A 15 15 0 0 1 62 42"
            fill="none"
            stroke="#ecfdf5"
            strokeOpacity={0.2}
            strokeWidth={1.2}
            strokeLinecap="round"
          />
          <circle cx="50" cy="50" r="3.25" fill="#020617" />
          <circle
            cx="50"
            cy="50"
            r="3.25"
            fill="none"
            stroke="#2dd4bf"
            strokeOpacity={0.55}
            strokeWidth={0.45}
          />
        </svg>
      </span>
      <TonearmOverlay prefix={prefix} />
    </span>
  );
}

/**
 * Accessible loading indicator — spinning record (top-down) on a platter.
 */
export function LoadingSpinner({
  size = "md",
  className,
  label,
}: {
  size?: keyof typeof RECORD_BOX;
  className?: string;
  /** Visually hidden; omit when parent provides visible text */
  label?: string;
}) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex shrink-0 items-center justify-center ${className ?? ""}`}
    >
      <SpinningRecord size={size} />
      {label ? (
        <span className="sr-only">{label}</span>
      ) : (
        <span className="sr-only">Loading</span>
      )}
    </span>
  );
}

/**
 * Centered spinner + optional message (forms, reports, thread detail, sidebar slots).
 */
export function InlineLoading({
  label,
  message,
  className,
  size = "lg",
}: {
  /** Short a11y label */
  label?: string;
  /** Visible helper text under the spinner */
  message?: string;
  className?: string;
  size?: keyof typeof RECORD_BOX;
}) {
  return (
    <div
      className={`flex min-h-[8rem] flex-col items-center justify-center gap-4 px-4 py-8 text-center ${className ?? ""}`}
    >
      <LoadingSpinner size={size} label={label ?? message} />
      {message ? (
        <p className="max-w-sm text-sm text-zinc-500">{message}</p>
      ) : null}
    </div>
  );
}

/**
 * Full-width section placeholder for route `loading.tsx` when skeletons not used (profiles, entity pages, forms).
 */
export function PageLoadingSpinner({
  title = "Loading…",
  className,
}: {
  title?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex min-h-[50vh] flex-col items-center justify-center gap-5 py-16 ${className ?? ""}`}
    >
      <LoadingSpinner size="xl" label={title} />
      <p className="text-sm text-zinc-500">{title}</p>
    </div>
  );
}
