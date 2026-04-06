"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  FavoriteAlbumsPicker,
  MAX_FAVORITE_ALBUMS,
  type FavoriteAlbumPick,
} from "@/components/favorite-albums-picker";
import { SampleWeeklyChartPreview } from "@/components/home/sample-weekly-chart-preview";
import { LastfmConnectModal } from "@/components/onboarding/lastfm-connect-modal";
import { LastfmSkipWarningDialog } from "@/components/onboarding/lastfm-skip-warning-dialog";
import { FollowButton } from "@/components/follow-button";
import { InlineSpinner } from "@/components/ui/inline-spinner";
import { queryKeys } from "@/lib/query-keys";

function pathWithWelcome(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const u = new URL(normalized, "http://local");
  u.searchParams.set("welcome", "1");
  return `${u.pathname}${u.search}`;
}

type SuggestedUser = {
  id: string;
  username: string;
  avatar_url: string | null;
  followers_count?: number;
  reasons?: string[];
};

type Props = {
  userId: string;
  initialUsername: string;
  initialFavoriteAlbums: FavoriteAlbumPick[];
  /** If Last.fm was linked before this wizard, step 3 is a single “Continue”. */
  hasLastfmAlready?: boolean;
  /** Server-validated path after onboarding (e.g. `/communities/…`). */
  nextPath?: string | null;
  /** User arrived from a community invite link (validated server-side). */
  inviteFlow?: boolean;
  /** Invite token for joining after bootstrap (only when `inviteFlow`). */
  inviteToken?: string | null;
  /** Community name for invite UI (only when `inviteFlow`). */
  communityInviteName?: string | null;
};

export function ProfileOnboarding({
  userId,
  initialUsername,
  initialFavoriteAlbums,
  hasLastfmAlready = false,
  nextPath = null,
  inviteFlow = false,
  inviteToken = null,
  communityInviteName = null,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { update: updateSession } = useSession();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [usernameInput, setUsernameInput] = useState(initialUsername);

  useEffect(() => {
    setUsernameInput(initialUsername);
  }, [initialUsername]);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [favorites, setFavorites] =
    useState<FavoriteAlbumPick[]>(initialFavoriteAlbums);
  const [favoritesError, setFavoritesError] = useState<string | null>(null);
  const [stepBusy, setStepBusy] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  const [lastfmModalOpen, setLastfmModalOpen] = useState(false);
  const [lastfmSkipWarningOpen, setLastfmSkipWarningOpen] = useState(false);

  const [suggestedUsers, setSuggestedUsers] = useState<SuggestedUser[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  const finishAndGo = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.tasteIdentity(userId),
    });
    void queryClient.invalidateQueries({ queryKey: queryKeys.favorites(userId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.feed() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.discover() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.tasteMatches() });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.recommendedCommunities(),
    });
    if (inviteFlow) {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.communitiesMine(),
      });
    }
    const dest = pathWithWelcome(nextPath ?? "/");
    router.replace(dest);
  }, [nextPath, queryClient, router, userId, inviteFlow]);

  const completeBootstrap = useCallback(async () => {
    setBootstrapError(null);
    setStepBusy(true);
    try {
      const res = await fetch("/api/onboarding/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        ok?: boolean;
      };
      if (!res.ok) {
        setBootstrapError(data.error ?? "Could not finish setup");
        return;
      }
      try {
        await updateSession?.({ onboarding_completed: true });
      } catch {
        /* JWT refresh is best-effort; DB row is already updated */
      }
      const token = inviteToken?.trim();
      if (inviteFlow && token) {
        const jr = await fetch(
          `/api/community/join/${encodeURIComponent(token)}`,
          { method: "POST" },
        );
        const jd = (await jr.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!jr.ok) {
          setBootstrapError(
            typeof jd.error === "string"
              ? jd.error
              : "Could not join the community. Your profile is ready — try the invite link again.",
          );
          return;
        }
      }
      finishAndGo();
    } finally {
      setStepBusy(false);
    }
  }, [finishAndGo, inviteFlow, inviteToken, updateSession]);

  useEffect(() => {
    if (step !== 4) return;
    let cancelled = false;
    (async () => {
      setSuggestionsLoading(true);
      try {
        if (inviteFlow && inviteToken?.trim()) {
          const sRes = await fetch(
            `/api/onboarding/community-invite-suggestions?token=${encodeURIComponent(
              inviteToken.trim(),
            )}`,
            { cache: "no-store" },
          );
          if (!cancelled && sRes.ok) {
            const sData = (await sRes.json()) as { users?: SuggestedUser[] };
            setSuggestedUsers(sData.users ?? []);
          }
        } else if (!inviteFlow) {
          const sRes = await fetch("/api/onboarding/suggestions", {
            cache: "no-store",
          });
          if (!cancelled && sRes.ok) {
            const sData = (await sRes.json()) as { users?: SuggestedUser[] };
            setSuggestedUsers(sData.users ?? []);
          }
        }
      } finally {
        if (!cancelled) setSuggestionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, inviteFlow, inviteToken]);

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
    if (favorites.length < 1) {
      setFavoritesError("Pick at least one album.");
      return;
    }
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

  const advanceFromLastfm = useCallback(() => {
    setLastfmModalOpen(false);
    setStep(4);
  }, []);

  const onLastfmConnected = useCallback(() => {
    advanceFromLastfm();
  }, [advanceFromLastfm]);

  const h2 =
    "text-3xl font-semibold tracking-tight text-white sm:text-[2rem] sm:leading-tight";
  const bodyMuted =
    "mt-3 text-base leading-relaxed text-zinc-400 sm:text-lg";
  const stepperRow =
    "flex flex-wrap items-center gap-2 text-sm font-medium text-zinc-500 sm:text-base";
  const primaryBtn =
    "inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-base font-semibold text-white hover:bg-emerald-500 disabled:opacity-50";
  const secondaryBtn =
    "rounded-xl border border-zinc-600 px-5 py-3 text-base text-zinc-300 hover:bg-zinc-800 disabled:opacity-50";
  const ghostBtn =
    "rounded-xl px-5 py-3 text-base text-zinc-500 hover:text-zinc-300 disabled:opacity-50";
  const inputClass =
    "mt-1 w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-3 text-base text-white placeholder:text-zinc-600 disabled:opacity-50";
  const labelClass = "text-sm font-medium text-zinc-400";
  const lastfmActionBtn = primaryBtn;
  const lastfmGhostBtn = ghostBtn;
  const backSmall = secondaryBtn;

  return (
    <>
      <LastfmSkipWarningDialog
        open={lastfmSkipWarningOpen}
        onCancel={() => setLastfmSkipWarningOpen(false)}
        onConfirm={() => {
          setLastfmSkipWarningOpen(false);
          advanceFromLastfm();
        }}
      />

      <LastfmConnectModal
        open={lastfmModalOpen}
        onClose={() => setLastfmModalOpen(false)}
        onSkip={advanceFromLastfm}
        onConnected={onLastfmConnected}
        title="Get your weekly chart"
        subtitle={`We’ll link listening to @${usernameInput.trim() || initialUsername} via Last.fm so your charts and feed match what you play.`}
      />

      <div className="mx-auto w-full max-w-2xl py-4 sm:py-10">
        {inviteFlow ? (
          <div className="mb-10 rounded-2xl bg-emerald-950/45 px-5 py-5 text-center shadow-[0_12px_40px_-12px_rgba(6,78,59,0.35)] ring-1 ring-inset ring-emerald-400/20 sm:px-6">
            <p className="text-sm font-medium text-emerald-100 sm:text-base">
              You&apos;re joining{" "}
              <span className="text-white">
                {communityInviteName ?? "a community"}
              </span>{" "}
              — finish setup and we&apos;ll add you and open it when you&apos;re
              done.
            </p>
            <p className="mt-2 text-sm text-emerald-200/75">
              Username, favorite albums, your listening chart, then meet members
              — same steps as everyone else.
            </p>
          </div>
        ) : null}

        <div
          id="profile-onboarding"
          className="rounded-2xl bg-emerald-950/20 p-8 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.65)] ring-1 ring-inset ring-emerald-500/15 sm:p-10"
        >
          <div className={stepperRow}>
            <span className={step === 1 ? "text-emerald-400" : "text-zinc-500"}>
              1 · Username
            </span>
            <span className="text-zinc-600">→</span>
            <span className={step === 2 ? "text-emerald-400" : "text-zinc-500"}>
              2 · Albums
            </span>
            <span className="text-zinc-600">→</span>
            <span className={step === 3 ? "text-emerald-400" : "text-zinc-500"}>
              3 · Your chart
            </span>
            <span className="text-zinc-600">→</span>
            <span
              className={step === 4 ? "text-emerald-400" : "text-zinc-500"}
            >
              {inviteFlow ? "4 · Community" : "4 · People"}
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
                  disabled={stepBusy || favorites.length < 1}
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

          {step === 3 ? (
            <div className="mt-6 space-y-5 sm:mt-8">
              {hasLastfmAlready ? (
                <>
                  <h2 className={h2}>Your listening is already linked</h2>
                  <p className={bodyMuted}>
                    {inviteFlow
                      ? "Continue to see people in this community you might follow before we open it."
                      : "You’re set on the listening side. Continue to see who we suggest you follow."}
                  </p>
                  <button
                    type="button"
                    onClick={advanceFromLastfm}
                    className={primaryBtn}
                  >
                    Continue
                  </button>
                  <div className="flex flex-wrap gap-2 border-t border-emerald-900/30 pt-4">
                    <button
                      type="button"
                      onClick={() => setStep(2)}
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
                      <h2 className={h2}>Get your weekly chart</h2>
                      <p className={bodyMuted}>
                        <span className="font-medium text-zinc-100">
                          Track your music taste:
                        </span>{" "}
                        your plays power your billboard, profile, and communities.
                        Use a free Last.fm account (or sign in),{" "}
                        <span className="font-medium text-zinc-100">
                          connect Spotify in Last.fm
                        </span>{" "}
                        so listens sync, then add your username in the modal.
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                      <button
                        type="button"
                        onClick={() => setLastfmModalOpen(true)}
                        className={lastfmActionBtn}
                      >
                        Get my chart
                      </button>
                      <button
                        type="button"
                        onClick={() => setLastfmSkipWarningOpen(true)}
                        className={lastfmGhostBtn}
                      >
                        Skip for now
                      </button>
                    </div>
                  </div>
                  <div className="mt-2">
                    <SampleWeeklyChartPreview variant="onboarding" />
                  </div>
                  <div className="flex flex-wrap gap-2 border-t border-emerald-900/30 pt-4">
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className={backSmall}
                    >
                      Back
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : null}

          {step === 4 ? (
            <div className="mt-6 space-y-6 sm:mt-8">
              <div>
                <h2 className={h2}>You&apos;re almost there</h2>
                <p className={bodyMuted}>
                  {inviteFlow ? (
                    <>
                      People already in{" "}
                      <span className="font-medium text-zinc-200">
                        {communityInviteName ?? "this community"}
                      </span>
                      . Follow anyone you like — you can change this anytime.
                      When you continue, we&apos;ll add you to the community and
                      take you there.
                    </>
                  ) : (
                    <>
                      Suggested from others’ recent listens (last 30 days) that
                      match your favorite albums or those albums’ artists. Follow
                      anyone you like — you can change this anytime.
                    </>
                  )}
                </p>
              </div>

              {suggestionsLoading ? (
                <p className="text-sm text-zinc-500">Loading suggestions…</p>
              ) : suggestedUsers.length > 0 ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    {inviteFlow ? "Community members" : "Suggested people"}
                  </p>
                  <ul className="mt-3 space-y-2">
                    {suggestedUsers.map((u) => (
                      <li
                        key={u.id}
                        className="flex items-start justify-between gap-3 rounded-xl border border-zinc-800/90 bg-zinc-900/40 px-3 py-2.5"
                      >
                        <Link
                          href={`/profile/${u.id}`}
                          className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-start sm:gap-3"
                        >
                          <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-zinc-700 bg-zinc-800">
                            {u.avatar_url ? (
                              <img
                                src={u.avatar_url}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center text-sm font-medium text-zinc-300">
                                {u.username[0]?.toUpperCase() ?? "?"}
                              </span>
                            )}
                          </span>
                          <div className="min-w-0">
                            <span className="block truncate font-medium text-white hover:underline">
                              @{u.username}
                            </span>
                            {u.reasons && u.reasons.length > 0 ? (
                              <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs text-zinc-400">
                                {u.reasons.map((line, i) => (
                                  <li key={i}>{line}</li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        </Link>
                        <FollowButton userId={u.id} initialFollowing={false} />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-zinc-500">
                  {inviteFlow
                    ? "No other members to show yet — you can still continue and join the community."
                    : "No suggestions yet — as more people log music, we&apos;ll find listeners who match your albums."}
                </p>
              )}

              {bootstrapError ? (
                <p className="text-sm text-red-400" role="alert">
                  {bootstrapError}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void completeBootstrap()}
                  disabled={stepBusy}
                  className={primaryBtn}
                >
                  {stepBusy ? (
                    <>
                      <InlineSpinner tone="emerald" />
                      Finishing setup…
                    </>
                  ) : inviteFlow ? (
                    "Join community & continue"
                  ) : (
                    "Enter Tracklist"
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  disabled={stepBusy}
                  className={secondaryBtn}
                >
                  Back
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
