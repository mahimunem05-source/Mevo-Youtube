DROP VIEW IF EXISTS public.song_engagement_stats;

CREATE TABLE IF NOT EXISTS public.song_engagement (
  song_id UUID NOT NULL PRIMARY KEY REFERENCES public.songs(id) ON DELETE CASCADE,
  valid_plays INTEGER NOT NULL DEFAULT 0,
  recent_valid_plays INTEGER NOT NULL DEFAULT 0,
  completed_plays INTEGER NOT NULL DEFAULT 0,
  skips INTEGER NOT NULL DEFAULT 0,
  repeat_plays INTEGER NOT NULL DEFAULT 0,
  total_listened_seconds BIGINT NOT NULL DEFAULT 0,
  unique_sessions INTEGER NOT NULL DEFAULT 0,
  last_play_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.song_engagement TO anon, authenticated;
GRANT ALL ON public.song_engagement TO service_role;

ALTER TABLE public.song_engagement ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read engagement summary" ON public.song_engagement
  FOR SELECT TO anon, authenticated USING (true);

-- Recomputes one song's aggregates from the raw anonymous events.
CREATE OR REPLACE FUNCTION public.refresh_song_engagement(_song_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.song_engagement AS se (
    song_id, valid_plays, recent_valid_plays, completed_plays, skips,
    repeat_plays, total_listened_seconds, unique_sessions, last_play_at, updated_at
  )
  SELECT
    _song_id,
    COALESCE(SUM(CASE WHEN e.is_valid_play THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN e.is_valid_play AND e.created_at > now() - INTERVAL '7 days' THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN e.completed THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN e.is_skip THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN e.is_repeat THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(e.listened_seconds), 0),
    COUNT(DISTINCT e.session_id),
    MAX(e.created_at),
    now()
  FROM public.song_play_events e
  WHERE e.song_id = _song_id
  ON CONFLICT (song_id) DO UPDATE SET
    valid_plays = EXCLUDED.valid_plays,
    recent_valid_plays = EXCLUDED.recent_valid_plays,
    completed_plays = EXCLUDED.completed_plays,
    skips = EXCLUDED.skips,
    repeat_plays = EXCLUDED.repeat_plays,
    total_listened_seconds = EXCLUDED.total_listened_seconds,
    unique_sessions = EXCLUDED.unique_sessions,
    last_play_at = EXCLUDED.last_play_at,
    updated_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refresh_song_engagement(UUID) FROM anon, authenticated, public;

CREATE OR REPLACE FUNCTION public.on_song_play_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_song_engagement(NEW.song_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS song_play_events_aggregate ON public.song_play_events;
CREATE TRIGGER song_play_events_aggregate AFTER INSERT ON public.song_play_events
  FOR EACH ROW EXECUTE FUNCTION public.on_song_play_event();

-- Every song gets an engagement row so ranking reads are simple.
CREATE OR REPLACE FUNCTION public.on_song_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.song_engagement (song_id) VALUES (NEW.id)
  ON CONFLICT (song_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS songs_create_engagement ON public.songs;
CREATE TRIGGER songs_create_engagement AFTER INSERT ON public.songs
  FOR EACH ROW EXECUTE FUNCTION public.on_song_created();

INSERT INTO public.song_engagement (song_id)
SELECT id FROM public.songs
ON CONFLICT (song_id) DO NOTHING;