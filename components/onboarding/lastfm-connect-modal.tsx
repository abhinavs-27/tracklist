"use client";

import { useCallback, useEffect, useState } from "react";
import { LastfmSkipWarningDialog } from "@/components/onboarding/lastfm-skip-warning-dialog";
import { InlineSpinner } from "@/components/ui/inline-spinner";

type PreviewTrack = {
  trackName: string;
  artistName: string;
  artworkUrl: string | null;
};

type GuidedPreview = {
  recentTracks: PreviewTrack[];
  topArtists: Array<{ name: string; image: string | null }>;
  topAlbums: Array<{ name: string; artistName: string; image: string | null }>;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSkip: () => void;
  onConnected: () => void;
  title?: string;
  subtitle?: string;
};

function PreviewSkeleton() {
  return (
    <div className="mt-4 space-y-3" aria-hidden>
      <div className="h-3 w-24 animate-pulse rounded bg-zinc-800" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3"
        >
          <div className="h-9 w-9 shrink-0 animate-pulse rounded bg-zinc-800" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3.5 w-[70%] max-w-[14rem] animate-pulse rounded bg-zinc-800/90" />
            <div className="h-3 w-[45%] max-w-[10rem] animate-pulse rounded bg-zinc-800/70" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function LastfmConnectModal({
  open,
  onClose,
  onSkip,
  onConnected,
  title = "Get your weekly chart",
  subtitle =
    "Track your music taste with a Last.fm username — we import plays so your profile, charts, and communities stay in sync with what you listen to.",
}: Props) {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<GuidedPreview | null>(null);
  const [skipWarningOpen, setSkipWarningOpen] = useState(false);

  const busy = loading || saving;

  const confirmSkip = useCallback(() => {
    setSkipWarningOpen(false);
    onSkip();
    onClose();
  }, [onSkip, onClose]);

  useEffect(() => {
    if (!open) setSkipWarningOpen(false);
  }, [open]);

  const runPreview = useCallback(async () => {
    setError(null);
    setPreview(null);
    const u = username.trim();
    if (!u) {
      setError("Enter your Last.fm username.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/lastfm/guided-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          (data as { error?: string }).error ?? "Could not validate username",
        );
        return;
      }
      const p = (data as { preview?: GuidedPreview }).preview;
      if (p) setPreview(p);
    } finally {
      setLoading(false);
    }
  }, [username]);

  const saveUsername = useCallback(async () => {
    const u = username.trim();
    if (!u) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastfm_username: u }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          (data as { error?: string }).error ?? "Could not save Last.fm username",
        );
        return;
      }
      onConnected();
      onClose();
    } finally {
      setSaving(false);
    }
  }, [username, onConnected, onClose]);

  if (!open) return null;

  return (
    <>
    <LastfmSkipWarningDialog
      open={skipWarningOpen}
      onCancel={() => setSkipWarningOpen(false)}
      onConfirm={confirmSkip}
    />
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lastfm-modal-title"
        aria-busy={busy}
      >
        <h2
          id="lastfm-modal-title"
          className="text-lg font-semibold text-white"
        >
          {title}
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-zinc-400">{subtitle}</p>

        <ol className="mt-4 list-decimal space-y-2 pl-4 text-sm leading-relaxed text-zinc-300">
          <li>
            <span className="font-medium text-zinc-200">
              Create a Last.fm account
            </span>{" "}
            (or sign in if you already have one).{" "}
            <a
              href="https://www.last.fm/join"
              target="_blank"
              rel="noreferrer noopener"
              className="text-emerald-400 underline hover:text-emerald-300"
            >
              last.fm/join
            </a>
          </li>
          <li>
            In Last.fm,{" "}
            <span className="font-medium text-zinc-200">
              connect your Spotify account
            </span>{" "}
            so plays show up as scrobbles — that’s what we pull into Tracklist.
          </li>
          <li>
            Paste your{" "}
            <span className="font-medium text-zinc-200">Last.fm username</span>{" "}
            below and confirm. Usually{" "}
            <span className="font-medium text-zinc-200">about a minute</span>{" "}
            end-to-end.
          </li>
        </ol>

        <div className="mt-5 flex gap-2">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Your Last.fm username"
            disabled={busy}
            className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 disabled:opacity-50"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => void runPreview()}
            disabled={loading || saving}
            aria-busy={loading}
            className="flex min-w-[7rem] shrink-0 items-center justify-center gap-2 rounded-xl bg-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-white disabled:opacity-50"
          >
            {loading ? (
              <>
                <InlineSpinner tone="light" />
                <span>Checking…</span>
              </>
            ) : (
              "Check"
            )}
          </button>
        </div>

        {error ? (
          <p className="mt-3 text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}

        {loading ? <PreviewSkeleton /> : null}

        {preview && !loading ? (
          <div className="mt-4 space-y-4 border-t border-zinc-800/80 pt-4">
            <p className="text-xs font-medium text-emerald-400/90">
              Looks good — this is what we&apos;ll sync.
            </p>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Recent tracks
              </p>
              <ul className="mt-2 space-y-2">
                {preview.recentTracks.slice(0, 6).map((tr, i) => (
                  <li
                    key={`${tr.trackName}-${tr.artistName}-${i}`}
                    className="flex items-center gap-3 text-sm text-zinc-200"
                  >
                    {tr.artworkUrl ? (
                      <img
                        src={tr.artworkUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="h-9 w-9 rounded object-cover"
                      />
                    ) : (
                      <span className="flex h-9 w-9 items-center justify-center rounded bg-zinc-800 text-xs text-zinc-500">
                        ♪
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {tr.trackName}
                      </span>
                      <span className="block truncate text-xs text-zinc-500">
                        {tr.artistName}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            {preview.topArtists.length > 0 ? (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Top artists (7 days)
                </p>
                <p className="mt-2 text-sm text-zinc-300">
                  {preview.topArtists
                    .slice(0, 6)
                    .map((a) => a.name)
                    .join(" · ")}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-2 border-t border-zinc-800 pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          {preview && !loading ? (
            <button
              type="button"
              onClick={() => void saveUsername()}
              disabled={saving}
              aria-busy={saving}
              className="order-1 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 sm:order-3 sm:w-auto"
            >
              {saving ? (
                <>
                  <InlineSpinner tone="emerald" />
                  <span>Connecting…</span>
                </>
              ) : (
                "Save & connect"
              )}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="order-2 rounded-xl px-4 py-2 text-sm text-zinc-400 hover:text-white disabled:opacity-50 sm:order-1"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => setSkipWarningOpen(true)}
            disabled={busy}
            className="order-3 text-left text-sm text-zinc-500 hover:text-zinc-300 disabled:opacity-50 sm:order-2 sm:text-right"
          >
            I&apos;ll set up Last.fm later
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
