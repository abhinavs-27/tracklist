-- Listening streaks: track consecutive days with at least one listen.

CREATE TABLE IF NOT EXISTS user_streaks (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_listen_date DATE,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE FUNCTION update_user_streak(p_user_id UUID, p_listen_date DATE)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_current INTEGER;
  v_longest INTEGER;
  v_last DATE;
BEGIN
  IF p_listen_date IS NULL THEN
    RETURN;
  END IF;

  SELECT current_streak, longest_streak, last_listen_date
  INTO v_current, v_longest, v_last
  FROM user_streaks
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    INSERT INTO user_streaks (user_id, current_streak, longest_streak, last_listen_date, updated_at)
    VALUES (p_user_id, 1, 1, p_listen_date, now());
    RETURN;
  END IF;

  IF v_last = p_listen_date THEN
    -- Already counted today
    UPDATE user_streaks SET updated_at = now() WHERE user_id = p_user_id;
    RETURN;
  END IF;

  IF v_last = p_listen_date - 1 THEN
    -- Yesterday: increment streak
    v_current := v_current + 1;
    v_longest := GREATEST(v_longest, v_current);
  ELSE
    -- Gap or future: reset to 1
    v_current := 1;
  END IF;

  UPDATE user_streaks
  SET current_streak = v_current,
      longest_streak = v_longest,
      last_listen_date = p_listen_date,
      updated_at = now()
  WHERE user_id = p_user_id;
END;
$$;

-- Trigger: after log insert, update streak for that user/listen date
CREATE OR REPLACE FUNCTION trigger_update_user_streak()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM update_user_streak(NEW.user_id, (NEW.listened_at AT TIME ZONE 'UTC')::date);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS logs_update_streak ON logs;
CREATE TRIGGER logs_update_streak
  AFTER INSERT ON logs
  FOR EACH ROW
  EXECUTE PROCEDURE trigger_update_user_streak();
