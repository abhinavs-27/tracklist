import { describe, it, expect } from "vitest";
import {
  NOTIFICATION_CATEGORY,
  categoryForType,
  type NotificationType,
} from "./types";

const ALL_TYPES: NotificationType[] = [
  "follow",
  "like",
  "review_like",
  "comment",
  "music_recommendation",
  "community_invite",
  "community_follow",
  "weekly_charts",
];

describe("notification categories", () => {
  it("maps every notification type to a category", () => {
    for (const t of ALL_TYPES) {
      expect(NOTIFICATION_CATEGORY[t]).toBeTruthy();
    }
  });

  it("charts category is used only by weekly_charts", () => {
    expect(categoryForType("weekly_charts")).toBe("charts");
    expect(categoryForType("follow")).toBe("social");
    expect(categoryForType("music_recommendation")).toBe("recommendations");
    expect(categoryForType("community_invite")).toBe("community");
  });
});
