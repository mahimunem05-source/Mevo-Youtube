ALTER TABLE public.songs
  ADD COLUMN IF NOT EXISTS track_number integer,
  ADD COLUMN IF NOT EXISTS disc_number integer,
  ADD COLUMN IF NOT EXISTS original_filename text,
  ADD COLUMN IF NOT EXISTS audio_mime text,
  ADD COLUMN IF NOT EXISTS audio_size bigint,
  ADD COLUMN IF NOT EXISTS audio_hash text,
  ADD COLUMN IF NOT EXISTS audio_path text,
  ADD COLUMN IF NOT EXISTS cover_path text;

CREATE INDEX IF NOT EXISTS songs_title_lower_idx ON public.songs (lower(title));
CREATE INDEX IF NOT EXISTS songs_artist_lower_idx ON public.songs (lower(artist_name));
CREATE INDEX IF NOT EXISTS songs_album_lower_idx ON public.songs (lower(album));
CREATE INDEX IF NOT EXISTS songs_section_idx ON public.songs (section);
CREATE INDEX IF NOT EXISTS songs_created_at_idx ON public.songs (created_at DESC);
CREATE INDEX IF NOT EXISTS songs_audio_hash_idx ON public.songs (audio_hash);
CREATE INDEX IF NOT EXISTS songs_audio_size_idx ON public.songs (audio_size);