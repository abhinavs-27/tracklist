import { useQuery } from "@tanstack/react-query";
import { fetcher } from "../api";
import { queryKeys } from "../query-keys";
import { supabase } from "../supabase";
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

export type ProfileListSummary = {
  id: string;
  title: string;
  description: string | null;
  item_count: number;
  created_at: string;
};

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

type ListsResponse = { lists: ProfileListSummary[] };

function syntheticUserFromAuth(sessionUser: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}): ProfileUser {
  const meta = sessionUser.user_metadata ?? {};
  const name =
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    sessionUser.email?.split("@")[0] ||
    "user";
  const pic =
    (typeof meta.avatar_url === "string" && meta.avatar_url) ||
    (typeof meta.picture === "string" && meta.picture) ||
    null;
  return {
    id: sessionUser.id,
    username: name.replace(/\s+/g, "_").slice(0, 20) || "user",
    avatar_url: pic,
    bio: null,
    created_at: new Date().toISOString(),
    followers_count: 0,
    following_count: 0,
    is_following: false,
    is_own_profile: true,
  };
}

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

async function fetchUserLists(userId: string): Promise<ProfileListSummary[]> {
  if (!API_URL) return [];
  try {
    const { lists } = await fetcher<ListsResponse>(
      `/api/users/${encodeURIComponent(userId)}/lists`,
    );
    return Array.isArray(lists) ? lists : [];
  } catch (e) {
    console.warn("[useProfile] lists", e);
    return [];
  }
}

async function loadProfile(userIdentifier?: string): Promise<{
  user: ProfileUser;
  favorites: ProfileFavoriteItem[];
  lists: ProfileListSummary[];
  recentActivity: ProfileActivityItem[];
  stats: ProfileStats;
}> {
  if (userIdentifier?.trim()) {
    const user = await fetcher<ProfileUser>(
      `/api/users/${encodeURIComponent(userIdentifier.trim())}`,
    );
    const [recentRes, favorites, lists] = await Promise.all([
      fetcher<RecentAlbumsResponse>(
        `/api/recent-albums?user_id=${encodeURIComponent(user.id)}`,
      ).catch(() => ({ albums: [] })),
      fetchFavoriteAlbums(user.id),
      fetchUserLists(user.id),
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

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) {
    throw new Error("Sign in to view your profile.");
  }

  const email = session.user.email;
  if (!email) {
    throw new Error("Sign in to view your profile.");
  }

  const { data: row } = await supabase
    .from("users")
    .select("id, username")
    .eq("email", email)
    .maybeSingle();

  let user: ProfileUser;

  if (row?.username) {
    user = await fetcher<ProfileUser>(
      `/api/users/${encodeURIComponent(row.username)}`,
    );
  } else {
    user = syntheticUserFromAuth(session.user);
  }

  const userIdForRecent = row?.id ?? user.id;

  const [recentRes, favorites, lists] = await Promise.all([
    fetcher<RecentAlbumsResponse>(
      `/api/recent-albums?user_id=${encodeURIComponent(userIdForRecent)}`,
    ).catch(() => ({ albums: [] })),
    fetchFavoriteAlbums(userIdForRecent),
    fetchUserLists(userIdForRecent),
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

  const stats: ProfileStats = {
    followers: user.followers_count ?? 0,
    following: user.following_count ?? 0,
    reviewCount:
      typeof user.review_count === "number" ? user.review_count : null,
  };

  return {
    user,
    favorites,
    lists,
    recentActivity,
    stats,
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

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: key,
    queryFn: () => loadProfile(userIdentifier),
    enabled,
    staleTime: 30 * 1000,
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
  };
}
