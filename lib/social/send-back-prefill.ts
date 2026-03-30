import type { SocialThreadRow } from "@/lib/social/threads";

export type SendBackPrefill = {
  initialKind: "artist" | "album" | "track";
  initialQuery: string;
  contextHint: string;
};

/** Seeds Send recommendation search from thread context (artist / album / track). */
export function sendBackPrefillFromThread(t: SocialThreadRow): SendBackPrefill {
  const et = (t.music_entity_type ?? "").toLowerCase();
  if (et === "artist" && t.music_title?.trim()) {
    return {
      initialKind: "artist",
      initialQuery: t.music_title.trim(),
      contextHint: "More from this artist or a similar one.",
    };
  }
  if (et === "album" && t.music_title?.trim()) {
    return {
      initialKind: "album",
      initialQuery: t.music_title.trim(),
      contextHint: "Same artist or albums in a similar lane.",
    };
  }
  if ((et === "track" || et === "song") && t.music_title?.trim()) {
    const artist =
      t.music_subtitle?.split("·")[0]?.split(",")[0]?.trim() ?? "";
    return {
      initialKind: "track",
      initialQuery: artist || t.music_title.trim(),
      contextHint: "Tracks or artists in the same vibe.",
    };
  }
  if (t.kind === "taste_comparison") {
    return {
      initialKind: "artist",
      initialQuery: "",
      contextHint: "Send something in a similar spirit.",
    };
  }
  return {
    initialKind: "artist",
    initialQuery: t.music_title?.trim() ?? "",
    contextHint: "Reply with music they might like.",
  };
}
