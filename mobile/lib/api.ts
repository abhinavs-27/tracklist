const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

export async function fetcher<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_URL) {
    throw new Error("EXPO_PUBLIC_API_URL is not set");
  }

  const url = `${API_URL}${path}`;

  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  console.log(`[api] ${url} -> ${res.status}`);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  if (res.status === 204) return undefined as T;

  return res.json();
}
