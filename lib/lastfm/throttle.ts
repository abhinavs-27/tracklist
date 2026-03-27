import "server-only";

const MIN_GAP_MS = 320;
let lastRequestAt = 0;

/** Serialize Last.fm HTTP calls to respect informal rate limits. */
export async function throttleLastfm(): Promise<void> {
  const now = Date.now();
  const wait = lastRequestAt + MIN_GAP_MS - now;
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  lastRequestAt = Date.now();
}
