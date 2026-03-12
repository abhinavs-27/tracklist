import { createSupabaseServerClient } from './supabase';
import type { LogWithUser } from '@/types';
import { LIMITS } from './validation';

const LOG_COLUMNS =
  'id, user_id, spotify_song_id, played_at, created_at';

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

  const { data: logs, error: logsError } = await supabase
    .from('logs')
    .select(LOG_COLUMNS)
    .in('user_id', followingIds)
    .order('created_at', { ascending: false })
    .limit(cappedLimit);

  if (logsError) throw logsError;
  if (!logs?.length) return [];

  const userIds = [...new Set(logs.map((l) => l.user_id))];
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, username, avatar_url')
    .in('id', userIds);

  if (usersError) {
    throw usersError;
  }

  const userMap = new Map((users ?? []).map((u) => [u.id, u]));

  const logIds = logs.map((l) => l.id);
  const [likesRes, commentsRes, userLikesRes] = await Promise.all([
    supabase.from('likes').select('log_id').in('log_id', logIds),
    supabase.from('comments').select('log_id').in('log_id', logIds),
    supabase.from('likes').select('log_id').eq('user_id', userId).in('log_id', logIds),
  ]);

  if (likesRes.error || commentsRes.error || userLikesRes.error) {
    throw likesRes.error ?? commentsRes.error ?? userLikesRes.error;
  }

  const likeCounts = likesRes.data;
  const commentCounts = commentsRes.data;
  const userLikes = userLikesRes.data;

  const likeCountMap = new Map<string, number>();
  (likeCounts ?? []).forEach((l) => likeCountMap.set(l.log_id, (likeCountMap.get(l.log_id) ?? 0) + 1));
  const commentCountMap = new Map<string, number>();
  (commentCounts ?? []).forEach((c) => commentCountMap.set(c.log_id, (commentCountMap.get(c.log_id) ?? 0) + 1));
  const likedSet = new Set((userLikes ?? []).map((l) => l.log_id));

  return logs.map((log) => ({
    id: log.id,
    user_id: log.user_id,
    spotify_id: log.spotify_song_id,
    type: 'song',
    title: null,
    rating: null,
    review: null,
    listened_at: log.played_at,
    created_at: log.created_at,
    user: userMap.get(log.user_id) ?? null,
    like_count: likeCountMap.get(log.id) ?? 0,
    comment_count: commentCountMap.get(log.id) ?? 0,
    liked: likedSet.has(log.id),
  }));
}
