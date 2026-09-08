-- =========================================================================
-- MEVO Custom Albums & Album Tracks Schema Migration
-- =========================================================================

-- 1. Create custom_albums table
CREATE TABLE IF NOT EXISTS public.custom_albums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT,
  artist TEXT,
  cover_url TEXT,
  cover_image TEXT,
  cover_path TEXT,
  description TEXT,
  type TEXT DEFAULT 'Custom Album', -- 'Studio Album', 'Artist EP', 'Mix', 'Custom Album'
  collection TEXT DEFAULT 'mahi-edition',
  release_date TEXT,
  published BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create custom_album_tracks table
CREATE TABLE IF NOT EXISTS public.custom_album_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id UUID NOT NULL REFERENCES public.custom_albums(id) ON DELETE CASCADE,
  song_id TEXT NOT NULL,
  track_order INTEGER DEFAULT 0,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(album_id, song_id)
);

-- 3. Create album_songs table (or alias compatibility)
CREATE TABLE IF NOT EXISTS public.album_songs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id UUID NOT NULL REFERENCES public.custom_albums(id) ON DELETE CASCADE,
  song_id TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(album_id, song_id)
);

-- 4. Indexes for high performance
CREATE INDEX IF NOT EXISTS idx_custom_albums_slug ON public.custom_albums(slug);
CREATE INDEX IF NOT EXISTS idx_custom_albums_collection ON public.custom_albums(collection);
CREATE INDEX IF NOT EXISTS idx_custom_albums_published ON public.custom_albums(published);
CREATE INDEX IF NOT EXISTS idx_custom_albums_created_at ON public.custom_albums(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_custom_album_tracks_album_id ON public.custom_album_tracks(album_id);
CREATE INDEX IF NOT EXISTS idx_album_songs_album_id ON public.album_songs(album_id);

-- 5. Enable Row Level Security (RLS)
ALTER TABLE public.custom_albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_album_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.album_songs ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies
-- Custom Albums
CREATE POLICY "Public read custom albums" ON public.custom_albums FOR SELECT USING (true);
CREATE POLICY "Admin all custom albums" ON public.custom_albums FOR ALL USING (true) WITH CHECK (true);

-- Custom Album Tracks
CREATE POLICY "Public read custom album tracks" ON public.custom_album_tracks FOR SELECT USING (true);
CREATE POLICY "Admin all custom album tracks" ON public.custom_album_tracks FOR ALL USING (true) WITH CHECK (true);

-- Album Songs (Compatibility)
CREATE POLICY "Public read album songs" ON public.album_songs FOR SELECT USING (true);
CREATE POLICY "Admin all album songs" ON public.album_songs FOR ALL USING (true) WITH CHECK (true);
