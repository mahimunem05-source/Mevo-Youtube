-- =========================
-- CORE CATALOGUE
-- =========================
CREATE TABLE IF NOT EXISTS public.songs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  album TEXT,
  genre TEXT,
  section TEXT NOT NULL DEFAULT 'bangla-beats',
  duration INTEGER NOT NULL DEFAULT 0,
  cover_image TEXT,
  audio_file TEXT NOT NULL,
  release_date DATE,
  play_count INTEGER NOT NULL DEFAULT 0,
  published BOOLEAN NOT NULL DEFAULT true,
  published_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  admin_pinned_position INTEGER,
  admin_manual_order INTEGER,
  admin_boost NUMERIC NOT NULL DEFAULT 0,
  admin_excluded BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.songs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.songs TO authenticated;
GRANT ALL ON public.songs TO service_role;

ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.admins (
  user_id UUID NOT NULL PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admins TO authenticated;
GRANT ALL ON public.admins TO service_role;

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their own admin row" ON public.admins
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.admins WHERE user_id = _user_id)
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin(UUID) FROM anon, authenticated, public;

CREATE POLICY "Anyone can view published songs" ON public.songs
  FOR SELECT TO anon, authenticated USING (published = true);

CREATE POLICY "Admins can view all songs" ON public.songs
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert songs" ON public.songs
  FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update songs" ON public.songs
  FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete songs" ON public.songs
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS update_songs_updated_at ON public.songs;
CREATE TRIGGER update_songs_updated_at BEFORE UPDATE ON public.songs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- published_at must never move when metadata is edited.
CREATE OR REPLACE FUNCTION public.freeze_song_published_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.published_at = OLD.published_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS freeze_songs_published_at ON public.songs;
CREATE TRIGGER freeze_songs_published_at BEFORE UPDATE ON public.songs
  FOR EACH ROW EXECUTE FUNCTION public.freeze_song_published_at();

-- =========================
-- TRENDING (admin manual selection/order)
-- =========================
CREATE TABLE IF NOT EXISTS public.trending_songs (
  song_id UUID NOT NULL PRIMARY KEY REFERENCES public.songs(id) ON DELETE CASCADE,
  display_order INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.trending_songs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trending_songs TO authenticated;
GRANT ALL ON public.trending_songs TO service_role;

ALTER TABLE public.trending_songs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view trending selection" ON public.trending_songs
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Admins can manage trending selection" ON public.trending_songs
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- =========================
-- ANONYMOUS PLAYBACK EVENTS
-- =========================
CREATE TABLE IF NOT EXISTS public.song_play_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  song_id UUID NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  listened_seconds INTEGER NOT NULL DEFAULT 0,
  song_duration INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT false,
  is_valid_play BOOLEAN NOT NULL DEFAULT false,
  is_skip BOOLEAN NOT NULL DEFAULT false,
  is_repeat BOOLEAN NOT NULL DEFAULT false,
  event_bucket TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT date_trunc('hour', now()),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Spam / refresh protection: one stored event per song, per anonymous
-- session, per hour bucket. Duplicates are rejected by the unique index.
CREATE UNIQUE INDEX IF NOT EXISTS song_play_events_dedupe_idx
  ON public.song_play_events (song_id, session_id, event_bucket);

CREATE INDEX IF NOT EXISTS song_play_events_song_created_idx
  ON public.song_play_events (song_id, created_at DESC);

GRANT INSERT ON public.song_play_events TO anon, authenticated;
GRANT ALL ON public.song_play_events TO service_role;

ALTER TABLE public.song_play_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can record an anonymous play event" ON public.song_play_events
  FOR INSERT TO anon, authenticated WITH CHECK (
    char_length(session_id) BETWEEN 8 AND 64
    AND listened_seconds >= 0
    AND listened_seconds <= 86400
    AND song_duration >= 0
    AND event_bucket = date_trunc('hour', now())
  );

-- =========================
-- AGGREGATED ENGAGEMENT (public read)
-- =========================
CREATE OR REPLACE VIEW public.song_engagement_stats
WITH (security_invoker = false) AS
SELECT
  s.id AS song_id,
  COALESCE(SUM(CASE WHEN e.is_valid_play THEN 1 ELSE 0 END), 0)::INTEGER AS valid_plays,
  COALESCE(SUM(CASE WHEN e.is_valid_play AND e.created_at > now() - INTERVAL '7 days' THEN 1 ELSE 0 END), 0)::INTEGER AS recent_valid_plays,
  COALESCE(SUM(CASE WHEN e.completed THEN 1 ELSE 0 END), 0)::INTEGER AS completed_plays,
  COALESCE(SUM(CASE WHEN e.is_skip THEN 1 ELSE 0 END), 0)::INTEGER AS skips,
  COALESCE(SUM(CASE WHEN e.is_repeat THEN 1 ELSE 0 END), 0)::INTEGER AS repeat_plays,
  COALESCE(SUM(e.listened_seconds), 0)::BIGINT AS total_listened_seconds,
  COUNT(DISTINCT e.session_id)::INTEGER AS unique_sessions,
  MAX(e.created_at) AS last_play_at
FROM public.songs s
LEFT JOIN public.song_play_events e ON e.song_id = s.id
GROUP BY s.id;

GRANT SELECT ON public.song_engagement_stats TO anon, authenticated;
GRANT ALL ON public.song_engagement_stats TO service_role;