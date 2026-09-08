-- =========================================================================
-- MEVO Sync Legacy Album Data into custom_albums Migration
-- =========================================================================

-- 1. Ensure custom_albums and custom_album_tracks exist
CREATE TABLE IF NOT EXISTS public.custom_albums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT,
  artist TEXT,
  cover_url TEXT,
  cover_image TEXT,
  cover_path TEXT,
  description TEXT,
  type TEXT DEFAULT 'Studio Album',
  collection TEXT DEFAULT 'mahi-edition',
  release_date TEXT,
  published BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.custom_album_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id UUID NOT NULL REFERENCES public.custom_albums(id) ON DELETE CASCADE,
  song_id TEXT NOT NULL,
  track_order INTEGER DEFAULT 0,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(album_id, song_id)
);

CREATE TABLE IF NOT EXISTS public.album_songs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id UUID NOT NULL REFERENCES public.custom_albums(id) ON DELETE CASCADE,
  song_id TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(album_id, song_id)
);

ALTER TABLE public.custom_albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_album_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.album_songs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read custom albums" ON public.custom_albums FOR SELECT USING (true);
CREATE POLICY "Admin all custom albums" ON public.custom_albums FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Public read custom album tracks" ON public.custom_album_tracks FOR SELECT USING (true);
CREATE POLICY "Admin all custom album tracks" ON public.custom_album_tracks FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Public read album songs" ON public.album_songs FOR SELECT USING (true);
CREATE POLICY "Admin all album songs" ON public.album_songs FOR ALL USING (true) WITH CHECK (true);

-- 2. Insert distinct legacy albums from songs table into custom_albums
INSERT INTO public.custom_albums (title, slug, artist, cover_url, cover_image, type, published)
SELECT 
  trimmed_album.album_title AS title,
  lower(regexp_replace(trimmed_album.album_title, '[^a-zA-Z0-9]+', '-', 'g')) AS slug,
  COALESCE(first_song.artist, first_song.artist_name, 'Munem Mahi') AS artist,
  COALESCE(first_song.cover_image, first_song.cover_url) AS cover_url,
  COALESCE(first_song.cover_image, first_song.cover_url) AS cover_image,
  'Studio Album' AS type,
  true AS published
FROM (
  SELECT DISTINCT TRIM(album) AS album_title
  FROM public.songs
  WHERE album IS NOT NULL 
    AND TRIM(album) != '' 
    AND LOWER(TRIM(album)) NOT IN ('singles', 'single', 'unknown', 'unknown album', 'youtube')
) trimmed_album
CROSS JOIN LATERAL (
  SELECT artist, artist_name, cover_image, cover_url
  FROM public.songs
  WHERE TRIM(album) = trimmed_album.album_title
  ORDER BY created_at ASC
  LIMIT 1
) first_song
WHERE NOT EXISTS (
  SELECT 1 FROM public.custom_albums ca 
  WHERE LOWER(TRIM(ca.title)) = LOWER(trimmed_album.album_title)
);

-- 3. Populate custom_album_tracks junction table
INSERT INTO public.custom_album_tracks (album_id, song_id, track_order, position)
SELECT 
  ca.id AS album_id,
  s.id AS song_id,
  (ROW_NUMBER() OVER (PARTITION BY ca.id ORDER BY s.created_at ASC) - 1) AS track_order,
  (ROW_NUMBER() OVER (PARTITION BY ca.id ORDER BY s.created_at ASC) - 1) AS position
FROM public.songs s
JOIN public.custom_albums ca ON LOWER(TRIM(ca.title)) = LOWER(TRIM(s.album))
WHERE s.album IS NOT NULL AND TRIM(s.album) != ''
ON CONFLICT (album_id, song_id) DO NOTHING;

-- 4. Populate legacy album_songs junction table
INSERT INTO public.album_songs (album_id, song_id, position)
SELECT 
  ca.id AS album_id,
  s.id AS song_id,
  (ROW_NUMBER() OVER (PARTITION BY ca.id ORDER BY s.created_at ASC) - 1) AS position
FROM public.songs s
JOIN public.custom_albums ca ON LOWER(TRIM(ca.title)) = LOWER(TRIM(s.album))
WHERE s.album IS NOT NULL AND TRIM(s.album) != ''
ON CONFLICT (album_id, song_id) DO NOTHING;
