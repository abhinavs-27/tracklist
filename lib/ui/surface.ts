/**
 * Shared surface / elevation tokens for consistent UI across the app.
 * Prefer ring + shadow over heavy borders (premium, low-noise).
 */

/** Standard card corner radius — use for card-like surfaces app-wide. */
export const cardRadius = "rounded-2xl";

/** Default card padding (sections, modals, outlined cards). */
export const cardPadding = "p-5 sm:p-6";

/** Tighter padding for dense rows (charts, compact lists). */
export const cardPaddingCompact = "p-4 sm:p-5";

/**
 * Hover: subtle scale + stronger shadow/ring (pair with `transition-all duration-300`).
 */
export const cardHoverLift =
  "motion-safe:hover:scale-[1.01] hover:shadow-[0_14px_40px_-12px_rgba(0,0,0,0.48)] hover:ring-white/[0.11]";

/** Primary content card: soft shadow, subtle ring, elevated contrast. */
export const cardElevated = `${cardRadius} bg-zinc-900/62 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.55)] ring-1 ring-inset ring-white/[0.08]`;

/** Interactive list rows / tiles. */
export const cardElevatedInteractive = `${cardElevated} transition-all duration-300 ease-out hover:bg-zinc-900/78 ${cardHoverLift} motion-safe:active:scale-[0.99]`;

/**
 * Bordered card (reviews, settings-style blocks): padding + hover polish.
 */
export const cardOutlined = `${cardRadius} border border-zinc-800/75 bg-zinc-900/54 ${cardPadding} shadow-[0_8px_28px_-12px_rgba(0,0,0,0.48)] ring-1 ring-inset ring-white/[0.06] transition-all duration-300 ease-out motion-safe:hover:scale-[1.01] hover:border-zinc-700/65 hover:bg-zinc-900/72 hover:shadow-[0_12px_36px_-14px_rgba(0,0,0,0.5)] hover:ring-white/[0.09] motion-safe:active:scale-[0.99]`;

/** Media grid tiles: compact padding, same radius family. */
export const mediaGridTileCard = `${cardRadius} border border-zinc-800/75 bg-zinc-900/58 p-3 shadow-[0_6px_22px_-10px_rgba(0,0,0,0.42)] ring-1 ring-inset ring-white/[0.05] transition-all duration-300 ease-out motion-safe:hover:scale-[1.01] hover:border-emerald-500/35 hover:bg-zinc-900/76 hover:shadow-[0_10px_32px_-12px_rgba(0,0,0,0.45)] hover:ring-emerald-500/12`;

/** Static panel (alerts, empty copy) — same radius/padding family, no hover scale. */
export const cardMuted = `${cardRadius} border border-zinc-800/75 bg-zinc-900/52 ${cardPadding} shadow-[0_8px_28px_-12px_rgba(0,0,0,0.45)] ring-1 ring-inset ring-white/[0.06]`;

export const cardMutedCompact = `${cardRadius} border border-zinc-800/75 bg-zinc-900/52 ${cardPaddingCompact} shadow-[0_8px_28px_-12px_rgba(0,0,0,0.42)] ring-1 ring-inset ring-white/[0.06]`;

/** Weekly chart / personal billboard ranking row shell. */
export const chartRankingRowShell = `${cardRadius} overflow-hidden border border-zinc-800/85 bg-zinc-900/48 ring-1 ring-inset ring-white/[0.06] transition-all duration-300 ease-out motion-safe:hover:scale-[1.01] hover:border-zinc-700/72 hover:bg-zinc-900/66 hover:ring-white/[0.09]`;

/** “Biggest movers” style chart callout cards. */
export const chartMoverCard = `${cardRadius} border border-zinc-800/85 bg-zinc-900/50 ${cardPadding} shadow-[0_10px_32px_-12px_rgba(0,0,0,0.48)] ring-1 ring-inset ring-white/[0.06] transition-all duration-300 ease-out motion-safe:hover:scale-[1.01] hover:border-zinc-700/72 hover:bg-zinc-900/68 hover:ring-white/[0.09]`;

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
  `${cardRadius} bg-zinc-900/65 p-1 shadow-[inset_0_2px_12px_rgba(0,0,0,0.4)] ring-1 ring-inset ring-white/[0.07]`;

export const segmentedButtonActive =
  "rounded-xl bg-zinc-700 text-white shadow-sm ring-1 ring-white/10";

export const segmentedButtonIdle =
  "text-zinc-400 transition-colors hover:text-white";

/* ── Community detail page: unified cards + 3 text tiers (headline / body / meta) ── */

/** Primary section card: soft shadow, subtle ring (no heavy borders). */
export const communityCard = `${cardRadius} bg-zinc-900/58 ${cardPadding} shadow-[0_12px_40px_-16px_rgba(0,0,0,0.55)] ring-1 ring-white/[0.07]`;

/** Inset panel inside a community card (nested blocks). */
export const communityInset = `${cardRadius} bg-zinc-950/40 ring-1 ring-white/[0.05]`;

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
  `${cardRadius} bg-zinc-800/80 px-4 py-2.5 text-sm font-medium text-zinc-200 ring-1 ring-white/[0.08] transition hover:bg-zinc-700/80 disabled:cursor-not-allowed disabled:opacity-40`;

/** Feed row cards — same shell as `communityCard` with hover. */
export const communityFeedCard = `${communityCard} transition-all duration-300 ease-out motion-safe:hover:scale-[1.01] hover:bg-zinc-900/70 hover:shadow-[0_14px_44px_-14px_rgba(0,0,0,0.5)] hover:ring-white/[0.09]`;

/** Trending emphasis for feed rows (replaces default ring). */
export const communityFeedCardTrending = `${cardRadius} bg-zinc-900/58 ${cardPadding} shadow-[0_0_48px_-14px_rgba(16,185,129,0.18)] ring-2 ring-emerald-500/20 transition-all duration-300 ease-out motion-safe:hover:scale-[1.01] hover:bg-zinc-900/70 hover:shadow-[0_0_52px_-12px_rgba(16,185,129,0.22)] hover:ring-emerald-500/28`;
