/**
 * App-wide layout tokens: max width, horizontal padding, main + sidebar grid.
 * Breakpoints match Tailwind defaults (see app/globals.css): md ≈ tablet, lg ≈ desktop.
 */

/**
 * Centered content rail (matches `<main>` and nav inner shells).
 * Scales up on wide viewports so large monitors aren’t stuck at ~1152px (`max-w-6xl`).
 * `3xl` matches `--breakpoint-3xl` (1800px) in `app/globals.css`.
 */
export const pageWidthShell =
  "mx-auto w-full min-w-0 max-w-6xl xl:max-w-7xl 2xl:max-w-[90rem] 3xl:max-w-[112.5rem]";

/**
 * Global horizontal page padding (comfortable on small screens — wide gutters
 * like px-16+ quickly eat mobile width and feel cramped).
 */
export const pagePadding = "px-4 sm:px-6 lg:px-8";

/** Nav + main inner wrapper: width cap + horizontal padding. */
export const pageShell = `${pageWidthShell} ${pagePadding}`;

/**
 * Community detail page root inside `<main>` — only width-safe helpers. Horizontal bounds and
 * padding come from `AppLayout` (`pageWidthShell` + `pagePadding`); do not duplicate padding here.
 */
export const communityWideContainer =
  "min-w-0 w-full max-w-full overflow-x-clip";

/**
 * Desktop chart row: **CSS Grid** with explicit `column-gap` + `minmax(0,1fr)` center column.
 * Flex `gap` was not producing visible gutters in some layouts; grid `gap-x-*` is reliable here.
 * Below 3xl: two columns [main | right]. At 3xl: [left rail | main | right].
 */
export const communityDesktopTopRow =
  "grid w-full min-w-0 max-w-full grid-cols-1 gap-y-10 overflow-x-clip " +
  "lg:grid-cols-[minmax(0,1fr)_14rem] lg:items-start lg:gap-x-8 lg:gap-y-0 " +
  "3xl:grid-cols-[8.5rem_minmax(0,1fr)_13rem] 3xl:gap-x-10";

/** Left “On this page” rail — column width comes from grid template at 3xl. */
export const communityDesktopLeftRailColumn =
  "hidden min-w-0 max-w-full overflow-x-clip 3xl:block 3xl:min-w-0";

/** Main chart + taste/weekly — center column (`minmax(0,1fr)`). */
export const communityDesktopMainColumn =
  "min-w-0 flex flex-col gap-12 overflow-x-clip max-w-full";

/** Right sidebar — last grid column (fixed width from template). */
export const communityDesktopRightSidebar =
  "min-w-0 max-w-full overflow-x-clip";

/** Tighter cards + type inside the desktop right rail (pairs with `communityDesktopRightSidebar`). */
export const communityDesktopSidebarCompact =
  "[&>div>section]:!p-4 [&>div>div]:!p-4 [&_h3]:!text-[0.9375rem] [&_h3]:!leading-tight [&_p]:!text-[0.8125rem] [&_.text-lg]:!text-base [&_.text-xl]:!text-lg";

/** Slightly larger type on ultra-wide community desktop for readability. */
export const communityDesktopUltrawideType =
  "3xl:text-[1.0625rem] 3xl:[&_section>header>h2]:text-[1.75rem] 3xl:[&_section>header>p]:text-[0.9375rem]";

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
