/**
 * App-wide layout tokens: max width, horizontal padding, main + sidebar grid.
 * Breakpoints match Tailwind defaults (see app/globals.css): md ≈ tablet, lg ≈ desktop.
 */

/** Centered content rail (matches `<main>` and nav inner shells). */
export const pageWidthShell = "mx-auto w-full max-w-6xl min-w-0";

/**
 * Global horizontal page padding (comfortable on small screens — wide gutters
 * like px-16+ quickly eat mobile width and feel cramped).
 */
export const pagePadding = "px-4 sm:px-6 lg:px-8";

/** Nav + main inner wrapper: width cap + horizontal padding. */
export const pageShell = `${pageWidthShell} ${pagePadding}`;

/**
 * Vertical spacing between stacked main/sidebar blocks below `lg`.
 * `gap-8` keeps mobile/tablet from feeling tight; `lg` uses the same for column gutter.
 */
export const layoutStackGap = "gap-8";

/**
 * 12-column grid: single column + stack gap below lg; 8 + 4 at lg+.
 * Use with `layoutMainColumn` / `layoutSidebarColumn` on children.
 */
export const layoutMainSidebarGrid = `grid grid-cols-1 ${layoutStackGap} lg:grid-cols-12 lg:items-start lg:gap-8`;

/**
 * Narrower reading widths inside the padded `<main>` (no extra horizontal padding).
 */
export const contentMaxMd = "mx-auto w-full min-w-0 max-w-md";

export const contentMaxLg = "mx-auto w-full min-w-0 max-w-lg";

export const contentMax2xl = "mx-auto w-full min-w-0 max-w-2xl";

export const contentMax4xl = "mx-auto w-full min-w-0 max-w-4xl";

/** Primary column (8 / 12) on large screens. */
export const layoutMainColumn = "min-w-0 lg:col-span-8";

/** Sidebar column (4 / 12) on large screens. */
export const layoutSidebarColumn = "min-w-0 lg:col-span-4";
