import * as Linking from "expo-linking";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getSessionFromUrl,
  isOAuthCallbackUrl,
} from "../lib/get-session-from-url";

const AUTH_SESSION_KEY = ["auth", "session"] as const;

/**
 * Mounted at the app root (via `AuthProvider`). `getSessionFromUrl` matches
 * `supabase.auth.getSessionFromUrl({ url, storeSession: true })` when the SDK exposes it.
 */
export function OAuthLinkingHandler() {
  const queryClient = useQueryClient();

  useEffect(() => {
    async function handle(url: string | null) {
      if (!url || !isOAuthCallbackUrl(url)) return;
      const { error } = await getSessionFromUrl({
        url,
        storeSession: true,
      });
      if (error) {
        console.warn("[oauth] linking getSessionFromUrl error:", error.message);
      }
      await queryClient.invalidateQueries({ queryKey: AUTH_SESSION_KEY });
    }

    void Linking.getInitialURL().then((u) => handle(u));

    const sub = Linking.addEventListener("url", (event) => {
      void handle(event.url);
    });

    return () => sub.remove();
  }, [queryClient]);

  return null;
}
