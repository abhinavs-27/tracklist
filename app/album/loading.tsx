import { AlbumPageSkeleton } from "./album-page-skeleton";

/**
 * Loading UI for the /album segment. Next.js may show this (instead of
 * [id]/loading.tsx) when navigating to an album page; using the same
 * full album skeleton ensures the cover + tracks shape is always visible.
 */
export default function AlbumLoading() {
  return <AlbumPageSkeleton />;
}
