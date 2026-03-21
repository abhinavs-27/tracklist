import type { ReactNode } from "react";
import { OAuthLinkingHandler } from "../components/OAuthLinkingHandler";
import { useAuthStateListener } from "./hooks/useAuth";

export function AuthProvider({ children }: { children: ReactNode }) {
  useAuthStateListener();
  return (
    <>
      <OAuthLinkingHandler />
      {children}
    </>
  );
}
