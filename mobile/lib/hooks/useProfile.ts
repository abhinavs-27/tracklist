import { useQuery } from "@tanstack/react-query";
import { fetcher } from "../api";
import { queryKeys } from "../query-keys";
import type { UserListSummary, UserListsApiResponse } from "../types/user-list";
import { useAuth } from "./useAuth";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

function normalizeAlbumImageUrl(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (s.startsWith("http://")) return `https://${s.slice("http://".length)}`;
  return s;
}

/** GET /api/users/[username] */
export type ProfileUser = {
  id: string;
  username: string;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  /** Own profile only — Last.fm username for scrobble import */
  lastfm_username?: string | null;
  /** Own profile only — last server sync (cron or save) */
  lastfm_last_synced_at?: string | null;
  followers_count: number;
  following_count: number;
  is_following: boolean;
  is_own_profile: boolean;
  review_count?: number;
  streak?: {
    current_streak: number;
    longest_streak: number;
    last_listen_date: string | null;
  } | null;
};

export type ProfileStats = {
  followers: number;
  following: number;
  reviewCount: number | null;
};

export type ProfileFavoriteItem = {
  id: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
};

/** @deprecated use UserListSummary — kept for profile component imports */
export type ProfileListSummary = UserListSummary;

export type ProfileActivityItem = {
  id: string;
  kind: "recent_play";
  title: string;
  subtitle: string;
  actionLabel: string;
  albumId: string;
  artworkUrl: string | null;
};

type FavoriteAlbumApi = {
  album_id: string;
  position: number;
  name: string;
  image_url: string | null;
  artist_name: string;
};

type RecentAlbumsResponse = {
  albums: Array<{
    album_id: string;
    album_name: string | null;
    artist_name: string;
    album_image: string | null;
    last_played_at: string;
  }>;
};


async function fetchFavoriteAlbums(userId: string): Promise<ProfileFavoriteItem[]> {
  if (!API_URL) return [];
  try {
    const items = await fetcher<FavoriteAlbumApi[]>(
      `/api/users/${encodeURIComponent(userId)}/favorites`,
    );
    if (!Array.isArray(items)) return [];
    return items.map((f) => ({
      id: f.album_id,
      title: f.name,
      artist: f.artist_name ?? "",
      artworkUrl: f.image_url ?? null,
    }));
  } catch (e) {
    console.warn("[useProfile] favorites", e);
    return [];
  }
}

async function fetchUserLists(userId: string): Promise<UserListSummary[]> {
  if (!API_URL) return [];
  try {
    const { lists } = await fetcher<UserListsApiResponse>(
      `/api/users/${encodeURIComponent(userId)}/lists`,
    );
    return Array.isArray(lists) ? lists : [];
  } catch (e) {
    console.warn("[useProfile] lists", e);
    return [];
  }
}

type ProfileBundleResponse = {
  user: ProfileUser | null;
  favorites: Array<{ album_id: string; position: number; name: string; image_url: string | null }>;
  lists: UserListSummary[];
  recentAlbums: Array<{ album_id: string; album_name: string | null; artist_name: string; album_image: string | null }>;
};

async function loadProfile(userIdentifier?: string): Promise<{
  user: ProfileUser;
  favorites: ProfileFavoriteItem[];
  lists: UserListSummary[];
  recentActivity: ProfileActivityItem[];
  stats: ProfileStats;
}> {
  if (userIdentifier?.trim()) {
    // Other-user profile: fetch user first (need their ID), then parallel data
    const user = await fetcher<ProfileUser>(
      `/api/users/${encodeURIComponent(userIdentifier.trim())}`,
    );
    // Use username (not UUID) for routes that expect username; favorites route accepts both
    const [recentRes, favorites, lists] = await Promise.all([
      fetcher<RecentAlbumsResponse>(
        `/api/recent-albums?user_id=${encodeURIComponent(user.id)}&limit=48`,
      ).catch(() => ({ albums: [] })),
      fetchFavoriteAlbums(user.username),
      fetchUserLists(user.username),
    ]);
    const recentActivity: ProfileActivityItem[] = (recentRes.albums ?? []).map(
      (a) => ({
        id: `play-${a.album_id}`,
        kind: "recent_play",
        title: a.album_name?.trim() || "Album",
        subtitle: a.artist_name || "",
        actionLabel: "Recent play",
        albumId: a.album_id,
        artworkUrl: normalizeAlbumImageUrl(a.album_image),
      }),
    );
    return {
      user,
      favorites,
      lists,
      recentActivity,
      stats: {
        followers: user.followers_count ?? 0,
        following: user.following_count ?? 0,
        reviewCount:
          typeof user.review_count === "number" ? user.review_count : null,
      },
    };
  }

  // Own profile: use /api/users/me (proven working) then parallel individual calls.
  // Avoids /api/me/profile-bundle which has a routing issue in production.
  const me = await fetcher<ProfileUser>("/api/users/me");

  if (!me?.username) {
    throw new Error("Sign in to view your profile.");
  }

  const [recentRes, favorites, lists] = await Promise.all([
    fetcher<RecentAlbumsResponse>(
      `/api/recent-albums?user_id=${encodeURIComponent(me.id)}&limit=48`,
    ).catch(() => ({ albums: [] })),
    fetchFavoriteAlbums(me.username),
    fetchUserLists(me.username),
  ]);

  const recentActivity: ProfileActivityItem[] = (recentRes.albums ?? []).map(
    (a) => ({
      id: `play-${a.album_id}`,
      kind: "recent_play",
      title: a.album_name?.trim() || "Album",
      subtitle: a.artist_name || "",
      actionLabel: "Recent play",
      albumId: a.album_id,
      artworkUrl: normalizeAlbumImageUrl(a.album_image),
    }),
  );

  return {
    user: me,
    favorites,
    lists,
    recentActivity,
    stats: {
      followers: me.followers_count ?? 0,
      following: me.following_count ?? 0,
      reviewCount: typeof me.review_count === "number" ? me.review_count : null,
    },
  };
}

/**
 * Current or other user profile. Uses Supabase session + `public.users` when available,
 * otherwise public `GET /api/users/[username]`.
 */
export function useProfile(userIdentifier?: string) {
  const { session, isLoading: authLoading } = useAuth();

  const enabled =
    typeof userIdentifier === "string" && userIdentifier.trim() !== ""
      ? true
      : !!session && !authLoading;

  const key = queryKeys.profile(userIdentifier ?? "me");

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: key,
    queryFn: () => loadProfile(userIdentifier),
    enabled,
    staleTime: 3 * 60 * 1000,
  });

  return {
    user: data?.user ?? null,
    favorites: data?.favorites ?? [],
    lists: data?.lists ?? [],
    recentActivity: data?.recentActivity ?? [],
    stats:
      data?.stats ??
      ({
        followers: 0,
        following: 0,
        reviewCount: null,
      } satisfies ProfileStats),
    isLoading,
    error,
    refetch,
    isRefetching,
  };
}
