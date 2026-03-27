import "server-only";

/**
 * Last.fm Web API (`ws.audioscrobbler.com`) often rejects requests with a generic
 * Node/undici User-Agent (406/403). Use a stable, identifiable app UA.
 * Override with `LASTFM_HTTP_USER_AGENT` if needed.
 */
const DEFAULT_LASTFM_UA =
  process.env.LASTFM_HTTP_USER_AGENT?.trim() ||
  "Tracklist/1.0 (+https://tracklist.app)";

export function lastfmApiHeaders(): Headers {
  const h = new Headers();
  h.set("Accept", "application/json");
  h.set("User-Agent", DEFAULT_LASTFM_UA);
  return h;
}

/** All server-side calls to `ws.audioscrobbler.com` should go through this. */
export async function fetchLastfmApi(
  url: string | URL,
  init?: RequestInit,
): Promise<Response> {
  const headers = lastfmApiHeaders();
  if (init?.headers) {
    const extra = new Headers(init.headers as HeadersInit);
    extra.forEach((v, k) => headers.set(k, v));
  }
  return fetch(typeof url === "string" ? url : url.toString(), {
    ...init,
    headers,
  });
}
