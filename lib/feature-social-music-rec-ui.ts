/**
 * Temporary kill-switch for **social inbox** + **music-recommendation** UI (recommended
 * communities, taste previews, send-rec modals, `/social/inbox`, `/discover/recommended`, etc.).
 *
 * Re-enable by setting `NEXT_PUBLIC_FEATURE_SOCIAL_INBOX_MUSIC_REC_UI=1` in `.env.local`.
 * API routes and server logic stay in place; navigation and visible surfaces are gated only.
 */
export const SOCIAL_INBOX_AND_MUSIC_REC_UI_ENABLED =
  process.env.NEXT_PUBLIC_FEATURE_SOCIAL_INBOX_MUSIC_REC_UI === "1";

export function isSocialInboxAndMusicRecUiEnabled(): boolean {
  return SOCIAL_INBOX_AND_MUSIC_REC_UI_ENABLED;
}
