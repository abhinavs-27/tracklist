// lib/taste/listening-style.ts
/**
 * Listening style keys, display copy, badge labels, and visual config.
 * Shared between web (lib/) and mobile (via @repo alias in mobile/tsconfig.json).
 */

export type TasteListeningStyle =
  | "genre-nomad"        // Range axis: Nomad pole (high unique_artists/plays ratio)
  | "the-devotee"        // Range axis: Devotee pole (low ratio — tight circle)
  | "cultural-pulse"     // Signal axis: Mainstream pole (high avg track popularity)
  | "the-archivist"      // Signal axis: Underground pole (low avg track popularity)
  | "session-maximalist" // Mode axis: Sessions pole (high max weekly plays)
  | "daily-ritual"       // Mode axis: Ritual pole (consistent week-over-week presence)
  | "the-explorer"       // Discovery axis: Explorer pole (high new-artist ratio)
  | "the-loyalist"       // Discovery axis: Loyalist pole (low new-artist ratio)
  | "well-rounded"       // No strong axis — genuinely balanced
  | "still-forming";     // Informational state only: < 100 total plays

export type StyleCopy = {
  title: string;
  /** Third-person observer voice — like a friend describing your taste to someone else. */
  subtitle: string;
  /** Short badge label when this style appears as a secondary signal */
  badge: string;
};

export const LISTENING_STYLE_COPY: Record<TasteListeningStyle, StyleCopy> = {
  "genre-nomad": {
    title: "Genre Nomad",
    subtitle: "Jazz one week, something completely different the next. Hard to pin down and the range is real.",
    badge: "Nomad",
  },
  "the-devotee": {
    title: "The Devotee",
    subtitle: "Has a handful of artists they actually care about. New stuff comes out and mostly they're going back to the same records.",
    badge: "Devotee",
  },
  "cultural-pulse": {
    title: "Cultural Pulse",
    subtitle: "Listens to a lot of popular music. Knows what's charting and is usually into it.",
    badge: "Mainstream",
  },
  "the-archivist": {
    title: "The Archivist",
    subtitle: "The kind of listener who sends you something you've never heard of, and then three months later everyone has it.",
    badge: "Underground",
  },
  "session-maximalist": {
    title: "Session Maximalist",
    subtitle: "Puts something on and two hours later is still going. Doesn't do background music.",
    badge: "Sessions",
  },
  "daily-ritual": {
    title: "Daily Ritual",
    subtitle: "Music runs through most of the day. Morning, commute, home. It stays on.",
    badge: "Ritual",
  },
  "the-explorer": {
    title: "The Explorer",
    subtitle: "The listening history from two months ago looks almost nothing like today. Moves through new music fast.",
    badge: "Explorer",
  },
  "the-loyalist": {
    title: "The Loyalist",
    subtitle: "Goes back to the same artists again and again. New music is fine but the same ones always win.",
    badge: "Loyalist",
  },
  "well-rounded": {
    title: "Well Rounded",
    subtitle: "No single axis dominates. Broad enough to cover ground, focused enough to go deep.",
    badge: "",
  },
  "still-forming": {
    title: "Still Forming",
    subtitle: "Not enough data yet to say much. The picture fills in over time.",
    badge: "",
  },
};

/** Accent hex color for the share card gradient */
export const STYLE_ACCENT_COLOR: Record<TasteListeningStyle, string> = {
  "genre-nomad":        "#10b981",
  "the-devotee":        "#f59e0b",
  "cultural-pulse":     "#eab308",
  "the-archivist":      "#818cf8",
  "session-maximalist": "#6366f1",
  "daily-ritual":       "#38bdf8",
  "the-explorer":       "#34d399",
  "the-loyalist":       "#fb923c",
  "well-rounded":       "#a1a1aa",
  "still-forming":      "#52525b",
};

/** Labels for the axis breakdown bars */
export const AXIS_DISPLAY: {
  range:     { left: string; right: string };
  signal:    { left: string; right: string };
  mode:      { left: string; right: string };
  discovery: { left: string; right: string };
} = {
  range:     { left: "Devotee", right: "Nomad" },
  signal:    { left: "Underground", right: "Mainstream" },
  mode:      { left: "Ritual", right: "Sessions" },
  discovery: { left: "Loyalist", right: "Explorer" },
};

/** Map legacy string values from old cache payloads to new keys */
const LEGACY_MAP: Record<string, TasteListeningStyle> = {
  "chart-gravity":       "cultural-pulse",
  "deep-cuts-dept":      "the-archivist",
  "album-gravity-well":  "the-devotee",
  "omnivore-mode":       "genre-nomad",
  "mainstay-mode":       "the-loyalist",
  "steady-rhythm":       "daily-ritual",
  "session-maximalist":  "session-maximalist",
  "plotting-the-plot":   "still-forming",
  // Even older pre-v2 labels
  casual:            "still-forming",
  mainstream:        "cultural-pulse",
  "crate digger":    "the-archivist",
  "deep listener":   "the-devotee",
  explorer:          "genre-nomad",
  "binge listener":  "session-maximalist",
};

export function normalizeListeningStyle(raw: string | undefined | null): TasteListeningStyle {
  if (!raw || typeof raw !== "string") return "still-forming";
  const trimmed = raw.trim();
  if (trimmed in LISTENING_STYLE_COPY) return trimmed as TasteListeningStyle;
  if (trimmed in LEGACY_MAP) return LEGACY_MAP[trimmed]!;
  return "still-forming";
}

export function getListeningStyleDisplay(style: TasteListeningStyle): StyleCopy {
  return LISTENING_STYLE_COPY[style] ?? LISTENING_STYLE_COPY["still-forming"];
}
