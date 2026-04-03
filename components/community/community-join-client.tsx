"use client";

import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useCallback, useLayoutEffect, useState } from "react";
import { LastfmConnectModal } from "@/components/onboarding/lastfm-connect-modal";
import { LastfmSkipWarningDialog } from "@/components/onboarding/lastfm-skip-warning-dialog";
import { InlineSpinner } from "@/components/ui/inline-spinner";
import { contentMax2xl, contentMaxLg } from "@/lib/ui/layout";

type PreviewPayload = {
  community: {
    id: string;
    name: string;
    description: string | null;
    is_private: boolean;
    member_count: number;
  };
  top_tracks: Array<{
    entityId: string;
    name: string;
    image: string | null;
    uniqueListeners: number;
    score: number;
  }>;
  recent_activity: Array<{
    id: string;
    type: string;
    created_at: string;
    username: string | null;
  }>;
};

type Props = {
  token: string;
  initialPreview: PreviewPayload;
  /** Server already attempted join for logged-in users. */
  viewer: {
    isLoggedIn: boolean;
    hasLastfm: boolean;
    /** False until profile onboarding (username + favorite albums) is finished. */
    onboardingComplete: boolean;
    joinOk: boolean;
    joinError: string | null;
  };
};

export function CommunityJoinClient({ token, initialPreview, viewer }: Props) {
  const router = useRouter();
  const [showLastfmModal, setShowLastfmModal] = useState(false);
  const [signInLoading, setSignInLoading] = useState(false);
  const [joinWithoutLastfmWarningOpen, setJoinWithoutLastfmWarningOpen] =
    useState(false);

  /** Server usually redirects this path; layout effect avoids a flash if we ever render it. */
  useLayoutEffect(() => {
    if (
      viewer.isLoggedIn &&
      viewer.hasLastfm &&
      viewer.joinOk &&
      viewer.onboardingComplete
    ) {
      router.replace(`/communities/${initialPreview.community.id}`);
    }
  }, [
    viewer.isLoggedIn,
    viewer.hasLastfm,
    viewer.joinOk,
    viewer.onboardingComplete,
    router,
    initialPreview.community.id,
  ]);

  const signInWithReturn = useCallback(() => {
    setSignInLoading(true);
    const callback = `/community/join/${encodeURIComponent(token)}`;
    void signIn("google", { callbackUrl: callback });
  }, [token]);

  const afterLastfmConnected = useCallback(() => {
    router.replace(`/communities/${initialPreview.community.id}`);
    router.refresh();
  }, [router, initialPreview.community.id]);

  if (viewer.joinError) {
    return (
      <div className={`${contentMaxLg} rounded-2xl border border-red-900/50 bg-red-950/30 p-8 text-center`}>
        <p className="text-red-300">{viewer.joinError}</p>
        <Link
          href="/communities"
          className="mt-4 inline-block text-sm text-zinc-400 underline"
        >
          Back to communities
        </Link>
      </div>
    );
  }

  const c = initialPreview.community;

  return (
    <div className={`${contentMax2xl} space-y-8`}>
      <header className="text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-emerald-500/90">
          Community invite
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">
          {c.name}
        </h1>
        {c.description ? (
          <p className="mt-3 text-zinc-400">{c.description}</p>
        ) : null}
        <p className="mt-4 text-sm text-zinc-500">
          {c.member_count} {c.member_count === 1 ? "member" : "members"}
          {c.is_private ? " · Private" : " · Public"}
        </p>
      </header>

      {initialPreview.top_tracks.length > 0 ? (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-sm font-semibold text-white">
            Top tracks this week
          </h2>
          <ul className="mt-4 space-y-3">
            {initialPreview.top_tracks.map((t) => (
              <li key={t.entityId} className="flex items-center gap-3">
                {t.image ? (
                  <img
                    src={t.image}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-12 w-12 rounded object-cover"
                  />
                ) : (
                  <span className="flex h-12 w-12 items-center justify-center rounded bg-zinc-800 text-zinc-500">
                    ♪
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-zinc-100">{t.name}</p>
                  <p className="text-xs text-zinc-500">
                    {t.uniqueListeners} listeners · score {Math.round(t.score)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {initialPreview.recent_activity.length > 0 ? (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-sm font-semibold text-white">Recent activity</h2>
          <ul className="mt-4 space-y-2 text-sm text-zinc-400">
            {initialPreview.recent_activity.map((ev) => (
              <li key={ev.id}>
                <span className="text-zinc-200">
                  {ev.username ?? "Someone"}
                </span>{" "}
                · {ev.type.replace(/_/g, " ")}{" "}
                <span className="text-zinc-600">
                  {new Date(ev.created_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-col items-stretch gap-4 sm:items-center">
        {!viewer.isLoggedIn ? (
          <div className="mx-auto w-full max-w-md space-y-4">
            <p className="text-center text-sm leading-relaxed text-zinc-300">
              Sign in to join. After that,{" "}
              <span className="font-medium text-zinc-100">
                connecting Last.fm
              </span>{" "}
              is the usual next step — create a Last.fm account, link Spotify
              there, and paste your username.{" "}
              <span className="text-zinc-400">About a minute.</span>
            </p>
            <button
              type="button"
              onClick={signInWithReturn}
              disabled={signInLoading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 font-medium text-zinc-900 hover:bg-zinc-100 disabled:opacity-60"
            >
              {signInLoading ? (
                <>
                  <InlineSpinner tone="light" />
                  <span>Opening Google…</span>
                </>
              ) : (
                "Continue with Google"
              )}
            </button>
          </div>
        ) : viewer.joinOk && viewer.hasLastfm ? (
          <div
            className="mx-auto flex flex-col items-center gap-3 py-2"
            role="status"
            aria-live="polite"
          >
            <InlineSpinner label="Opening community" className="scale-125" />
            <p className="text-center text-sm text-zinc-300">
              Taking you to the community…
            </p>
          </div>
        ) : viewer.joinOk && !viewer.hasLastfm ? (
          <div className="mx-auto w-full max-w-md space-y-4 rounded-2xl border border-emerald-900/35 bg-emerald-950/25 p-5">
            <p className="text-center text-sm font-medium text-emerald-100/95">
              You&apos;re in — nice.
            </p>
            <p className="text-center text-sm leading-relaxed text-zinc-300">
              <span className="font-medium text-white">
                Next, connect Last.fm
              </span>{" "}
              so this community (and your profile) can see your real listening
              history. Create a Last.fm account if you need one, connect Spotify
              in Last.fm&apos;s settings, then add your username here.{" "}
              <span className="text-zinc-400">Most people finish in about a minute.</span>
            </p>
            <button
              type="button"
              onClick={() => setShowLastfmModal(true)}
              className="flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-emerald-950/40 hover:bg-emerald-500"
            >
              Set up Last.fm now
            </button>
            <button
              type="button"
              onClick={() => setJoinWithoutLastfmWarningOpen(true)}
              className="w-full text-center text-sm text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
            >
              Continue without Last.fm for now
            </button>
          </div>
        ) : null}
      </div>

      <LastfmSkipWarningDialog
        open={joinWithoutLastfmWarningOpen}
        onCancel={() => setJoinWithoutLastfmWarningOpen(false)}
        onConfirm={() => {
          setJoinWithoutLastfmWarningOpen(false);
          router.push(`/communities/${c.id}`);
        }}
      />

      <LastfmConnectModal
        open={showLastfmModal}
        onClose={() => setShowLastfmModal(false)}
        onSkip={() => router.push(`/communities/${c.id}`)}
        onConnected={afterLastfmConnected}
      />
    </div>
  );
}
