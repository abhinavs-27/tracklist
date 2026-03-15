-- Achievements and user_achievements. Seed rows and grant logic.

CREATE TABLE IF NOT EXISTS achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT
);

CREATE TABLE IF NOT EXISTS user_achievements (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);

-- Seed achievement definitions (ids stable for grant logic)
INSERT INTO achievements (id, name, description, icon) VALUES
  ('a0000001-0001-0001-0001-000000000001', 'First Listen', 'Log your first track', '🎵'),
  ('a0000001-0001-0001-0001-000000000002', 'Getting Started', '10 listens', '🎧'),
  ('a0000001-0001-0001-0001-000000000003', 'Music Lover', '100 listens', '❤️'),
  ('a0000001-0001-0001-0001-000000000004', 'Critic', 'Write your first review', '⭐'),
  ('a0000001-0001-0001-0001-000000000005', 'Curator', 'Create your first list', '📋'),
  ('a0000001-0001-0001-0001-000000000006', 'Week Streak', '7 day listening streak', '🔥'),
  ('a0000001-0001-0001-0001-000000000007', 'Month Streak', '30 day listening streak', '🏆')
ON CONFLICT (id) DO NOTHING;

-- Grant achievements when thresholds are reached (call from app after log/review/list/streak update).
CREATE OR REPLACE FUNCTION grant_achievements_on_listen(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_listen_count INTEGER;
  v_streak INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER INTO v_listen_count FROM logs WHERE user_id = p_user_id;
  IF v_listen_count >= 1 THEN
    INSERT INTO user_achievements (user_id, achievement_id) VALUES (p_user_id, 'a0000001-0001-0001-0001-000000000001')
    ON CONFLICT (user_id, achievement_id) DO NOTHING;
  END IF;
  IF v_listen_count >= 10 THEN
    INSERT INTO user_achievements (user_id, achievement_id) VALUES (p_user_id, 'a0000001-0001-0001-0001-000000000002')
    ON CONFLICT (user_id, achievement_id) DO NOTHING;
  END IF;
  IF v_listen_count >= 100 THEN
    INSERT INTO user_achievements (user_id, achievement_id) VALUES (p_user_id, 'a0000001-0001-0001-0001-000000000003')
    ON CONFLICT (user_id, achievement_id) DO NOTHING;
  END IF;

  SELECT current_streak INTO v_streak FROM user_streaks WHERE user_id = p_user_id;
  IF v_streak >= 7 THEN
    INSERT INTO user_achievements (user_id, achievement_id) VALUES (p_user_id, 'a0000001-0001-0001-0001-000000000006')
    ON CONFLICT (user_id, achievement_id) DO NOTHING;
  END IF;
  IF v_streak >= 30 THEN
    INSERT INTO user_achievements (user_id, achievement_id) VALUES (p_user_id, 'a0000001-0001-0001-0001-000000000007')
    ON CONFLICT (user_id, achievement_id) DO NOTHING;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION grant_achievement_on_review(p_user_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO user_achievements (user_id, achievement_id) VALUES (p_user_id, 'a0000001-0001-0001-0001-000000000004')
  ON CONFLICT (user_id, achievement_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION grant_achievement_on_list(p_user_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO user_achievements (user_id, achievement_id) VALUES (p_user_id, 'a0000001-0001-0001-0001-000000000005')
  ON CONFLICT (user_id, achievement_id) DO NOTHING;
END;
$$;
