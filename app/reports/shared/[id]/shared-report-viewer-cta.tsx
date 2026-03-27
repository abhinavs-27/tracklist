import Link from "next/link";

type Props = {
  viewerIsLoggedIn: boolean;
  callbackPath: string;
};

/**
 * Shown to logged-out visitors on a shared report so they can join or sign in
 * and return to this page.
 */
export function SharedReportViewerCta({ viewerIsLoggedIn, callbackPath }: Props) {
  if (viewerIsLoggedIn) return null;

  const signInHref = `/auth/signin?callbackUrl=${encodeURIComponent(callbackPath)}`;

  return (
    <div className="rounded-xl border border-emerald-900/45 bg-emerald-950/30 px-4 py-4 sm:px-5">
      <p className="text-sm leading-relaxed text-zinc-200">
        <span className="font-semibold text-white">Tracklist</span> is where this
        report comes from — log your listens, follow friends, and build your own
        snapshots.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link
          href={signInHref}
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
        >
          Join or sign in
        </Link>
        <span className="text-xs text-zinc-500">
          Free · Continue with Google
        </span>
      </div>
    </div>
  );
}
