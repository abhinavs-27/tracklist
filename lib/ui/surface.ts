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
