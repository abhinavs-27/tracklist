"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  FavoriteAlbumsPicker,
  type FavoriteAlbumPick,
} from "@/components/favorite-albums-picker";
import { LastfmConnectModal } from "@/components/onboarding/lastfm-connect-modal";
import { LastfmSkipWarningDialog } from "@/components/onboarding/lastfm-skip-warning-dialog";
import { InlineSpinner } from "@/components/ui/inline-spinner";
import { queryKeys } from "@/lib/query-keys";

type Props = {
  userId: string;
  initialUsername: string;
  initialFavoriteAlbums: FavoriteAlbumPick[];
  /** If Last.fm was linked outside this wizard, step 3 is a single “Finish”. */
  hasLastfmAlready?: boolean;
  /** Deep-link from invite join: scroll into view (embedded only). */
  scrollIntoView?: boolean;
  /** Full-page onboarding route: larger layout and navigate after completion. */
  variant?: "embedded" | "fullPage";
  /** Server-validated path (e.g. `/communities/…`) after onboarding on full page. */
  nextPath?: string | null;
  /** User arrived from a community invite link; show contextual copy. */
  inviteFlow?: boolean;
};

export function ProfileOnboarding({
  userId,
  initialUsername,
  initialFavoriteAlbums,
  hasLastfmAlready = false,
  scrollIntoView = false,
  variant = "embedded",
  nextPath = null,
  inviteFlow = false,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const rootRef = useRef<HTMLDivElement>(null);
  const fullPage = variant === "fullPage";

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [usernameInput, setUsernameInput] = useState(initialUsername);

  useEffect(() => {
    setUsernameInput(initialUsername);
  }, [initialUsername]);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [favorites, setFavorites] =
    useState<FavoriteAlbumPick[]>(initialFavoriteAlbums);

  const [stepBusy, setStepBusy] = useState(false);
  const [favoritesError, setFavoritesError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [lastfmSkipWarningOpen, setLastfmSkipWarningOpen] = useState(false);

  useEffect(() => {
    if (fullPage || !scrollIntoView || !rootRef.current) return;
    rootRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [fullPage, scrollIntoView]);

  const finishAndGo = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.favorites(userId) });
    if (fullPage) {
      router.replace(nextPath ?? "/feed");
    } else {
      router.refresh();
    }
  }, [fullPage, nextPath, queryClient, router, userId]);

  const completeOnboarding = useCallback(async () => {
    setFinishing(true);
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboarding_completed: true }),
      });
      if (res.ok) {
        finishAndGo();
      }
    } finally {
      setFinishing(false);
    }
  }, [finishAndGo]);

  const goStep1 = useCallback(async () => {
    setUsernameError(null);
    const next = usernameInput.trim();
    if (next.length < 3) {
      setUsernameError("Username must be at least 3 characters.");
      return;
    }
    setStepBusy(true);
    try {
      if (next !== initialUsername.trim()) {
        const res = await fetch("/api/users/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: next }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setUsernameError(data.error ?? "Could not update username");
          return;
        }
      }
      setStep(2);
    } finally {
      setStepBusy(false);
    }
  }, [usernameInput, initialUsername]);

  const goStep2 = useCallback(async () => {
    setFavoritesError(null);
    setStepBusy(true);
    try {
      const res = await fetch("/api/users/me/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          albums: favorites.map((a) => a.album_id),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setFavoritesError(data.error ?? "Could not save favorites");
        return;
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.favorites(userId) });
      setStep(3);
    } finally {
      setStepBusy(false);
    }
  }, [favorites, queryClient, userId]);

  const skipFavorites = useCallback(() => {
    setFavoritesError(null);
    setStep(3);
  }, []);

  const onLastfmConnected = useCallback(async () => {
    await fetch("/api/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onboarding_completed: true }),
    }).catch(() => {});
    finishAndGo();
  }, [finishAndGo]);

  const h2 = fullPage
    ? "text-2xl font-semibold tracking-tight text-white sm:text-3xl"
    : "text-lg font-semibold text-white";
  const bodyMuted = fullPage
    ? "mt-3 text-base leading-relaxed text-zinc-400 sm:text-lg"
    : "mt-2 text-sm leading-relaxed text-zinc-400";
  const bodyBright = fullPage
    ? "mt-3 text-base leading-relaxed text-zinc-300 sm:text-lg"
    : "mt-2 text-sm leading-relaxed text-zinc-300";
  const stepperRow = fullPage
    ? "flex flex-wrap items-center gap-3 text-sm font-medium text-zinc-500 sm:text-base"
    : "flex flex-wrap items-center gap-2 text-xs font-medium text-zinc-500";
  const primaryBtn = fullPage
    ? "inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-base font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
    : "inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50";
  const secondaryBtn = fullPage
    ? "rounded-xl border border-zinc-600 px-5 py-3 text-base text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
    : "rounded-xl border border-zinc-600 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50";
  const ghostBtn = fullPage
    ? "rounded-xl px-5 py-3 text-base text-zinc-500 hover:text-zinc-300 disabled:opacity-50"
    : "rounded-xl px-4 py-2.5 text-sm text-zinc-500 hover:text-zinc-300 disabled:opacity-50";
  const inputClass = fullPage
    ? "mt-1 w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-3 text-base text-white placeholder:text-zinc-600 disabled:opacity-50"
    : "mt-1 w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 disabled:opacity-50";
  const labelClass = fullPage ? "text-sm font-medium text-zinc-400" : "text-xs font-medium text-zinc-400";
  const lastfmActionBtn = fullPage
    ? "rounded-xl bg-emerald-600 px-5 py-3 text-base font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
    : "rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50";
  const lastfmGhostBtn = fullPage
    ? "flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-base text-zinc-500 hover:text-zinc-300 disabled:opacity-50"
    : "flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 disabled:opacity-50";
  const backSmall = fullPage
    ? "rounded-xl border border-zinc-600 px-5 py-2.5 text-base text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
    : "rounded-xl border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50";

  return (
    <>
      <LastfmSkipWarningDialog
        open={lastfmSkipWarningOpen}
        onCancel={() => setLastfmSkipWarningOpen(false)}
        onConfirm={() => {
          setLastfmSkipWarningOpen(false);
          void completeOnboarding();
        }}
      />

      <LastfmConnectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSkip={() => void completeOnboarding()}
        onConnected={onLastfmConnected}
        title="Connect Last.fm (about a minute)"
        subtitle={`We’ll attach Last.fm to @${usernameInput.trim() || initialUsername} so your profile and communities stay in sync with what you listen to.`}
      />

      <div className={fullPage ? "mx-auto w-full max-w-2xl py-4 sm:py-10" : ""}>
        {fullPage && inviteFlow ? (
          <div className="mb-8 rounded-2xl border border-emerald-800/45 bg-emerald-950/50 px-5 py-4 text-center sm:px-6">
            <p className="text-sm font-medium text-emerald-100 sm:text-base">
              You joined a community — finish setup and we&apos;ll take you
              there.
            </p>
            <p className="mt-2 text-sm text-emerald-200/75">
              Username, a few favorite albums, then Last.fm (about a minute).
            </p>
          </div>
        ) : null}

        <div
          ref={rootRef}
          id="profile-onboarding"
          className={
            fullPage
              ? "rounded-2xl border border-emerald-900/40 bg-emerald-950/25 p-8 shadow-xl shadow-black/20 sm:p-10"
              : "rounded-2xl border border-emerald-900/40 bg-emerald-950/20 p-6"
          }
        >
          <div className={stepperRow}>
            <span
              className={step === 1 ? "text-emerald-400" : "text-zinc-500"}
            >
              1 · Username
            </span>
            <span className="text-zinc-600">→</span>
            <span
              className={step === 2 ? "text-emerald-400" : "text-zinc-500"}
            >
              2 · Favorite albums
            </span>
            <span className="text-zinc-600">→</span>
            <span
              className={step === 3 ? "text-emerald-400" : "text-zinc-500"}
            >
              3 · Last.fm
            </span>
          </div>

          {step === 1 ? (
            <div className="mt-6 space-y-5 sm:mt-8">
              <div>
                <h2 className={h2}>Choose your username</h2>
                <p className={bodyMuted}>
                  We started you from your Google account — change it here to what
                  you want on your profile URL and across Tracklist.
                </p>
              </div>
              <label className="block">
                <span className={labelClass}>Username</span>
                <input
                  type="text"
                  value={usernameInput}
                  onChange={(e) =>
                    setUsernameInput(e.target.value.toLowerCase())
                  }
                  autoComplete="username"
                  disabled={stepBusy}
                  className={inputClass}
                  placeholder="your_username"
                />
              </label>
              {usernameError ? (
                <p className="text-sm text-red-400" role="alert">
                  {usernameError}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void goStep1()}
                  disabled={stepBusy}
                  className={primaryBtn}
                >
                  {stepBusy ? (
                    <>
                      <InlineSpinner tone="emerald" />
                      Saving…
                    </>
                  ) : (
                    "Continue"
                  )}
                </button>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="mt-6 space-y-5 sm:mt-8">
              <div>
                <h2 className={h2}>Pick up to four favorite albums</h2>
                <p className={bodyMuted}>
                  They show on your profile and help others get your taste. You
                  can change them anytime.
                </p>
              </div>
              <FavoriteAlbumsPicker
                value={favorites}
                onChange={setFavorites}
                disabled={stepBusy}
                searchInputId="onboarding-fav-album-search"
              />
              {favoritesError ? (
                <p className="text-sm text-red-400" role="alert">
                  {favoritesError}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  disabled={stepBusy}
                  className={secondaryBtn}
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => void goStep2()}
                  disabled={stepBusy}
                  className={primaryBtn}
                >
                  {stepBusy ? (
                    <>
                      <InlineSpinner tone="emerald" />
                      Saving…
                    </>
                  ) : (
                    "Continue"
                  )}
                </button>
                <button
                  type="button"
                  onClick={skipFavorites}
                  disabled={stepBusy}
                  className={ghostBtn}
                >
                  Skip for now
                </button>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="mt-6 space-y-5 sm:mt-8">
              {hasLastfmAlready ? (
                <>
                  <h2 className={h2}>Last.fm is already linked</h2>
                  <p className={bodyMuted}>
                    You’re all set on the listening side. Finish onboarding to
                    unlock your full profile.
                  </p>
                  <button
                    type="button"
                    onClick={() => void completeOnboarding()}
                    disabled={finishing}
                    className={primaryBtn}
                  >
                    {finishing ? (
                      <>
                        <InlineSpinner tone="emerald" />
                        Finishing…
                      </>
                    ) : (
                      "Finish"
                    )}
                  </button>
                  <div className="flex flex-wrap gap-2 border-t border-emerald-900/30 pt-4">
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      disabled={finishing}
                      className={backSmall}
                    >
                      Back
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h2 className={h2}>Connect Last.fm — about a minute</h2>
                      <p className={bodyBright}>
                        <span className="font-medium text-zinc-100">
                          Strongly recommended:
                        </span>{" "}
                        your listening history powers feeds, communities, and
                        stats here. Create a Last.fm account (or sign in),{" "}
                        <span className="font-medium text-zinc-100">
                          connect Spotify inside Last.fm
                        </span>{" "}
                        so plays scrobble, then link your username in the modal.
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                      <button
                        type="button"
                        onClick={() => setModalOpen(true)}
                        disabled={finishing}
                        className={lastfmActionBtn}
                      >
                        Set up Last.fm
                      </button>
                      <button
                        type="button"
                        onClick={() => setLastfmSkipWarningOpen(true)}
                        disabled={finishing}
                        className={lastfmGhostBtn}
                      >
                        {finishing ? (
                          <>
                            <InlineSpinner label="Finishing" />
                            Finishing…
                          </>
                        ) : (
                          "Finish without Last.fm"
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center sm:max-w-sm">
                    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-2 py-3">
                      <p className="text-2xl font-semibold text-zinc-200">—</p>
                      <p className="text-xs text-zinc-500">Top artists</p>
                    </div>
                    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-2 py-3">
                      <p className="text-2xl font-semibold text-zinc-200">—</p>
                      <p className="text-xs text-zinc-500">Top albums</p>
                    </div>
                    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-2 py-3">
                      <p className="text-2xl font-semibold text-zinc-200">—</p>
                      <p className="text-xs text-zinc-500">Scrobbles</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 border-t border-emerald-900/30 pt-4">
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      disabled={finishing}
                      className={backSmall}
                    >
                      Back
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
