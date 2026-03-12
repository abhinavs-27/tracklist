import { test } from "@playwright/test";

test.describe("Spotify sync / automatic logging", () => {
  test("stub: recently-played sync creates logs", async () => {
    test.skip(
      true,
      [
        "Missing product surface for Spotify sync/auto logging.",
        "No `/api/spotify/callback` or `/api/spotify/sync` route exists yet (only `/api/spotify/album/[id]`).",
        "When implemented, this test should:",
        "- mock Spotify recently-played response",
        "- trigger sync action (UI button or cron endpoint)",
        "- assert `/api/logs` called for new plays and deduped for old ones",
      ].join("\n"),
    );
  });
});
