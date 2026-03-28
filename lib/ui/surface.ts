/**
 * Shared surface / elevation tokens for consistent UI across the app.
 * Prefer ring + shadow over heavy borders (premium, low-noise).
 */

/** Primary content card: rounded-2xl, soft shadow, subtle ring. */
export const cardElevated =
  "rounded-2xl bg-zinc-900/55 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.55)] ring-1 ring-inset ring-white/[0.07]";

/** Interactive list rows / tiles. */
export const cardElevatedInteractive =
  `${cardElevated} transition-all duration-300 ease-out hover:bg-zinc-900/75 hover:shadow-[0_12px_40px_-10px_rgba(0,0,0,0.45)] hover:ring-white/[0.11] motion-safe:active:scale-[0.99]`;

/** Section vertical rhythm between major blocks. */
export const sectionGap = "space-y-10 sm:space-y-12";

/** Page title (hero / H1). */
export const pageTitle =
  "text-3xl font-bold tracking-tight text-white sm:text-4xl";

/** Secondary page title (H2 / section). */
export const sectionTitle =
  "text-xl font-semibold tracking-tight text-white sm:text-2xl";

/** Muted supporting line under titles. */
export const pageSubtitle = "mt-2 text-base text-zinc-400 sm:text-lg leading-relaxed";

/** Staggered children (use with animation-delay per child). */
export const staggerChild =
  "motion-safe:animate-[fade-in-up_0.45s_ease-out_both]";

/** Pill / tab groups (leaderboard, filters). */
export const segmentedShell =
  "rounded-2xl bg-zinc-900/65 p-1 shadow-[inset_0_2px_12px_rgba(0,0,0,0.4)] ring-1 ring-inset ring-white/[0.07]";

export const segmentedButtonActive =
  "rounded-xl bg-zinc-700 text-white shadow-sm ring-1 ring-white/10";

export const segmentedButtonIdle =
  "text-zinc-400 transition-colors hover:text-white";

/* ── Community detail page: unified cards + 3 text tiers (headline / body / meta) ── */

/** Primary section card: rounded-2xl, soft shadow, subtle ring (no heavy borders). */
export const communityCard =
  "rounded-2xl bg-zinc-900/50 p-5 shadow-[0_12px_40px_-16px_rgba(0,0,0,0.55)] ring-1 ring-white/[0.06] sm:p-6";

/** Inset panel inside a community card (nested blocks). */
export const communityInset =
  "rounded-2xl bg-zinc-950/40 ring-1 ring-white/[0.05]";

/** Section / card titles. */
export const communityHeadline =
  "text-lg font-semibold tracking-tight text-white sm:text-xl";

/** Primary reading text. */
export const communityBody = "text-sm leading-relaxed text-zinc-300";

/** Captions, timestamps, secondary lines. */
export const communityMeta = "text-xs text-zinc-500";

/** Eyebrow labels (still metadata size). */
export const communityMetaLabel =
  "text-xs font-medium uppercase tracking-[0.12em] text-zinc-500";

/** Pagination & low-emphasis actions. */
export const communityButton =
  "rounded-xl bg-zinc-800/80 px-4 py-2.5 text-sm font-medium text-zinc-200 ring-1 ring-white/[0.08] transition hover:bg-zinc-700/80 disabled:cursor-not-allowed disabled:opacity-40";

/** Feed row cards — same shell as `communityCard` with hover. */
export const communityFeedCard =
  "rounded-2xl bg-zinc-900/50 p-5 shadow-[0_12px_40px_-16px_rgba(0,0,0,0.55)] ring-1 ring-white/[0.06] transition-colors hover:bg-zinc-900/58 sm:p-6";

/** Trending emphasis for feed rows (replaces default ring). */
export const communityFeedCardTrending =
  "rounded-2xl bg-zinc-900/50 p-5 shadow-[0_0_48px_-14px_rgba(16,185,129,0.18)] ring-2 ring-emerald-500/20 transition-colors hover:bg-zinc-900/58 sm:p-6";
