const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

export async function fetcher<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  if (!API_URL) {
    throw new Error("EXPO_PUBLIC_API_URL is not set");
  }

  const url = `${API_URL}${path}`;
  const method = (init?.method ?? "GET").toUpperCase();

  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
    });

    if (__DEV__) {
      // Helps track down "Network request failed" by exposing the exact URL + status.
      console.log(`[api] ${method} ${url} -> ${res.status}`);
    }

    if (!res.ok) {
      // Include response body when possible to see backend validation errors.
      let bodyText = "";
      try {
        bodyText = await res.text();
      } catch {
        // ignore
      }

      throw new Error(
        `Request failed with status ${res.status}${bodyText ? `: ${bodyText.slice(0, 500)}` : ""}`,
      );
    }

    try {
      return (await res.json()) as T;
    } catch (e) {
      let bodyText = "";
      try {
        bodyText = await res.text();
      } catch {
        // ignore
      }
      throw new Error(
        `Failed to parse JSON for ${url}${bodyText ? `: ${bodyText.slice(0, 500)}` : ""}`,
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Network-level errors commonly appear as generic "Network request failed".
    throw new Error(`Fetch failed for ${url}: ${msg}`);
  }
}

