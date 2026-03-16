"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useReviews } from "@/lib/hooks/use-reviews";

type UseReviewsReturn = ReturnType<typeof useReviews>;
type AlbumReviewsValue = (UseReviewsReturn & { albumId: string }) | null;

const AlbumReviewsContext = createContext<AlbumReviewsValue>(null);

export function AlbumReviewsProvider({
  albumId,
  children,
}: {
  albumId: string;
  children: ReactNode;
}) {
  const hook = useReviews("album", albumId);
  const value: AlbumReviewsValue = { ...hook, albumId };
  return (
    <AlbumReviewsContext.Provider value={value}>
      {children}
    </AlbumReviewsContext.Provider>
  );
}

export function useAlbumReviewsContext(): AlbumReviewsValue {
  return useContext(AlbumReviewsContext);
}
