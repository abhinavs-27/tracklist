-- Thread-based social inbox: music-first conversations anchored to recommendations,
-- taste comparisons, or feed activity. Replies stored here; reactions stay on public.reactions.

CREATE TABLE public.social_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('recommendation', 'taste_comparison', 'activity')),
  anchor_key text NOT NULL UNIQUE,
  music_entity_type text,
  music_entity_id text,
  music_title text,
  music_subtitle text,
  music_image_url text,
  album_id_for_track text,
  reaction_target_type text,
  reaction_target_id text,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.social_thread_participants (
  thread_id uuid NOT NULL REFERENCES public.social_threads (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  PRIMARY KEY (thread_id, user_id)
);

CREATE TABLE public.social_thread_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.social_threads (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  body text NOT NULL CHECK (
    char_length(body) <= 2000
    AND char_length(trim(body)) >= 1
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_social_threads_last_activity ON public.social_threads (last_activity_at DESC);
CREATE INDEX idx_social_participants_user ON public.social_thread_participants (user_id);
CREATE INDEX idx_social_replies_thread_created ON public.social_thread_replies (thread_id, created_at);

ALTER TABLE public.social_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_thread_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_thread_replies ENABLE ROW LEVEL SECURITY;

-- Backfill: recommendation threads from notifications
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
WHERE n.type = 'music_recommendation';

INSERT INTO public.social_thread_participants (thread_id, user_id)
SELECT t.id, n.actor_user_id
FROM public.notifications n
INNER JOIN public.social_threads t ON t.anchor_key = 'notification:' || n.id::text
WHERE n.type = 'music_recommendation'
  AND n.actor_user_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.social_thread_participants (thread_id, user_id)
SELECT t.id, n.user_id
FROM public.notifications n
INNER JOIN public.social_threads t ON t.anchor_key = 'notification:' || n.id::text
WHERE n.type = 'music_recommendation'
ON CONFLICT DO NOTHING;

-- Backfill: taste comparison threads
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
  'taste_comparison',
  'taste:' || l.id::text,
  NULL,
  NULL,
  'Taste comparison',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  l.created_at,
  l.created_at
FROM public.taste_comparison_log l;

INSERT INTO public.social_thread_participants (thread_id, user_id)
SELECT t.id, l.viewer_user_id
FROM public.taste_comparison_log l
INNER JOIN public.social_threads t ON t.anchor_key = 'taste:' || l.id::text
ON CONFLICT DO NOTHING;

INSERT INTO public.social_thread_participants (thread_id, user_id)
SELECT t.id, l.other_user_id
FROM public.taste_comparison_log l
INNER JOIN public.social_threads t ON t.anchor_key = 'taste:' || l.id::text
ON CONFLICT DO NOTHING;
