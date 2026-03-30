/**
 * Client-safe labels, copy, and styling for social thread kinds.
 * Keeps inbox + thread detail context-aware without importing server-only modules.
 */

export type ThreadKindUiKey =
  | "recommendation"
  | "taste_comparison"
  | "activity";

export type ThreadKindUi = {
  label: string;
  /** Short line for list rows (under the badge). */
  listHint: string;
  /** Supporting line on thread detail under the title. */
  detailSubhead: string;
  replyPlaceholder: string;
  /** Left accent on list rows / cards (includes width) */
  accentBorder: string;
  /** Pill for kind badge */
  badge: string;
  /** Placeholder when no artwork */
  iconPlaceholder: string;
  /** Optional panel behind taste-match empty state */
  heroPanel: string;
};

export function threadKindUi(kind: ThreadKindUiKey): ThreadKindUi {
  switch (kind) {
    case "recommendation":
      return {
        label: "Recommendation",
        listHint: "Shared music",
        detailSubhead: "React on the recommendation or add a short note",
        replyPlaceholder: "Short note (optional)",
        accentBorder: "border-l-4 border-emerald-500/50",
        badge:
          "border border-emerald-800/50 bg-emerald-950/45 text-[10px] font-medium uppercase tracking-wide text-emerald-200/90",
        iconPlaceholder: "♪",
        heroPanel: "",
      };
    case "taste_comparison":
      return {
        label: "Taste match",
        listHint: "Listening overlap",
        detailSubhead:
          "A thread around your taste overlap — use notes for quick context, not long chats.",
        replyPlaceholder: "Quick context…",
        accentBorder: "border-l-4 border-violet-500/45",
        badge:
          "border border-violet-800/45 bg-violet-950/40 text-[10px] font-medium uppercase tracking-wide text-violet-200/90",
        iconPlaceholder: "⚖",
        heroPanel:
          "rounded-xl border border-violet-900/35 bg-gradient-to-br from-violet-950/30 via-zinc-950/20 to-zinc-950/50",
      };
    case "activity":
      return {
        label: "Activity",
        listHint: "Review or feed",
        detailSubhead:
          "Emoji reactions and light notes on this activity — same structure, different context.",
        replyPlaceholder: "Brief reply…",
        accentBorder: "border-l-4 border-sky-500/45",
        badge:
          "border border-sky-800/45 bg-sky-950/35 text-[10px] font-medium uppercase tracking-wide text-sky-200/90",
        iconPlaceholder: "◇",
        heroPanel: "",
      };
  }
}

export function parseThreadInboxKind(
  param: string | string[] | undefined,
): ThreadKindUiKey | null {
  if (typeof param !== "string" || !param.trim()) return null;
  const k = param.trim();
  if (k === "recommendation" || k === "taste_comparison" || k === "activity") {
    return k;
  }
  return null;
}

export function entityTypeShort(
  entityType: string | null | undefined,
): string | null {
  if (!entityType) return null;
  const e = entityType.toLowerCase();
  if (e === "artist") return "Artist";
  if (e === "album") return "Album";
  if (e === "track" || e === "song") return "Track";
  return null;
}
