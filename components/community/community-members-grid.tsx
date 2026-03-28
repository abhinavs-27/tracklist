"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CommunityMemberRosterEntry } from "@/lib/community/community-member-roster-types";
import { FollowButton } from "@/components/follow-button";
import {
  communityBody,
  communityHeadline,
  communityMeta,
} from "@/lib/ui/surface";

type Props = {
  communityId: string;
  viewerId: string;
  roster: CommunityMemberRosterEntry[];
  showPromote: boolean;
  /** Dense directory list (default) vs 2-column social cards for small screens. */
  variant?: "list" | "social";
};

/** Matches leaderboard row weight — full-width list, not tall cards. */
const rowShell =
  "flex flex-col gap-3 rounded-xl bg-zinc-950/40 p-3 ring-1 ring-white/[0.05] sm:flex-row sm:items-stretch sm:gap-4 sm:p-3.5";

function tasteLineSocial(m: CommunityMemberRosterEntry): string | null {
  if (m.taste_neighbor) {
    const k = m.taste_neighbor.kind === "similar" ? "Similar taste" : "Different vibe";
    return `${k} · ${m.taste_neighbor.similarity_pct}%`;
  }
  if (m.taste_summary) {
    return m.taste_summary.length > 48
      ? `${m.taste_summary.slice(0, 46)}…`
      : m.taste_summary;
  }
  return null;
}

export function CommunityMembersGrid({
  communityId,
  viewerId,
  roster,
  showPromote,
  variant = "list",
}: Props) {
  const router = useRouter();
  const [promoting, setPromoting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function promote(userId: string) {
    if (!showPromote || promoting) return;
    setError(null);
    setPromoting(userId);
    try {
      const res = await fetch(`/api/communities/${communityId}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "Could not promote");
        return;
      }
      router.refresh();
    } finally {
      setPromoting(null);
    }
  }

  return (
    <div>
      {error ? (
        <p className={`mb-3 ${communityBody} text-red-400`} role="alert">
          {error}
        </p>
      ) : null}
      <ul
        className={
          variant === "social"
            ? "m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-2 sm:gap-3.5 lg:grid-cols-3 xl:grid-cols-4"
            : "m-0 list-none space-y-2.5 p-0"
        }
      >
        {roster.map((m) => (
          <li key={m.user_id} className="min-w-0">
            {variant === "social" ? (
              <CommunityMemberSocialCard
                member={m}
                viewerId={viewerId}
                showPromote={showPromote}
                promoting={promoting === m.user_id}
                onPromote={() => void promote(m.user_id)}
              />
            ) : (
              <CommunityMemberCard
                member={m}
                viewerId={viewerId}
                showPromote={showPromote}
                promoting={promoting === m.user_id}
                onPromote={() => void promote(m.user_id)}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const socialCardShell =
  "flex min-w-0 flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-950/50 p-3 ring-1 ring-white/[0.05]";

function CommunityMemberSocialCard(props: {
  member: CommunityMemberRosterEntry;
  viewerId: string;
  showPromote: boolean;
  promoting: boolean;
  onPromote: () => void;
}) {
  const { member: m, viewerId, showPromote, promoting, onPromote } = props;
  const isSelf = m.user_id === viewerId;
  const showFollow = !isSelf;
  const line = tasteLineSocial(m);

  return (
    <article className={socialCardShell}>
      <div className="flex w-full min-w-0 flex-col items-stretch text-center">
        <Link
          href={`/profile/${m.user_id}`}
          className="relative mx-auto h-20 w-20 shrink-0 rounded-full ring-2 ring-emerald-500/30 transition hover:ring-emerald-500/50"
        >
          {m.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote avatar URLs
            <img
              src={m.avatar_url}
              alt=""
              className="h-20 w-20 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-zinc-800 text-2xl font-bold text-zinc-200">
              {m.username[0]?.toUpperCase() ?? "?"}
            </span>
          )}
        </Link>
        <Link
          href={`/profile/${m.user_id}`}
          className={`mt-3 block w-full min-w-0 max-w-full truncate font-semibold text-white transition hover:text-emerald-400 hover:underline ${communityHeadline}`}
          title={m.username}
        >
          {m.username}
        </Link>
        {m.is_community_creator ? (
          <span className={`mt-1 font-medium text-amber-500/95 ${communityMeta}`}>
            Creator
          </span>
        ) : m.role === "admin" ? (
          <span
            className={`mt-1 rounded-md bg-zinc-800 px-1.5 py-0.5 font-semibold uppercase tracking-wide text-zinc-300 ${communityMeta}`}
          >
            Admin
          </span>
        ) : null}
        <p
          className={`mt-2 min-h-[2.5rem] w-full min-w-0 max-w-full break-words text-center text-sm leading-snug text-emerald-400/95 line-clamp-2`}
          title={line ?? undefined}
        >
          {line ?? "—"}
        </p>
      </div>

      <div className="mt-3 min-w-0 border-t border-white/[0.06] pt-3 text-center">
        <p className={`text-[0.65rem] font-bold uppercase tracking-wider text-zinc-500 ${communityMeta}`}>
          Top artist
        </p>
        <p
          className={`mt-1 w-full min-w-0 max-w-full truncate font-semibold text-zinc-100 ${communityBody}`}
          title={m.top_artists[0] ?? undefined}
        >
          {m.top_artists[0] ?? "—"}
        </p>
      </div>

      {showFollow || (showPromote && m.role === "member" && !isSelf) ? (
        <div className="mt-3 flex min-w-0 flex-wrap items-center justify-center gap-2">
          {showFollow ? (
            <FollowButton userId={m.user_id} initialFollowing={m.viewer_follows} />
          ) : null}
          {showPromote && m.role === "member" && !isSelf ? (
            <button
              type="button"
              onClick={onPromote}
              disabled={promoting}
              className={`rounded-full bg-zinc-900/80 px-3 py-2 font-medium text-zinc-200 ring-1 ring-white/[0.1] transition hover:bg-zinc-800 disabled:opacity-50 ${communityMeta}`}
            >
              {promoting ? "…" : "Make admin"}
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function CommunityMemberCard(props: {
  member: CommunityMemberRosterEntry;
  viewerId: string;
  showPromote: boolean;
  promoting: boolean;
  onPromote: () => void;
}) {
  const { member: m, viewerId, showPromote, promoting, onPromote } = props;
  const isSelf = m.user_id === viewerId;
  const showFollow = !isSelf;

  return (
    <article className={rowShell}>
      <div className="flex min-w-0 flex-1 gap-3">
        <Link
          href={`/profile/${m.user_id}`}
          className="relative h-10 w-10 shrink-0 self-start rounded-full ring-1 ring-white/10 transition hover:ring-2 hover:ring-emerald-500/30"
        >
          {m.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote avatar URLs
            <img
              src={m.avatar_url}
              alt=""
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 text-sm font-medium text-zinc-300">
              {m.username[0]?.toUpperCase() ?? "?"}
            </span>
          )}
        </Link>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              href={`/profile/${m.user_id}`}
              className={`min-w-0 max-w-full flex-1 basis-0 truncate font-semibold text-white transition hover:text-emerald-400 hover:underline ${communityHeadline}`}
              title={m.username}
            >
              {m.username}
            </Link>
            {m.role === "admin" ? (
              <span
                className={`shrink-0 rounded-md bg-zinc-800 px-1.5 py-0.5 font-semibold uppercase tracking-wide text-zinc-300 ${communityMeta}`}
              >
                Admin
              </span>
            ) : null}
            {m.is_community_creator ? (
              <span className={`shrink-0 font-medium text-amber-500/95 ${communityMeta}`}>
                Creator
              </span>
            ) : null}
            {m.taste_neighbor ? (
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 font-medium ${communityMeta} ${
                  m.taste_neighbor.kind === "similar"
                    ? "bg-emerald-950/80 text-emerald-200/95 ring-1 ring-emerald-500/25"
                    : "bg-amber-950/60 text-amber-200/90 ring-1 ring-amber-500/20"
                }`}
                title={
                  m.taste_neighbor.kind === "similar"
                    ? "Similar taste vs you (7d, weekly job)"
                    : "Different taste vs you (7d, weekly job)"
                }
              >
                {m.taste_neighbor.kind === "similar" ? "Neighbor" : "Different"}{" "}
                · {m.taste_neighbor.similarity_pct}%
              </span>
            ) : null}
          </div>

          {m.taste_summary ? (
            <p className={`line-clamp-2 leading-snug text-zinc-400 ${communityBody}`}>
              <span className="text-zinc-600">Taste · </span>
              {m.taste_summary}
            </p>
          ) : (
            <p className={`italic text-zinc-600 ${communityBody}`}>
              Taste profile fills in as they log listens.
            </p>
          )}

          {m.top_genres.length + m.top_artists.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {m.top_genres.slice(0, 3).map((g) => (
                <span
                  key={g}
                  className="rounded-full bg-zinc-800/90 px-2 py-0.5 text-[0.65rem] text-zinc-300"
                >
                  {g}
                </span>
              ))}
              {m.top_artists.slice(0, 2).map((a) => (
                <span
                  key={a}
                  className={`rounded-full bg-emerald-950/50 px-2 py-0.5 text-emerald-200/90 ${communityMeta}`}
                >
                  {a}
                </span>
              ))}
            </div>
          ) : null}

          {m.activity_line ? (
            <p className={`${communityMeta} text-zinc-500`}>{m.activity_line}</p>
          ) : (
            <p className={`${communityMeta} text-zinc-600`}>No listening stats this week.</p>
          )}
        </div>
      </div>

      {showFollow || (showPromote && m.role === "member" && !isSelf) ? (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-white/[0.06] pt-2 sm:ml-auto sm:w-auto sm:border-t-0 sm:pt-0 sm:pl-2">
          {showFollow ? (
            <FollowButton userId={m.user_id} initialFollowing={m.viewer_follows} />
          ) : null}
          {showPromote && m.role === "member" && !isSelf ? (
            <button
              type="button"
              onClick={onPromote}
              disabled={promoting}
              className={`rounded-full bg-zinc-900/80 px-3 py-2 font-medium text-zinc-200 ring-1 ring-white/[0.1] transition hover:bg-zinc-800 disabled:opacity-50 ${communityMeta}`}
            >
              {promoting ? "…" : "Make admin"}
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
