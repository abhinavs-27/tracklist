"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FavoriteAlbumsPicker,
  type FavoriteAlbumPick,
} from "@/components/favorite-albums-picker";
import { ImageCropModal } from "@/components/profile/image-crop-modal";
import { SampleWeeklyChartPreview } from "@/components/home/sample-weekly-chart-preview";
import { LastfmConnectModal } from "@/components/onboarding/lastfm-connect-modal";
import { LastfmSkipWarningDialog } from "@/components/onboarding/lastfm-skip-warning-dialog";
import { GenrePicker } from "@/components/onboarding/genre-picker";
import { RatingGrid, type RatedAlbum } from "@/components/onboarding/rating-grid";
import { FollowButton } from "@/components/follow-button";
import { InlineSpinner } from "@/components/ui/inline-spinner";
import { uploadProfilePictureJPEG } from "@/lib/client/profile-picture-upload";
import { queryKeys } from "@/lib/query-keys";
import { resolveUserAvatarUrl } from "@/lib/profile-pictures/resolve-avatar-display";
import type { GenreKey } from "@/lib/onboarding/genre-map";

const MAX_PROFILE_PHOTO_INPUT_BYTES = 25 * 1024 * 1024;

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
  /** Existing avatar (e.g. OAuth); optional upload can replace during step 1. */
  initialAvatarUrl?: string | null;
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
  initialAvatarUrl = null,
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
  const photoInputRef = useRef<HTMLInputElement>(null);
  const savedAvatarUrlRef = useRef<string | null>(initialAvatarUrl);

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [usernameInput, setUsernameInput] = useState(initialUsername);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [favorites, setFavorites] =
    useState<FavoriteAlbumPick[]>(initialFavoriteAlbums);
  const [favoritesError, setFavoritesError] = useState<string | null>(null);
  const [stepBusy, setStepBusy] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  const [selectedGenres, setSelectedGenres] = useState<GenreKey[]>([]);
  const [genreSubstep, setGenreSubstep] = useState<"genres" | "albums">("genres");
  const [albumSuggestions, setAlbumSuggestions] = useState<Array<{
    genreKey: string; genreLabel: string;
    albums: Array<{ id: string; name: string; artistName: string; imageUrl: string | null }>;
  }>>([]);
  const [ratedAlbums, setRatedAlbums] = useState<RatedAlbum[]>([]);

  const [lastfmModalOpen, setLastfmModalOpen] = useState(false);
  const [lastfmSkipWarningOpen, setLastfmSkipWarningOpen] = useState(false);

  const [avatarDisplayUrl, setAvatarDisplayUrl] = useState<string | null>(
    initialAvatarUrl,
  );
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);

  const [suggestedUsers, setSuggestedUsers] = useState<SuggestedUser[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  useEffect(() => {
    setUsernameInput(initialUsername);
  }, [initialUsername]);

  useEffect(() => {
    savedAvatarUrlRef.current = initialAvatarUrl;
    setAvatarDisplayUrl(initialAvatarUrl);
  }, [initialAvatarUrl]);

  const revokeCropSrc = useCallback(() => {
    setCropImageSrc((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  useEffect(() => {
    if (step !== 1) {
      setCropModalOpen(false);
      revokeCropSrc();
    }
  }, [step, revokeCropSrc]);

  const pictureMutation = useMutation({
    mutationFn: async (blob: Blob) =>
      uploadProfilePictureJPEG(blob, { type: "user", id: userId }),
    onMutate: (blob) => {
      setPhotoError(null);
      setAvatarDisplayUrl((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    },
    onSuccess: (result) => {
      savedAvatarUrlRef.current = result.file_url;
      setAvatarDisplayUrl((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return result.file_url;
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) });
    },
    onError: (err) => {
      setPhotoError(
        err instanceof Error ? err.message : "Could not upload photo",
      );
      setAvatarDisplayUrl((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return savedAvatarUrlRef.current;
      });
    },
  });

  const avatarImgSrc = resolveUserAvatarUrl(userId, avatarDisplayUrl);
  const displayNameForLetter =
    usernameInput.trim() || initialUsername.trim() || "?";

  const handlePhotoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setPhotoError(null);
    if (f.size > MAX_PROFILE_PHOTO_INPUT_BYTES) {
      setPhotoError("Image is too large. Try a file under 25 MB.");
      return;
    }
    revokeCropSrc();
    setCropImageSrc(URL.createObjectURL(f));
    setCropModalOpen(true);
  };

  const handleCropClose = () => {
    setCropModalOpen(false);
    revokeCropSrc();
  };

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
    if (step !== 5) return;
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

  const [albumSuggestionsLoading, setAlbumSuggestionsLoading] = useState(false);

  const loadSuggestions = useCallback(async (genres: GenreKey[]) => {
    if (genres.length === 0) return;
    setAlbumSuggestionsLoading(true);
    try {
      const params = new URLSearchParams({ genres: genres.join(",") });
      const res = await fetch(`/api/onboarding/album-suggestions?${params}`);
      if (res.ok) {
        const data = (await res.json()) as {
          suggestions: Array<{
            genreKey: string; genreLabel: string;
            albums: Array<{ id: string; name: string; artistName: string; imageUrl: string | null }>;
          }>;
        };
        setAlbumSuggestions(data.suggestions ?? []);
        setGenreSubstep("albums");
      } else {
        setFavoritesError("Could not load album suggestions. Please try again.");
      }
    } finally {
      setAlbumSuggestionsLoading(false);
    }
  }, []);

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
        body: JSON.stringify({ albums: favorites.map((a) => a.album_id) }),
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

  const goStep3 = useCallback(async () => {
    if (genreSubstep === "genres") {
      await loadSuggestions(selectedGenres);
      return;
    }
    // Submit ratings
    setStepBusy(true);
    try {
      const res = await fetch("/api/users/me/onboarding-ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ratings: ratedAlbums,
          preferredGenres: selectedGenres,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setFavoritesError(data.error ?? "Could not save ratings");
        return;
      }
      setStep(4);
    } finally {
      setStepBusy(false);
    }
  }, [genreSubstep, selectedGenres, ratedAlbums, loadSuggestions]);

  const advanceFromLastfm = useCallback(() => {
    setLastfmModalOpen(false);
    setStep(5);
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
    "inline-flex items-center gap-2 rounded-xl bg-gold-600 px-5 py-3 text-base font-semibold text-white hover:bg-gold-500 disabled:opacity-50";
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

      {cropImageSrc ? (
        <ImageCropModal
          imageSrc={cropImageSrc}
          open={cropModalOpen}
          onClose={handleCropClose}
          onConfirm={async (blob) => {
            await pictureMutation.mutateAsync(blob);
          }}
        />
      ) : null}

      <div className="mx-auto w-full max-w-2xl py-4 sm:py-10">
        {inviteFlow ? (
          <div className="mb-10 rounded-2xl bg-gold-950/45 px-5 py-5 text-center shadow-[0_12px_40px_-12px_rgba(6,78,59,0.35)] ring-1 ring-inset ring-gold-400/20 sm:px-6">
            <p className="text-sm font-medium text-gold-100 sm:text-base">
              You&apos;re joining{" "}
              <span className="text-white">
                {communityInviteName ?? "a community"}
              </span>{" "}
              — finish setup and we&apos;ll add you and open it when you&apos;re
              done.
            </p>
            <p className="mt-2 text-sm text-gold-200/75">
              Username, optional profile photo, favorite albums, your listening
              chart, then meet members — same steps as everyone else.
            </p>
          </div>
        ) : null}

        <div
          id="profile-onboarding"
          className="rounded-2xl bg-gold-950/20 p-8 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.65)] ring-1 ring-inset ring-gold-500/15 sm:p-10"
        >
          {/* Visual step indicator */}
          <div className="flex items-center">
            {(["Username", "Albums", "Taste", "Your chart", inviteFlow ? "Community" : "People"] as const).map(
              (label, i) => {
                const num = i + 1;
                const done = step > num;
                const active = step === num;
                return (
                  <div key={num} className="flex items-center">
                    <div className="flex items-center gap-1.5">
                      <div
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                          active
                            ? "bg-gold-500 text-zinc-950"
                            : done
                              ? "bg-gold-950 text-gold-400 ring-1 ring-gold-600/40"
                              : "bg-zinc-800 text-zinc-600"
                        }`}
                      >
                        {done ? "✓" : num}
                      </div>
                      <span
                        className={`hidden text-sm font-medium sm:block ${
                          active ? "text-white" : "text-zinc-600"
                        }`}
                      >
                        {label}
                      </span>
                    </div>
                    {i < 4 && (
                      <div
                        className={`mx-2 h-px w-4 shrink-0 sm:mx-3 sm:w-6 ${
                          step > num ? "bg-gold-800/80" : "bg-zinc-800"
                        }`}
                      />
                    )}
                  </div>
                );
              },
            )}
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

              <div className="border-t border-gold-900/25 pt-6">
                <p className={labelClass}>
                  Profile photo{" "}
                  <span className="font-normal text-zinc-500">(optional)</span>
                </p>
                <p className="mt-1 text-sm text-zinc-500">
                  Add a picture for your profile — crop and zoom before we save
                  it. Skip this and add one later from your profile anytime.
                </p>
                <div className="mt-4 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border-2 border-zinc-700 bg-zinc-800">
                    {avatarImgSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element -- presigned / blob URLs
                      <img
                        src={avatarImgSrc}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-2xl font-medium text-zinc-400">
                        {displayNameForLetter[0]?.toUpperCase() ?? "?"}
                      </span>
                    )}
                    {pictureMutation.isPending ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-[10px] font-medium text-white">
                        <InlineSpinner tone="gold" />
                      </div>
                    ) : null}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handlePhotoFileChange}
                    />
                    <button
                      type="button"
                      disabled={stepBusy || pictureMutation.isPending}
                      onClick={() => photoInputRef.current?.click()}
                      className={secondaryBtn}
                    >
                      {avatarImgSrc ? "Change photo" : "Add photo"}
                    </button>
                    {photoError ? (
                      <p className="text-sm text-red-400" role="alert">
                        {photoError}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>

              {usernameError ? (
                <p className="text-sm text-red-400" role="alert">
                  {usernameError}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void goStep1()}
                  disabled={stepBusy || pictureMutation.isPending}
                  className={primaryBtn}
                >
                  {stepBusy ? (
                    <>
                      <InlineSpinner tone="gold" />
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
                <button type="button" onClick={() => setStep(1)} disabled={stepBusy} className={secondaryBtn}>
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => void goStep2()}
                  disabled={stepBusy || favorites.length < 1}
                  className={primaryBtn}
                >
                  {stepBusy ? (
                    <><InlineSpinner tone="gold" /> Saving…</>
                  ) : (
                    "Continue"
                  )}
                </button>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="mt-6 space-y-5 sm:mt-8">
              {genreSubstep === "genres" ? (
                <>
                  <div>
                    <h2 className={h2}>What do you listen to?</h2>
                    <p className={bodyMuted}>
                      Pick your genres and we&apos;ll show you albums to rate. This builds your taste profile right away — no Last.fm needed.
                    </p>
                  </div>
                  <GenrePicker
                    selected={selectedGenres}
                    onChange={setSelectedGenres}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setStep(2)} disabled={stepBusy} className={secondaryBtn}>
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => void goStep3()}
                      disabled={stepBusy || selectedGenres.length === 0 || albumSuggestionsLoading}
                      className={primaryBtn}
                    >
                      {albumSuggestionsLoading ? (
                        <><InlineSpinner tone="gold" /> Loading…</>
                      ) : (
                        "See albums →"
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep(4)}
                      disabled={stepBusy}
                      className="text-sm text-zinc-600 hover:text-zinc-400"
                    >
                      Skip
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <h2 className={h2}>Rate what you know</h2>
                    <p className={bodyMuted}>
                      Half-stars welcome. Skip anything you haven&apos;t heard.
                    </p>
                  </div>
                  <RatingGrid
                    suggestions={albumSuggestions}
                    onRatingsChange={setRatedAlbums}
                  />
                  {favoritesError ? (
                    <p className="text-sm text-red-400" role="alert">{favoritesError}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setGenreSubstep("genres")} disabled={stepBusy} className={secondaryBtn}>
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => void goStep3()}
                      disabled={stepBusy}
                      className={primaryBtn}
                    >
                      {stepBusy ? (
                        <><InlineSpinner tone="gold" /> Saving…</>
                      ) : ratedAlbums.length > 0 ? (
                        `Save ${ratedAlbums.length} rating${ratedAlbums.length === 1 ? "" : "s"} →`
                      ) : (
                        "Continue →"
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : null}

          {step === 4 ? (
            <div className="mt-6 space-y-6 sm:mt-8">
              {hasLastfmAlready ? (
                <>
                  <h2 className={h2}>Your listening is already linked</h2>
                  <p className={bodyMuted}>
                    {inviteFlow
                      ? "Continue to see people in this community you might follow before we open it."
                      : "You’re set on the listening side. Continue to see who we suggest you follow."}
                  </p>
                  <button type="button" onClick={advanceFromLastfm} className={primaryBtn}>
                    Continue
                  </button>
                  <div className="flex flex-wrap gap-2 border-t border-gold-900/30 pt-4">
                    <button type="button" onClick={() => setStep(3)} className={backSmall}>Back</button>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <h2 className={h2}>Log every listen, automatically</h2>
                    <p className={bodyMuted}>
                      Last.fm captures every Spotify play in the background — no
                      manual logging, ever. Your full listening history powers
                      everything in Tracklist.
                    </p>
                  </div>

                  {/* What they unlock */}
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      {
                        icon: "📊",
                        title: "Charts & history",
                        desc: "Weekly top 10s, all-time stats, and your complete listening archive.",
                      },
                      {
                        icon: "🔥",
                        title: "Feed & communities",
                        desc: "Your plays appear in friends' feeds and drive community rankings in real time.",
                      },
                      {
                        icon: "🎭",
                        title: "Taste identity",
                        desc: "Genres, listening style, top artists — all built automatically from your real data.",
                      },
                    ].map(({ icon, title, desc }) => (
                      <div
                        key={title}
                        className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-3.5"
                      >
                        <p className="text-xl">{icon}</p>
                        <p className="mt-2 text-sm font-semibold text-white">{title}</p>
                        <p className="mt-1 text-xs leading-relaxed text-zinc-500">{desc}</p>
                      </div>
                    ))}
                  </div>

                  {/* Sample chart preview */}
                  <SampleWeeklyChartPreview variant="onboarding" />

                  {/* CTAs */}
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setLastfmModalOpen(true)}
                      className={lastfmActionBtn}
                    >
                      Connect Last.fm →
                    </button>
                    <button
                      type="button"
                      onClick={() => setLastfmSkipWarningOpen(true)}
                      className={lastfmGhostBtn}
                    >
                      Skip for now
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2 border-t border-gold-900/30 pt-4">
                    <button type="button" onClick={() => setStep(3)} className={backSmall}>Back</button>
                  </div>
                </>
              )}
            </div>
          ) : null}

          {step === 5 ? (
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
                      . Follow anyone you like — you can always change this later.
                    </>
                  ) : (
                    <>
                      People who love similar music. Follow anyone you like —
                      you can always change this later.
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
                    : "No suggestions yet — as more people log music, we'll find listeners who match your albums."}
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
                      <InlineSpinner tone="gold" />
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
                  onClick={() => setStep(4)}
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
