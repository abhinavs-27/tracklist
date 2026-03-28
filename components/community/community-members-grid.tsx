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
};

export function CommunityMembersGrid({
  communityId,
  viewerId,
  roster,
  showPromote,
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
    <div className="space-y-4">
      {error ? (
        <p className={`${communityBody} text-red-400`} role="alert">
          {error}
        </p>
      ) : null}
      <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3">
        {roster.map((m) => (
          <li key={m.user_id} className="min-w-0">
            <CommunityMemberCard
              member={m}
              viewerId={viewerId}
              showPromote={showPromote}
              promoting={promoting === m.user_id}
              onPromote={() => void promote(m.user_id)}
            />
          </li>
        ))}
      </ul>
    </div>
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
    <article
      tabIndex={0}
      className="group relative flex min-h-[8.5rem] flex-col overflow-hidden rounded-2xl bg-gradient-to-b from-zinc-900/55 to-zinc-950/90 p-4 shadow-[0_12px_40px_-16px_rgba(0,0,0,0.55)] ring-1 ring-white/[0.06] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-14px_rgba(0,0,0,0.65)] hover:ring-white/[0.1] focus-within:-translate-y-0.5 focus-within:shadow-[0_16px_40px_-14px_rgba(0,0,0,0.65)] focus-within:ring-white/[0.1] sm:min-h-[9.5rem] sm:p-5"
    >
      <div className="flex gap-3 sm:gap-4">
        <Link
          href={`/profile/${m.user_id}`}
          className="relative shrink-0 transition group-hover:ring-2 group-hover:ring-emerald-500/25 group-hover:ring-offset-2 group-hover:ring-offset-zinc-950 rounded-full"
        >
          {m.avatar_url ? (
            <img
              src={m.avatar_url}
              alt=""
              className="h-14 w-14 rounded-full object-cover ring-1 ring-white/10 sm:h-16 sm:w-16"
            />
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800 text-lg font-medium text-zinc-300 ring-1 ring-white/10 sm:h-16 sm:w-16">
              {m.username[0]?.toUpperCase() ?? "?"}
            </span>
          )}
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/profile/${m.user_id}`}
              className={`truncate font-semibold text-white transition hover:text-emerald-400 hover:underline ${communityHeadline}`}
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
                className={`shrink-0 rounded-full px-2 py-0.5 font-semibold ${communityMeta} ${
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
            <p className={`mt-2 line-clamp-2 leading-snug text-zinc-400 ${communityBody}`}>
              <span className="text-zinc-500">Taste · </span>
              {m.taste_summary}
            </p>
          ) : (
            <p className={`mt-2 italic text-zinc-600 ${communityBody}`}>
              Taste profile fills in as they log listens.
            </p>
          )}

          {m.top_genres.length + m.top_artists.length > 0 ? (
            <div className="mt-2 max-h-0 overflow-hidden opacity-0 transition-all duration-300 ease-out group-hover:max-h-28 group-hover:opacity-100 group-focus-within:max-h-28 group-focus-within:opacity-100">
              <div className="flex flex-wrap gap-1.5 pt-1">
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
            </div>
          ) : null}

          {m.activity_line ? (
            <p className={`mt-2 ${communityMeta}`}>{m.activity_line}</p>
          ) : (
            <p className={`mt-2 ${communityMeta} text-zinc-600`}>No listening stats this week.</p>
          )}
        </div>
      </div>

      {showFollow || (showPromote && m.role === "member" && !isSelf) ? (
        <div className="mt-3 flex min-h-[2.75rem] flex-wrap items-end justify-end gap-2 opacity-100 transition-opacity duration-200 max-md:opacity-100 md:pointer-events-none md:opacity-0 md:group-hover:pointer-events-auto md:group-hover:opacity-100 md:group-focus-within:pointer-events-auto md:group-focus-within:opacity-100">
          {showFollow ? (
            <div className="md:scale-[0.96] md:transition-transform md:group-hover:scale-100">
              <FollowButton userId={m.user_id} initialFollowing={m.viewer_follows} />
            </div>
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
