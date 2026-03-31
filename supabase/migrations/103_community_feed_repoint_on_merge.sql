-- Repoint community_feed JSON payloads when canonical track/artist UUIDs merge.
-- Invoked from app merge helpers via RPC (service_role only).

CREATE OR REPLACE FUNCTION public.repoint_community_feed_track_merge(p_loser uuid, p_winner uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_loser = p_winner THEN RETURN; END IF;

  UPDATE community_feed
  SET payload = jsonb_set(payload, '{track_id}', to_jsonb(p_winner::text), true)
  WHERE event_type = 'listen'
    AND (payload->>'track_id') IS NOT NULL
    AND (payload->>'track_id') = p_loser::text;

  UPDATE community_feed
  SET payload = jsonb_set(payload, '{entity_id}', to_jsonb(p_winner::text), true)
  WHERE event_type = 'review'
    AND (payload->>'entity_type') = 'song'
    AND (payload->>'entity_id') = p_loser::text;

  UPDATE community_feed
  SET payload = jsonb_set(payload, '{entity_id}', to_jsonb(p_winner::text), true)
  WHERE event_type = 'list_update'
    AND (payload->>'entity_type') = 'song'
    AND (payload->>'entity_id') = p_loser::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.repoint_community_feed_artist_merge(p_loser uuid, p_winner uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_loser = p_winner THEN RETURN; END IF;

  UPDATE community_feed
  SET payload = jsonb_set(payload, '{artist_id}', to_jsonb(p_winner::text), true)
  WHERE event_type = 'listen'
    AND (payload->>'artist_id') IS NOT NULL
    AND (payload->>'artist_id') = p_loser::text;

  UPDATE community_feed
  SET payload = jsonb_set(payload, '{entity_id}', to_jsonb(p_winner::text), true)
  WHERE event_type = 'review'
    AND (payload->>'entity_type') = 'artist'
    AND (payload->>'entity_id') = p_loser::text;
END;
$$;

REVOKE ALL ON FUNCTION public.repoint_community_feed_track_merge(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.repoint_community_feed_artist_merge(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repoint_community_feed_track_merge(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.repoint_community_feed_artist_merge(uuid, uuid) TO service_role;
