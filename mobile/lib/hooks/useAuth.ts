import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../supabase";
import { signInWithGoogleOAuth, signInWithApple } from "../auth-oauth";
import { unregisterPushWithBackend } from "../notifications";

const AUTH_SESSION_KEY = ["auth", "session"] as const;

export type UseAuthResult = {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  signInWithGoogle: () => Promise<{ error: Error | null; cancelled?: boolean }>;
  signInWithApple: () => Promise<{ error: Error | null; cancelled?: boolean }>;
  signOut: () => Promise<void>;
};

/**
 * Supabase session + user (React Query). Auth listener runs in `AuthProvider`.
 */
export function useAuth(): UseAuthResult {
  const queryClient = useQueryClient();

  const { data: session, isLoading, isPending } = useQuery({
    queryKey: AUTH_SESSION_KEY,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.warn("[useAuth] getSession error:", error);
          return null;
        }
        return data.session;
      } catch (e) {
        console.warn("[useAuth] getSession threw:", e);
        return null;
      }
    },
    staleTime: Infinity,
  });

  const signOutMutation = useMutation({
    mutationFn: async () => {
      // Time-box the Supabase signOut — if it takes > 5s, force clear locally
      const timeout = new Promise<void>((resolve) => setTimeout(resolve, 5000));
      await Promise.race([supabase.auth.signOut(), timeout]);
    },
    onSettled: () => {
      // Always clear cache whether signOut succeeded or timed out
      queryClient.setQueryData(AUTH_SESSION_KEY, null);
      queryClient.invalidateQueries({ queryKey: AUTH_SESSION_KEY });
      queryClient.clear();
    },
  });

  return {
    session: session ?? null,
    user: session?.user ?? null,
    isLoading: isLoading || isPending,
    signInWithGoogle: async () => {
      const { error, cancelled } = await signInWithGoogleOAuth();
      if (!error && !cancelled) {
        await queryClient.invalidateQueries({ queryKey: AUTH_SESSION_KEY });
      }
      return { error, cancelled };
    },
    signInWithApple: async () => {
      const { error, cancelled } = await signInWithApple();
      if (!error && !cancelled) {
        await queryClient.invalidateQueries({ queryKey: AUTH_SESSION_KEY });
      }
      return { error, cancelled };
    },
    signOut: async () => {
      try {
        await unregisterPushWithBackend();
      } catch (e) {
        console.warn("[useAuth] unregisterPushWithBackend failed:", e);
      }
      await signOutMutation.mutateAsync();
    },
  };
}

/** Subscribe to Supabase auth changes (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, …). */
export function useAuthStateListener() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      queryClient.invalidateQueries({ queryKey: AUTH_SESSION_KEY });
    });
    return () => subscription.unsubscribe();
  }, [queryClient]);
}
