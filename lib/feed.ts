import { createSupabaseServerClient } from './supabase';
import type { LogWithUser } from '@/types';
import { LIMITS } from './validation';

const LOG_COLUMNS =
  'id, user_id, spotify_song_id, played_at, created_at, user:users(id, email, username, avatar_url, bio, created_at), likes(count), comments(count)';

export async function getFeedForUser(userId: string, limit = 50): Promise<LogWithUser[]> {
  const supabase = createSupabaseServerClient();

  const { data: followings, error: followError } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', userId);

  if (followError) throw followError;

  const rawFollowingIds = (followings ?? []).map((f) => f.following_id);
  const followingIds = rawFollowingIds.slice(0, LIMITS.FOLLOWING_IDS_CAP);
  if (followingIds.length === 0) {
    return [];
  }

  const cappedLimit = Math.min(limit, LIMITS.FEED_LIMIT);

  // BOLT OPTIMIZATION: Use resource embedding to fetch logs, authors, and aggregate counts in ONE query.
  // This reduces what was 4+ sequential/parallel queries into 1 (after follow check), and offloads counting to the database.
  const { data: logs, error: logsError } = await supabase
    .from('logs')
    .select(LOG_COLUMNS)
    .in('user_id', followingIds)
    .order('created_at', { ascending: false })
    .limit(cappedLimit);

  if (logsError) throw logsError;
  if (!logs?.length) return [];

  // BOLT OPTIMIZATION: Check if the user liked any of these logs in a single small query.
  const logIds = logs.map((l) => l.id);
  const { data: userLikes, error: userLikesError } = await supabase
    .from('likes')
    .select('log_id')
    .eq('user_id', userId)
    .in('log_id', logIds);

  if (userLikesError) throw userLikesError;
  const likedSet = new Set((userLikes ?? []).map((l) => l.log_id));

  interface SupabaseLogResponse {
    id: string;
    user_id: string;
    spotify_song_id: string;
    played_at: string;
    created_at: string;
    user: LogWithUser['user'];
    likes: { count: number }[];
    comments: { count: number }[];
  }

  return (logs as unknown as SupabaseLogResponse[]).map((log) => ({
    id: log.id,
    user_id: log.user_id,
    spotify_id: log.spotify_song_id,
    type: 'song',
    title: null,
    rating: null,
    review: null,
    listened_at: log.played_at,
    created_at: log.created_at,
    user: log.user,
    like_count: log.likes?.[0]?.count ?? 0,
    comment_count: log.comments?.[0]?.count ?? 0,
    liked: likedSet.has(log.id),
  }));
}
