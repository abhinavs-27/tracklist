/** Thrown when Spotify returns HTTP 429 — do not retry the request. */
export class SpotifyRateLimitError extends Error {
  constructor(
    message: string,
    public readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "SpotifyRateLimitError";
  }
}
