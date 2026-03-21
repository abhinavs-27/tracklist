import { Platform } from "react-native";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[supabase] EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY is missing",
  );
} else if (__DEV__) {
  console.log("[supabase] EXPO_PUBLIC_SUPABASE_URL:", supabaseUrl);
  console.log(
    "[supabase] EXPO_PUBLIC_SUPABASE_ANON_KEY set:",
    supabaseAnonKey.length > 0,
  );
}

function warnStorageError(context: string, e: unknown) {
  console.warn(`[supabase] AsyncStorage / storage (${context}):`, e);
}

/** Web: localStorage. Native: AsyncStorage (required only on ios/android). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let storage: any;

if (Platform.OS === "web") {
  storage = {
    getItem: async (key: string) => {
      try {
        if (typeof window === "undefined") return null;
        return window.localStorage.getItem(key);
      } catch (e) {
        warnStorageError("getItem", e);
        return null;
      }
    },
    setItem: async (key: string, value: string) => {
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(key, value);
        }
      } catch (e) {
        warnStorageError("setItem", e);
      }
    },
    removeItem: async (key: string) => {
      try {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(key);
        }
      } catch (e) {
        warnStorageError("removeItem", e);
      }
    },
  };
} else {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  storage = require("@react-native-async-storage/async-storage").default;
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    persistSession: true,
    autoRefreshToken: true,
    /** Parse OAuth tokens from URL hash on web after redirect from Google. */
    detectSessionInUrl: Platform.OS === "web",
  },
});
