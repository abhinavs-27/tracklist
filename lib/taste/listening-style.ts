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
    title: "Mainstream",
    subtitle: "You gravitate toward popular music — the stuff that’s already everywhere.",
  },
  "deep-cuts-dept": {
    title: "Deep cuts",
    subtitle: "You reach for tracks that don’t show up on the front page.",
  },
  "album-gravity-well": {
    title: "On Loop",
    subtitle: "A few records get most of the plays — you go deep on what you love.",
  },
  "omnivore-mode": {
    title: "Omnivore",
    subtitle: "Lots of different artists — hard to pin to one lane.",
  },
  "mainstay-mode": {
    title: "Mainstay",
    subtitle: "Most plays go to a tight circle of long-term favorites.",
  },
  "steady-rhythm": {
    title: "Consistent",
    subtitle: "You listen regularly without wild spikes or gaps — just steady rotation.",
  },
  "session-maximalist": {
    title: "Deep sessions",
    subtitle: "Some days you stack a lot of plays in a single sitting.",
  },
  "plotting-the-plot": {
    title: "Still building",
    subtitle: "Keep logging listens and your style will start to take shape.",
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
