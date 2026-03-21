import { supabase } from "./supabase";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

export async function fetcher<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_URL) {
    throw new Error("EXPO_PUBLIC_API_URL is not set");
  }

  const url = `${API_URL}${path}`;

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  const headers = new Headers(init?.headers);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(url, {
    ...init,
    credentials: "include",
    headers,
  });

  console.log(`[api] ${url} -> ${res.status}`);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  if (res.status === 204) return undefined as T;

  return res.json();
}
