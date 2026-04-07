"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type Ctx = {
  optimisticAvatarUrl: string | null;
  setOptimisticAvatarUrl: (url: string | null) => void;
};

const ProfileAvatarOptimisticContext = createContext<Ctx | null>(null);

export function ProfileAvatarOptimisticProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [optimisticAvatarUrl, setOptimisticAvatarUrl] = useState<string | null>(
    null,
  );

  const value = useMemo(
    () => ({ optimisticAvatarUrl, setOptimisticAvatarUrl }),
    [optimisticAvatarUrl],
  );

  return (
    <ProfileAvatarOptimisticContext.Provider value={value}>
      {children}
    </ProfileAvatarOptimisticContext.Provider>
  );
}

export function useProfileAvatarOptimistic(): Ctx | null {
  return useContext(ProfileAvatarOptimisticContext);
}
