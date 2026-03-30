-- Repair recommendation threads missed when the API returned before upsert finished
-- (serverless), or any missing participant rows for senders/recipients.

INSERT INTO public.social_threads (
  kind,
  anchor_key,
  music_entity_type,
  music_entity_id,
  music_title,
  music_subtitle,
  music_image_url,
  album_id_for_track,
  reaction_target_type,
  reaction_target_id,
  last_activity_at,
  created_at
)
SELECT
  'recommendation',
  'notification:' || n.id::text,
  n.entity_type,
  n.entity_id,
  NULLIF(trim(COALESCE(n.payload->>'title', '')), ''),
  NULLIF(trim(COALESCE(n.payload->>'subtitle', '')), ''),
  NULLIF(trim(COALESCE(n.payload->>'imageUrl', '')), ''),
  NULLIF(trim(COALESCE(n.payload->>'albumId', '')), ''),
  'notification_recommendation',
  n.id::text,
  n.created_at,
  n.created_at
FROM public.notifications n
WHERE n.type = 'music_recommendation'
  AND NOT EXISTS (
    SELECT 1
    FROM public.social_threads t
    WHERE t.anchor_key = 'notification:' || n.id::text
  );

INSERT INTO public.social_thread_participants (thread_id, user_id)
SELECT t.id, n.actor_user_id
FROM public.notifications n
INNER JOIN public.social_threads t ON t.anchor_key = 'notification:' || n.id::text
WHERE n.type = 'music_recommendation'
  AND n.actor_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.social_thread_participants p
    WHERE p.thread_id = t.id AND p.user_id = n.actor_user_id
  );

INSERT INTO public.social_thread_participants (thread_id, user_id)
SELECT t.id, n.user_id
FROM public.notifications n
INNER JOIN public.social_threads t ON t.anchor_key = 'notification:' || n.id::text
WHERE n.type = 'music_recommendation'
  AND NOT EXISTS (
    SELECT 1
    FROM public.social_thread_participants p
    WHERE p.thread_id = t.id AND p.user_id = n.user_id
  );
