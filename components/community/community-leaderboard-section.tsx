"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { communityBody, communityMeta } from "@/lib/ui/surface";

type PersonRow = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  totalLogs: number;
  uniqueArtists: number;
  isCreator: boolean;
  role: "admin" | "member";
};

export function CommunityLeaderboardSection({ communityId }: { communityId: string }) {
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/communities/${encodeURIComponent(communityId)}/people`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { people?: PersonRow[] }) => setPeople(d.people ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [communityId]);

  const rowClass =
    "flex min-w-0 items-center gap-3 rounded-xl bg-zinc-950/40 px-3 py-2.5 ring-1 ring-white/[0.05] transition hover:bg-zinc-900/40 hover:ring-white/[0.08]";

  return (
    <section>
      <h3 className="text-lg font-semibold text-white">Weekly listen leaders</h3>
      <p className={`mt-1 mb-5 ${communityMeta}`}>
        Last 7 days · sorted by total listens
      </p>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex animate-pulse items-center gap-3 rounded-xl bg-zinc-900/40 px-3 py-2.5">
              <div className="h-4 w-5 rounded bg-zinc-800" />
              <div className="h-9 w-9 shrink-0 rounded-full bg-zinc-800" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-32 rounded bg-zinc-800" />
                <div className="h-3 w-24 rounded bg-zinc-800/70" />
              </div>
            </div>
          ))}
        </div>
      ) : people.length === 0 ? (
        <p className={`${communityBody} text-zinc-500`}>No members yet.</p>
      ) : (
        <ol className="space-y-2">
          {people.map((person, i) => (
            <li key={person.userId} className={rowClass}>
              {/* Rank */}
              <span className={`w-6 shrink-0 text-center tabular-nums ${communityMeta}`}>{i + 1}</span>

              {/* Avatar */}
              <Link href={`/profile/${person.userId}`} className="shrink-0">
                {person.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={person.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover ring-1 ring-white/10" />
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 text-xs text-zinc-200 ring-1 ring-white/10">
                    {person.username[0]?.toUpperCase() ?? "?"}
                  </span>
                )}
              </Link>

              {/* Name + stats */}
              <div className="min-w-0 flex-1 overflow-hidden">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/profile/${person.userId}`}
                    className={`font-medium text-white hover:text-gold-400 hover:underline ${communityBody}`}
                  >
                    {person.username}
                  </Link>
                  {person.isCreator && (
                    <span className="rounded bg-amber-950/50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-400">
                      Creator
                    </span>
                  )}
                  {!person.isCreator && person.role === "admin" && (
                    <span className="rounded bg-violet-950/50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-300">
                      Admin
                    </span>
                  )}
                </div>
                <p className={communityMeta}>
                  {person.totalLogs > 0
                    ? `${person.totalLogs} listens · ${person.uniqueArtists} artists`
                    : "No listens this week"}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
