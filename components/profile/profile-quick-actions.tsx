"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { ProfileEditModal } from "@/app/profile/[id]/profile-edit-modal";
import { SendRecommendationModal } from "@/components/taste-match/send-recommendation-modal";

const quickBtn =
  "inline-flex min-h-11 min-w-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-700/90 bg-zinc-900/60 px-3 py-2.5 text-sm font-medium text-zinc-200 shadow-sm ring-1 ring-white/[0.04] transition hover:border-zinc-600 hover:bg-zinc-800/80 sm:flex-none sm:px-4";

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M12 20h9M16.5 3.5a2.25 2.25 0 013 3L8 18l-4 1 1-4L16.5 3.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.769-.283 1.093m0-2.186l9.566-5.314m-9.566 5.314l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.935-2.186 2.25 2.25 0 00-3.935 2.186z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 19V5M4 19h16M8 15v-4M12 15V9m4 6v-7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function InboxIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShareProfileButton({ profilePath }: { profilePath: string }) {
  const [copied, setCopied] = useState(false);

  const share = useCallback(async () => {
    const path = profilePath.startsWith("/") ? profilePath : `/${profilePath}`;
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}${path}`
        : path;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Profile",
          url,
        });
        return;
      }
    } catch {
      /* user cancelled or share failed */
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }, [profilePath]);

  return (
    <button
      type="button"
      onClick={() => void share()}
      className={quickBtn}
      aria-label="Share profile"
    >
      <ShareIcon className="h-4 w-4 shrink-0 text-emerald-400/90" />
      <span>{copied ? "Copied" : "Share"}</span>
    </button>
  );
}

type Props = {
  profilePath: string;
  isOwnProfile: boolean;
  userId: string;
  username: string;
  bio: string | null;
  avatarUrl: string | null;
  /** When set and viewing someone else, show “Send rec” next to Share. */
  viewerUserId?: string | null;
};

function GiftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 7h9v4H3V7h9zm0 0V5a2 2 0 10-4 0v2m4 0V5a2 2 0 114 0v2M5 11v8a1 1 0 001 1h12a1 1 0 001-1v-8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ProfileQuickActions({
  profilePath,
  isOwnProfile,
  userId,
  username,
  bio,
  avatarUrl,
  viewerUserId = null,
}: Props) {
  const router = useRouter();
  const [recOpen, setRecOpen] = useState(false);
  const showSendRec = !isOwnProfile && Boolean(viewerUserId?.trim());

  return (
    <div className="flex flex-wrap gap-2 sm:gap-3">
      {isOwnProfile ? (
        <ProfileEditModal
          userId={userId}
          username={username}
          bio={bio}
          avatarUrl={avatarUrl}
          triggerClassName="inline-flex min-h-11 min-w-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-700/90 bg-zinc-900/60 px-3 py-2.5 text-sm font-medium text-zinc-200 shadow-sm ring-1 ring-white/[0.04] transition hover:border-emerald-500/40 hover:bg-emerald-950/20 sm:flex-none sm:px-4"
          triggerLabel={
            <>
              <PencilIcon className="h-4 w-4 shrink-0 text-emerald-400/90" />
              Edit
            </>
          }
        />
      ) : null}

      <ShareProfileButton profilePath={profilePath} />

      {showSendRec ? (
        <button
          type="button"
          onClick={() => setRecOpen(true)}
          className={quickBtn}
          aria-label="Send a music recommendation"
        >
          <GiftIcon className="h-4 w-4 shrink-0 text-emerald-400/90" />
          Send rec
        </button>
      ) : null}

      {isOwnProfile ? (
        <Link
          href="/reports/listening"
          className={`${quickBtn} text-emerald-50/95 hover:border-emerald-500/35 hover:bg-emerald-950/25`}
          aria-label="View listening report"
        >
          <ChartIcon className="h-4 w-4 shrink-0 text-emerald-400/90" />
          Report
        </Link>
      ) : null}

      {isOwnProfile ? (
        <Link
          href="/social/inbox"
          className={`${quickBtn} text-zinc-200 hover:border-zinc-500/50 hover:bg-zinc-800/80`}
          aria-label="Social inbox"
        >
          <InboxIcon className="h-4 w-4 shrink-0 text-emerald-400/90" />
          Inbox
        </Link>
      ) : null}

      {recOpen && showSendRec ? (
        <SendRecommendationModal
          recipientUserId={userId}
          onClose={() => setRecOpen(false)}
          onSent={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}
