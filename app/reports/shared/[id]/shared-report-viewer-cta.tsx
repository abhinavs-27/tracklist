import Link from "next/link";

type Props = {
  viewerIsLoggedIn: boolean;
  callbackPath: string;
};

export function SharedReportViewerCta({ viewerIsLoggedIn, callbackPath }: Props) {
  if (viewerIsLoggedIn) return null;

  const signInHref = `/auth/signin?callbackUrl=${encodeURIComponent(callbackPath)}`;

  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 px-6 py-7 text-center">
      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
        Tracklist
      </p>
      <p className="mt-3 text-lg font-semibold text-white">
        Track your own listening history
      </p>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        Log albums, see your top artists over time, and share moments like this one.
      </p>
      <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <Link
          href={signInHref}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
        >
          Get started free
        </Link>
        <span className="text-xs text-zinc-600">Continue with Google · No credit card</span>
      </div>
    </div>
  );
}
