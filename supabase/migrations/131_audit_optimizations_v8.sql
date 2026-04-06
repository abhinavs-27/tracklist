-- Migration 131: Audit optimizations v8
-- Optimized composite indexes based on query analysis.

-- feed_events: Optimize fetching personal/following feeds and discovery lookups.
CREATE INDEX IF NOT EXISTS idx_feed_events_user_created_at ON feed_events(user_id, created_at DESC);

-- community_weekly_charts: Optimize lookup of charts by type and week for a community.
CREATE INDEX IF NOT EXISTS idx_community_weekly_charts_lookup ON community_weekly_charts(community_id, chart_type, week_start DESC);

-- community_members: Optimize roster retrieval and management by role and join date.
CREATE INDEX IF NOT EXISTS idx_community_members_roster ON community_members(community_id, role, created_at);
