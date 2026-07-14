// components/profile/profile-reviews-tab.tsx
"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ProfileDiaryEntry, type DiaryEntry } from "./profile-diary-entry";
import { LastfmConnectModal } from "@/components/onboarding/lastfm-connect-modal";

type Props = {
  username: string;
  isOwnProfile: boolean;
  hasLastfm: boolean;
  initialReviewCount: number;
};

type DiaryResponse = {
  reviews: DiaryEntry[];
  hasLastfm: boolean;
  availableYears: number[];
};

function groupByMonth(reviews: DiaryEntry[]): Array<{ label: string; entries: DiaryEntry[] }> {
  const groups = new Map<string, DiaryEntry[]>();
  for (const r of reviews) {
    const d = new Date(r.created_at);
    const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(r);
  }
  return Array.from(groups.entries()).map(([label, entries]) => ({ label, entries }));
}

export function ProfileReviewsTab({ username, isOwnProfile, hasLastfm, initialReviewCount }: Props) {
  const [filter, setFilter] = useState<"all" | "albums" | "tracks">("all");
  const [year, setYear] = useState<number | null>(null);
  const [lastfmModalOpen, setLastfmModalOpen] = useState(false);

  const { data, isLoading } = useQuery<DiaryResponse>({
    queryKey: ["profile-reviews", username, filter, year],
    queryFn: async () => {
      const params = new URLSearchParams({ filter });
      if (year) params.set("year", String(year));
      const res = await fetch(`/api/users/${username}/reviews?${params}`);
      if (!res.ok) throw new Error("Failed to load reviews");
      return res.json() as Promise<DiaryResponse>;
    },
  });

  const reviews = data?.reviews ?? [];
  const availableYears = data?.availableYears ?? [];
  const showLastfmNudge = isOwnProfile && !hasLastfm && initialReviewCount >= 3;
  const grouped = groupByMonth(reviews);

  return (
    <div>
      {showLastfmNudge ? (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm text-zinc-400">
          <span>Connect Last.fm to see how many times you&apos;ve listened to each of these.</span>
          <button
            type="button"
            onClick={() => setLastfmModalOpen(true)}
            className="shrink-0 text-gold-400 hover:text-gold-300"
          >
            Connect →
          </button>
        </div>
      ) : null}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-zinc-800 bg-zinc-900 p-0.5 text-sm">
          {(["all", "albums", "tracks"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1 capitalize transition ${
                filter === f ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {availableYears.length > 1 ? (
          <select
            value={year ?? ""}
            onChange={(e) => setYear(e.target.value ? parseInt(e.target.value, 10) : null)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-300"
          >
            <option value="">All years</option>
            {availableYears.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        ) : null}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex gap-3">
              <div className="h-10 w-10 animate-pulse rounded bg-zinc-800" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-2/3 animate-pulse rounded bg-zinc-800" />
                <div className="h-3 w-1/3 animate-pulse rounded bg-zinc-800/70" />
              </div>
            </div>
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-600">
          {isOwnProfile ? "Rate some albums to build your diary." : "No reviews yet."}
        </p>
      ) : (
        <div>
          {grouped.map(({ label, entries }) => (
            <div key={label} className="mb-6">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-widest text-zinc-600">
                {label}
              </h3>
              <div className="divide-y divide-zinc-800/60">
                {entries.map((entry) => (
                  <ProfileDiaryEntry key={entry.id} entry={entry} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {lastfmModalOpen ? (
        <LastfmConnectModal
          open={lastfmModalOpen}
          onClose={() => setLastfmModalOpen(false)}
          onSkip={() => setLastfmModalOpen(false)}
          onConnected={() => setLastfmModalOpen(false)}
        />
      ) : null}
    </div>
  );
}
