import { getSupabase } from "../lib/supabase";
import { sanitizeString } from "../lib/validation";

const USER_SEARCH_QUERY_MAX_LENGTH = 50;

export async function searchUsers(
  query: string,
  limit = 20,
  excludeUserId: string | null = null,
): Promise<
  {
    id: string;
    username: string;
    avatar_url: string | null;
    followers_count: number;
  }[]
> {
  try {
    const supabase = getSupabase();
    const sanitized = sanitizeString(query, USER_SEARCH_QUERY_MAX_LENGTH) ?? "";
    if (sanitized.length < 2) return [];

    const cappedLimit = Math.min(Math.max(1, limit), 50);

    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "get_user_search",
      {
        p_query: sanitized,
        p_limit: cappedLimit,
        p_exclude_user_id: excludeUserId || null,
      },
    );

    if (!rpcError && Array.isArray(rpcData)) {
      return (
        rpcData as {
          id: string;
          username: string;
          avatar_url: string | null;
          followers_count: number;
        }[]
      ).map((r) => ({
        id: r.id,
        username: r.username,
        avatar_url: r.avatar_url ?? null,
        followers_count: Number(r.followers_count) || 0,
      }));
    }

    if (rpcError) {
      console.warn(
        "[userSearch] get_user_search RPC failed, using fallback:",
        rpcError.message,
      );
    }

    let q = supabase
      .from("users")
      .select("id, username, avatar_url")
      .ilike("username", `%${sanitized}%`)
      .order("username", { ascending: true })
      .limit(cappedLimit);
    if (excludeUserId) q = q.neq("id", excludeUserId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((u) => ({
      id: u.id,
      username: u.username,
      avatar_url: u.avatar_url ?? null,
      followers_count: 0,
    }));
  } catch (e) {
    console.error("[userSearch] searchUsers failed:", e);
    return [];
  }
}
