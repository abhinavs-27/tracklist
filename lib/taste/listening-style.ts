/**
 * Listening “persona” keys + display copy. Kept in one module for web + mobile.
 */

export type TasteListeningStyle =
  | "chart-gravity"
  | "deep-cuts-dept"
  | "album-gravity-well"
  | "omnivore-mode"
  | "mainstay-mode"
  | "steady-rhythm"
  | "session-maximalist"
  | "plotting-the-plot";

export const LISTENING_STYLE_COPY: Record<
  TasteListeningStyle,
  { title: string; subtitle: string }
> = {
  "chart-gravity": {
    title: "Chart pull",
    subtitle: "Mostly popular tracks and the stuff that’s already everywhere.",
  },
  "deep-cuts-dept": {
    title: "Deep cuts",
    subtitle: "You reach for tracks that don’t show up on the front page.",
  },
  "album-gravity-well": {
    title: "On Loop",
    subtitle: "A few records get most of the plays.",
  },
  "omnivore-mode": {
    title: "Omnivore",
    subtitle: "Lots of different artists — hard to pin to one lane.",
  },
  "mainstay-mode": {
    title: "Mainstay",
    subtitle: "Most plays go to a small circle of favorites.",
  },
  "steady-rhythm": {
    title: "Steady rhythm",
    subtitle: "Regular listening — not huge spikes, not wild rotation.",
  },
  "session-maximalist": {
    title: "Long runs",
    subtitle: "Some days you stack a lot of plays in one sitting.",
  },
  "plotting-the-plot": {
    title: "Still early",
    subtitle: "Not enough history here yet; keep logging and this firms up.",
  },
};

/** Cached payloads may use pre–v2 string labels. */
const LEGACY_TO_STYLE: Record<string, TasteListeningStyle> = {
  casual: "plotting-the-plot",
  mainstream: "chart-gravity",
  "crate digger": "deep-cuts-dept",
  "deep listener": "album-gravity-well",
  explorer: "omnivore-mode",
  "binge listener": "session-maximalist",
};

export function normalizeListeningStyle(
  raw: string | undefined | null,
): TasteListeningStyle {
  if (!raw || typeof raw !== "string") return "plotting-the-plot";
  const trimmed = raw.trim();
  if (trimmed in LISTENING_STYLE_COPY) return trimmed as TasteListeningStyle;
  if (trimmed in LEGACY_TO_STYLE) return LEGACY_TO_STYLE[trimmed]!;
  return "plotting-the-plot";
}

export function getListeningStyleDisplay(style: TasteListeningStyle): {
  title: string;
  subtitle: string;
} {
  return (
    LISTENING_STYLE_COPY[style] ?? LISTENING_STYLE_COPY["plotting-the-plot"]
  );
}
