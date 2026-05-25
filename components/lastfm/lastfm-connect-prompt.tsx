import Link from "next/link";

function LastfmIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden>
      <path
        fill="currentColor"
        d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 2c5.523 0 10 4.477 10 10S17.523 22 12 22 2 17.523 2 12 6.477 2 12 2zm-1.5 5.5v5.25l4.5 2.25-.75 1.5-5.25-2.625V7.5h1.5z"
      />
    </svg>
  );
}

/**
 * Inline prompt shown wherever Last.fm data would appear but the user hasn't connected yet.
 */
export function LastfmConnectPrompt({
  userId,
  heading,
  body,
}: {
  userId: string;
  heading: string;
  body: string;
}) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 px-5 py-4 ring-1 ring-white/[0.04]">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-950/60 text-red-400 ring-1 ring-red-900/50">
        <LastfmIcon />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white">{heading}</p>
        <p className="mt-1 text-sm leading-relaxed text-zinc-400">{body}</p>
        <Link
          href={`/profile/${userId}?tab=taste`}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-gold-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-gold-500"
        >
          Connect Last.fm →
        </Link>
      </div>
    </div>
  );
}
