import { supabase } from "./supabase";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

// Cache the access token in memory so fetcher() never hits AsyncStorage per-request.
// Updated instantly via the Supabase auth state listener.
let _cachedToken: string | null = null;
let _tokenBootstrapped = false;
let _bootstrapPromise: Promise<void> | null = null;

function bootstrapToken(): Promise<void> {
  if (_bootstrapPromise) return _bootstrapPromise;
  _bootstrapPromise = supabase.auth.getSession().then(({ data }) => {
    _cachedToken = data.session?.access_token ?? null;
    _tokenBootstrapped = true;
  }).catch((e) => {
    // Don't cache the failure — next call will retry
    _bootstrapPromise = null;
    console.warn("[api] getSession failed during bootstrap:", e);
  });
  return _bootstrapPromise!;
}

// Keep cache fresh for the lifetime of the app.
supabase.auth.onAuthStateChange((_event, session) => {
  _cachedToken = session?.access_token ?? null;
  _tokenBootstrapped = true;
  // Resolve any in-flight bootstrap.
  _bootstrapPromise = Promise.resolve();
});

async function getToken(): Promise<string | null> {
  if (!_tokenBootstrapped) await bootstrapToken();
  return _cachedToken;
}

export async function fetcher<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_URL) {
    throw new Error("EXPO_PUBLIC_API_URL is not set");
  }

  const url = `${API_URL}${path}`;
  const token = await getToken();

  const headers = new Headers(init?.headers);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(url, {
    ...init,
    headers,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const body = await res.text().catch(() => "(unreadable)");
    throw new Error(
      `Expected JSON from ${url} but got ${contentType || "unknown content-type"}. ` +
      `Status: ${res.status}. Body preview: ${body.slice(0, 200)}`
    );
  }

  return res.json();
}
